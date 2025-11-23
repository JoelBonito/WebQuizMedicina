// Vercel Serverless Function for generating medical quiz questions
// Migrated from Supabase Edge Functions with context caching support

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  callGeminiWithUsage,
  parseJsonFromResponse,
} from './lib/gemini';
import { sanitizeString } from './lib/sanitization';
import {
  calculateBatchSizes,
  formatBatchProgress,
  SAFE_OUTPUT_LIMIT,
} from './lib/output-limits';
import {
  createContextCache,
  safeDeleteCache,
} from './lib/gemini-cache';

// CORS configuration
const ALLOWED_ORIGINS = [
  'https://web-quiz-medicina.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get Gemini API key from environment
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Authenticate with Supabase
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Parse request body
    const { source_id, source_ids, project_id, count, difficulty } = req.body;

    if (!source_id && !source_ids && !project_id) {
      return res.status(400).json({ error: 'source_id, source_ids, or project_id required' });
    }

    if (!count || count < 1 || count > 200) {
      return res.status(400).json({ error: 'count must be between 1 and 200' });
    }

    // Fetch sources with priority logic
    let sources = [];

    if (source_ids && Array.isArray(source_ids) && source_ids.length > 0) {
      // User selected specific sources
      console.log(`📊 [Quiz] Fetching ${source_ids.length} user-selected sources`);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .in('id', source_ids)
        .eq('status', 'ready');

      if (error) throw error;
      sources = data || [];
      console.log(`✅ [Quiz] Found ${sources.length} selected sources`);
    } else if (source_id) {
      // Single source
      console.log(`📊 [Quiz] Fetching single source: ${source_id}`);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('id', source_id)
        .single();

      if (error) throw error;
      sources = [data];
      console.log(`✅ [Quiz] Found 1 source`);
    } else if (project_id) {
      // All project sources
      console.log(`📊 [Quiz] Fetching all sources from project: ${project_id}`);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('project_id', project_id)
        .eq('status', 'ready')
        .order('created_at', { ascending: false });

      if (error) throw error;
      sources = data || [];
      console.log(`✅ [Quiz] Found ${sources.length} sources in project`);
    }

    if (sources.length === 0) {
      throw new Error('No sources found');
    }

    // CRITICAL: Quiz uses FULL extracted_content (comprehensive assessment)
    // Limit to 5 most recent sources to keep input manageable (~300k chars / ~75k tokens)
    const MAX_SOURCES = 5;
    const usedSources = sources.slice(0, MAX_SOURCES);

    let combinedContent = '';
    console.log('📝 [Quiz] Using full extracted_content (comprehensive assessment of all material)');

    for (const source of usedSources) {
      if (source.extracted_content) {
        const sanitizedContent = sanitizeString(source.extracted_content);
        combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizedContent}`;
      }
    }

    // Truncate if content exceeds safe limit for input (~300k chars / ~75k tokens)
    const MAX_CONTENT_LENGTH = 300000;
    if (combinedContent.length > MAX_CONTENT_LENGTH) {
      console.warn(`⚠️ [Quiz] Truncating content from ${combinedContent.length} to ${MAX_CONTENT_LENGTH} chars`);
      combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH);
    }

    console.log(`📊 [Quiz] Using ${usedSources.length} sources: ${combinedContent.length} chars (~${Math.ceil(combinedContent.length / 4)} tokens)`);

    if (!combinedContent.trim()) {
      throw new Error('No content available to generate quiz');
    }

    // Calculate batches
    const batchSizes = calculateBatchSizes('QUIZ_MULTIPLE_CHOICE', count);
    const totalBatches = batchSizes.length;

    console.log(`🔄 [Quiz] Processing in ${totalBatches} batch(es): ${batchSizes.join(', ')} questions each`);

    // Generate unique session_id
    const sessionId = crypto.randomUUID();
    console.log(`📝 [Quiz] Session ID: ${sessionId}`);

    // Track token usage across all batches
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;

    const allQuestions: any[] = [];

    // Create context cache if multiple batches (saves ~95% on input tokens)
    let cacheName: string | null = null;
    const useCache = totalBatches > 1;

    try {
      if (useCache) {
        console.log(`💰 [CACHE] Creating cache for ${totalBatches} batches to save ~95% on input tokens`);

        const cacheContent = `CONTEÚDO MÉDICO BASE PARA GERAÇÃO DE QUESTÕES:

${combinedContent}

---
Este conteúdo será usado como base para gerar questões de medicina.
Todas as questões devem se basear EXCLUSIVAMENTE neste conteúdo.`;

        const cacheInfo = await createContextCache(
          cacheContent,
          geminiApiKey,
          'gemini-2.5-flash',
          {
            ttlSeconds: 600, // 10 minutes - enough for batch processing
            displayName: `quiz-${sessionId}`
          }
        );

        cacheName = cacheInfo.name;
        console.log(`✅ [CACHE] Cache created: ${cacheName}`);
      }

      // Generate questions in batches
      for (let i = 0; i < batchSizes.length; i++) {
        const batchCount = batchSizes[i];
        const batchNum = i + 1;

        console.log(`${formatBatchProgress(batchNum, totalBatches)} Generating ${batchCount} questions...`);

        // Prompt WITHOUT content when using cache (content is in cache)
        // Prompt WITH content when NOT using cache (single batch)
        const prompt = `Você é um professor universitário de MEDICINA criando uma prova.
Gere ${batchCount} questões baseadas no CONTEÚDO ${useCache ? 'já fornecido no contexto' : 'abaixo'}.

${!useCache ? `CONTEÚDO BASE:
${combinedContent}

` : ''}REGRA CRÍTICA DE DIVERSIFICAÇÃO:
- DISTRIBUA as questões entre DIFERENTES TÓPICOS identificados no conteúdo
- EVITE concentrar mais de 30% das questões em um único tópico
- Se o conteúdo cobre múltiplos tópicos (ex: Cardiologia, Pneumologia, Endocrinologia), espalhe as questões proporcionalmente
- Exemplo: Para 10 questões com 3 tópicos, faça aproximadamente 3-4 questões de cada tópico

TIPOS DE QUESTÃO (Varie):
1. "multipla_escolha": Conceitos diretos.
2. "verdadeiro_falso": Julgue a afirmação (Opções: [Verdadeiro, Falso]).
3. "citar": "Qual destes é um exemplo de..." (4 opções).
4. "caso_clinico": Cenário curto + conduta.

REGRAS DE FORMATO (Rígidas):
- TODAS as questões devem ter APENAS UMA alternativa correta.
- Opções devem ser sempre arrays de strings: ["A) Texto", "B) Texto"...] ou ["Verdadeiro", "Falso"].

REGRAS PARA A JUSTIFICATIVA (Obrigatório):
Quero uma justificativa CURTA que valide a resposta certa usando o texto fornecido.
1. CITE A FONTE: Comece frases com "Segundo o texto...", "O material indica que...", "Conforme a fonte...".
2. TRADUZA: Se o conteúdo base estiver em inglês ou outro idioma, a justificativa DEVE ser escrita inteiramente em PORTUGUÊS DO BRASIL.
3. CONCISÃO: Máximo de 2 a 3 frases. Vá direto ao ponto do porquê aquela opção é a correta baseada na leitura.
${difficulty ? `
DIFICULDADE: TODAS as questões devem ser de nível "${difficulty}".` : ''}

FORMATO JSON:
{
  "perguntas": [
    {
      "tipo": "multipla_escolha",
      "pergunta": "Qual o tratamento de primeira linha para...",
      "opcoes": ["A) Opção A", "B) Opção B", "C) Opção C", "D) Opção D"],
      "resposta_correta": "A",
      "justificativa": "Conforme o texto, a Opção A é a primeira linha devido à sua eficácia comprovada na redução da mortalidade. O material destaca que as outras drogas só devem ser usadas se houver contraindicação.",
      "dica": "Pense na droga que reduz a mortalidade a longo prazo.",
      "dificuldade": "${difficulty || 'médio'}",
      "topico": "Cardiologia"
    }
  ]
}`;

        const result = await callGeminiWithUsage(
          prompt,
          geminiApiKey,
          'gemini-2.5-flash',
          SAFE_OUTPUT_LIMIT,
          true,
          cacheName || undefined
        );

        // Accumulate token usage
        totalInputTokens += result.usage.inputTokens;
        totalOutputTokens += result.usage.outputTokens;
        totalCachedTokens += result.usage.cachedTokens || 0;

        const parsed = parseJsonFromResponse(result.text);

        if (!parsed.perguntas || !Array.isArray(parsed.perguntas)) {
          throw new Error(`Invalid response format from AI in batch ${batchNum}`);
        }

        allQuestions.push(...parsed.perguntas);
        console.log(`✅ ${formatBatchProgress(batchNum, totalBatches)} Generated ${parsed.perguntas.length} questions`);
      }

      console.log(`✅ [Quiz] Total questions generated: ${allQuestions.length}`);

    } finally {
      // Always cleanup cache (even if error occurs)
      if (cacheName) {
        await safeDeleteCache(cacheName, geminiApiKey);
      }
    }

    // Sanitize and insert questions
    const validTypes = ['multipla_escolha', 'verdadeiro_falso', 'citar', 'caso_clinico', 'completar'];

    const questionsToInsert = allQuestions.map((q: any) => {
      const respostaLimpa = sanitizeString(q.resposta_correta || '');
      const tipo = validTypes.includes(q.tipo) ? q.tipo : 'multipla_escolha';

      return {
        project_id: project_id || sources[0].project_id,
        source_id: source_id || null,
        session_id: sessionId,
        tipo: tipo,
        pergunta: sanitizeString(q.pergunta || ''),
        opcoes: Array.isArray(q.opcoes) ? q.opcoes.map((opt: string) => sanitizeString(opt)) : [],
        resposta_correta: respostaLimpa,
        justificativa: sanitizeString(q.justificativa || ''),
        dica: q.dica ? sanitizeString(q.dica) : null,
        topico: q.topico ? sanitizeString(q.topico) : 'Geral',
        dificuldade: q.dificuldade || 'médio',
      };
    });

    const { data: insertedQuestions, error: insertError } = await supabase
      .from('questions')
      .insert(questionsToInsert)
      .select();

    if (insertError) throw insertError;

    console.log(`✅ Questions saved: ${insertedQuestions.length}`);
    console.log(`📊 Total tokens: Input ${totalInputTokens}, Output ${totalOutputTokens}, Cached ${totalCachedTokens}`);

    return res.status(200).json({
      success: true,
      count: insertedQuestions.length,
      session_id: sessionId,
      questions: insertedQuestions,
    });
  } catch (error: any) {
    console.error('❌ Error generating quiz:', error);
    return res.status(400).json({
      error: error.message || 'Failed to generate quiz',
    });
  }
}
