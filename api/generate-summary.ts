// Vercel Serverless Function for generating medical summaries
// Migrated from Supabase Edge Functions to avoid timeout/resource limits

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  callGeminiWithUsage,
  parseJsonFromResponse,
  estimateTokens,
  calculateSafeOutputTokens,
} from './lib/gemini';
import { sanitizeString, sanitizeHtml, sanitizeStringArray } from './lib/sanitization';

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

/**
 * Calculate summary strategy based on content size
 */
function calculateSummaryStrategy(inputText: string): {
  strategy: 'SINGLE' | 'BATCHED';
  estimatedOutputTokens: number;
  maxOutputTokens: number;
  explanation: string;
} {
  const inputTokens = estimateTokens(inputText);
  const chars = inputText.length;

  // Strategy 1: Single complete summary
  if (chars < 300000) {
    const desiredOutput = 14000;
    const safeOutput = calculateSafeOutputTokens(inputText, desiredOutput);

    // If safe output is too small, switch to BATCHED
    if (safeOutput < 6000) {
      console.warn(`⚠️ [Strategy] Input too large for SINGLE strategy (would allow only ${safeOutput} output tokens). Switching to BATCHED.`);

      const batchedOutput = 14000;
      const safeBatchedOutput = calculateSafeOutputTokens('', batchedOutput);

      return {
        strategy: 'BATCHED',
        estimatedOutputTokens: safeBatchedOutput,
        maxOutputTokens: safeBatchedOutput,
        explanation: `Conteúdo grande (${chars} chars, ~${inputTokens} tokens). Usando estratégia BATCHED para permitir output completo de ${safeBatchedOutput} tokens.`,
      };
    }

    return {
      strategy: 'SINGLE',
      estimatedOutputTokens: safeOutput,
      maxOutputTokens: safeOutput,
      explanation: `Conteúdo de ${chars} chars (~${inputTokens} tokens). Gerando resumo completo (output: ${safeOutput} tokens, cobertura 100%).`,
    };
  }

  // Strategy 2: Batched sections
  const desiredOutput = 14000;
  const safeOutput = calculateSafeOutputTokens('', desiredOutput);

  return {
    strategy: 'BATCHED',
    estimatedOutputTokens: safeOutput,
    maxOutputTokens: safeOutput,
    explanation: `Conteúdo muito grande (${chars} chars, ~${inputTokens} tokens). Processando em seções paralelas (chunks de 50k chars) e consolidando tópicos duplicados (output final: ${safeOutput} tokens).`,
  };
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
    const { source_id, source_ids, project_id } = req.body;

    if (!source_id && !source_ids && !project_id) {
      return res.status(400).json({ error: 'source_id, source_ids, or project_id required' });
    }

    // Fetch sources
    // Priority logic (respects user selection):
    // 1. If source_ids array exists → fetch ONLY those specific sources (USER SELECTION)
    // 2. If only source_id exists → fetch that single source
    // 3. If only project_id exists → fetch ALL ready sources from project (no selection)
    let sources = [];

    if (source_ids && Array.isArray(source_ids) && source_ids.length > 0) {
      // HIGHEST PRIORITY: User explicitly selected specific sources
      // Example: User has 9 sources but selected only 4 → use those 4
      console.log(`📊 [Summary] Fetching ${source_ids.length} user-selected sources`);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .in('id', source_ids)
        .eq('status', 'ready');

      if (error) throw error;
      sources = data || [];
      console.log(`✅ [Summary] Found ${sources.length} selected sources (user chose ${source_ids.length})`);
    } else if (source_id) {
      // Single source selected
      console.log(`📊 [Summary] Fetching single user-selected source: ${source_id}`);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('id', source_id)
        .single();

      if (error) throw error;
      sources = [data];
      console.log(`✅ [Summary] Found 1 selected source`);
    } else if (project_id) {
      // No specific selection → fetch ALL sources from project
      console.log(`📊 [Summary] No specific selection, fetching ALL sources from project: ${project_id}`);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('project_id', project_id)
        .eq('status', 'ready')
        .order('created_at', { ascending: false });

      if (error) throw error;
      sources = data || [];
      console.log(`✅ [Summary] Found ${sources.length} ready sources in project (all sources)`);
    }

    if (sources.length === 0) {
      throw new Error('No sources found');
    }

    // Combine content from all sources
    const sourceIds = sources.map((s: any) => s.id);
    let combinedContent = '';

    console.log('📄 [Summary] Using full extracted_content (100% coverage)');

    for (const source of sources) {
      if (source.extracted_content) {
        const sanitizedContent = sanitizeString(source.extracted_content);
        combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizedContent}`;
      }
    }

    console.log(`📊 [Summary] Combined ${sources.length} sources: ${combinedContent.length} chars`);

    if (!combinedContent.trim()) {
      throw new Error('No content available to generate summary');
    }

    // Calculate strategy
    const strategyInfo = calculateSummaryStrategy(combinedContent);
    console.log(`📊 [Strategy] ${strategyInfo.strategy}: ${strategyInfo.explanation}`);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let parsed: any;

    if (strategyInfo.strategy === 'SINGLE') {
      // Single summary generation
      const prompt = `Você é um professor especialista em medicina. Crie um resumo estruturado e CONSOLIDADO do conteúdo abaixo.

CONTEÚDO (pode conter múltiplas fontes com tópicos duplicados):
${combinedContent}

INSTRUÇÕES CRÍTICAS:
1. **CONSOLIDE TÓPICOS DUPLICADOS**:
   - Se o mesmo tópico aparece em várias fontes, crie UMA ÚNICA seção <h2> integrando TODAS as informações
   - Evite repetir o mesmo conteúdo

2. **PRESERVE TODOS OS DETALHES CLÍNICOS**:
   - Dosagens, posologias, protocolos
   - Contraindicações, efeitos adversos, interações
   - Tabelas, classificações, critérios diagnósticos

3. **ESTRUTURA HIERÁRQUICA**:
   - <h2> para tópicos principais
   - <h3> para aspectos clínicos (Fisiopatologia, Diagnóstico, Tratamento)
   - <h4> para subdivisões
   - <p> para parágrafos
   - <ul>/<li> para listas
   - <strong> para termos importantes

4. **PRIORIZE PROFUNDIDADE**: Máximo 15-20 páginas, foque nos conceitos importantes

5. **FORMATAÇÃO RICA** e **TERMINOLOGIA MÉDICA CORRETA** em Português do Brasil

JSON:
{
  "titulo": "string (descritivo dos principais tópicos)",
  "conteudo_html": "string (HTML estruturado, consolidado)",
  "topicos": ["string", ...] (lista dos tópicos PRINCIPAIS únicos)
}`;

      const result = await callGeminiWithUsage(
        prompt,
        geminiApiKey,
        'gemini-2.0-flash-exp',
        strategyInfo.maxOutputTokens,
        true
      );

      totalInputTokens += result.usage.inputTokens;
      totalOutputTokens += result.usage.outputTokens;

      parsed = parseJsonFromResponse(result.text);
      console.log(`✅ Single summary generated: ${result.usage.outputTokens} tokens`);
    } else {
      // Batched strategy
      console.log('🔄 [BATCHED] Generating sections in parallel...');

      const chunkSize = 50000;
      const chunks: string[] = [];
      for (let i = 0; i < combinedContent.length; i += chunkSize) {
        chunks.push(combinedContent.substring(i, i + chunkSize));
      }

      console.log(`📑 Split into ${chunks.length} sections, processing in parallel...`);

      // Process chunks in parallel
      const sectionPromises = chunks.map(async (chunk, i) => {
        const chunkNum = i + 1;
        const sectionPrompt = `Você é um professor especialista em medicina. Crie um resumo ESTRUTURADO e DETALHADO desta seção.

SEÇÃO ${chunkNum} DE ${chunks.length}:
${chunk}

INSTRUÇÕES:
1. Use <h3> para tópicos principais, <h4> para subtópicos
2. PRESERVE TODOS OS DETALHES CLÍNICOS (dosagens, contraindicações, etc)
3. Formatação: <p>, <ul>/<li>, <strong>, <em>
4. Português do Brasil, terminologia médica correta

Retorne APENAS o HTML estruturado.`;

        try {
          const safeChunkOutput = calculateSafeOutputTokens(sectionPrompt, 6000);
          const result = await callGeminiWithUsage(
            sectionPrompt,
            geminiApiKey,
            'gemini-2.0-flash-exp',
            safeChunkOutput
          );
          console.log(`✅ [Seção ${chunkNum}/${chunks.length}] Completed`);
          return result;
        } catch (err) {
          console.error(`❌ [Seção ${chunkNum}] Failed:`, err);
          return {
            text: `<div class="section-error"><h3>⚠️ Erro na Seção ${chunkNum}</h3></div>`,
            usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }
          };
        }
      });

      const results = await Promise.all(sectionPromises);
      const sectionSummaries = results.map(r => r.text);
      totalInputTokens += results.reduce((acc, r) => acc + (r.usage?.inputTokens || 0), 0);
      totalOutputTokens += results.reduce((acc, r) => acc + (r.usage?.outputTokens || 0), 0);

      // Combine sections
      console.log('🔄 Combining sections...');

      const combinePrompt = `Combine os resumos abaixo em um resumo final CONSOLIDADO:

${sectionSummaries.map((s, i) => `\n=== SEÇÃO ${i + 1} ===\n${s}`).join('\n\n')}

INSTRUÇÕES:
1. ELIMINE DUPLICAÇÃO DE TÓPICOS
2. Integre informações complementares
3. PRESERVE TODOS OS DETALHES CLÍNICOS
4. Estrutura: <h2> tópicos, <h3> aspectos, <h4> subdivisões
5. Máximo 15-20 páginas

JSON:
{
  "titulo": "string",
  "conteudo_html": "string (HTML consolidado)",
  "topicos": ["string", ...]
}`;

      const safeOutputTokens = calculateSafeOutputTokens(combinePrompt, 14000);
      const combineResult = await callGeminiWithUsage(
        combinePrompt,
        geminiApiKey,
        'gemini-2.0-flash-exp',
        safeOutputTokens,
        true
      );

      totalInputTokens += combineResult.usage.inputTokens;
      totalOutputTokens += combineResult.usage.outputTokens;

      parsed = parseJsonFromResponse(combineResult.text);
      console.log(`✅ Consolidated summary: ${combineResult.usage.outputTokens} tokens`);
    }

    // Validate response
    if (!parsed.titulo || !parsed.conteudo_html) {
      throw new Error('Invalid response format from AI');
    }

    // Save to database
    const { data: insertedSummary, error: insertError } = await supabase
      .from('summaries')
      .insert({
        project_id: project_id || sources[0].project_id,
        titulo: sanitizeString(parsed.titulo),
        conteudo_html: sanitizeHtml(parsed.conteudo_html),
        topicos: sanitizeStringArray(parsed.topicos || []),
        source_ids: sourceIds,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`✅ Summary saved: ${insertedSummary.id}`);
    console.log(`📊 Total tokens: Input ${totalInputTokens}, Output ${totalOutputTokens}`);

    return res.status(200).json({
      success: true,
      summary: insertedSummary,
    });
  } catch (error: any) {
    console.error('❌ Error generating summary:', error);
    return res.status(400).json({
      error: error.message || 'Failed to generate summary',
    });
  }
}
