// Vercel Serverless Function for generating medical flashcards
// Migrated from Supabase Edge Functions with context caching support

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  callGeminiWithUsage,
  parseJsonFromResponse,
  estimateTokens,
} from './lib/gemini';
import { sanitizeString } from './lib/sanitization';
import {
  validateOutputRequest,
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
      console.log(`📊 [Flashcards] Fetching ${source_ids.length} user-selected sources`);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .in('id', source_ids)
        .eq('status', 'ready');

      if (error) throw error;
      sources = data || [];
      console.log(`✅ [Flashcards] Found ${sources.length} selected sources`);
    } else if (source_id) {
      // Single source
      console.log(`📊 [Flashcards] Fetching single source: ${source_id}`);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('id', source_id)
        .single();

      if (error) throw error;
      sources = [data];
      console.log(`✅ [Flashcards] Found 1 source`);
    } else if (project_id) {
      // All project sources
      console.log(`📊 [Flashcards] Fetching all sources from project: ${project_id}`);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('project_id', project_id)
        .eq('status', 'ready')
        .order('created_at', { ascending: false });

      if (error) throw error;
      sources = data || [];
      console.log(`✅ [Flashcards] Found ${sources.length} sources in project`);
    }

    if (sources.length === 0) {
      throw new Error('No sources found');
    }

    // CRITICAL: Flashcards use FULL extracted_content (comprehensive coverage)
    // Limit to 5 most recent sources to keep input manageable (~300k chars / ~75k tokens)
    const MAX_SOURCES = 5;
    const usedSources = sources.slice(0, MAX_SOURCES);

    let combinedContent = '';
    console.log('📚 [Flashcards] Using full extracted_content (comprehensive coverage of all material)');

    for (const source of usedSources) {
      if (source.extracted_content) {
        const sanitizedContent = sanitizeString(source.extracted_content);
        combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizedContent}`;
      }
    }

    // Truncate if content exceeds safe limit for input (~300k chars / ~75k tokens)
    const MAX_CONTENT_LENGTH = 300000;
    if (combinedContent.length > MAX_CONTENT_LENGTH) {
      console.warn(`⚠️ [Flashcards] Truncating content from ${combinedContent.length} to ${MAX_CONTENT_LENGTH} chars`);
      combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH);
    }

    console.log(`📊 [Flashcards] Using ${usedSources.length} sources: ${combinedContent.length} chars (~${Math.ceil(combinedContent.length / 4)} tokens)`);

    if (!combinedContent.trim()) {
      throw new Error('No content available to generate flashcards');
    }

    // Validate output request and calculate batches
    const validation = validateOutputRequest('FLASHCARD', count);

    console.log(`📊 [PHASE 1] Flashcard generation request: ${count} items, estimated ${validation.estimatedTokens} tokens`);

    if (validation.needsBatching) {
      console.warn(`⚠️ [PHASE 1] ${validation.warning}`);
    }

    const batchSizes = calculateBatchSizes('FLASHCARD', count);
    const totalBatches = batchSizes.length;

    console.log(`🔄 [PHASE 1] Processing in ${totalBatches} batch(es): ${batchSizes.join(', ')} flashcards each`);

    // Generate unique session_id for this flashcard generation
    const sessionId = crypto.randomUUID();
    console.log(`📝 [PHASE 1] Session ID: ${sessionId}`);

    // Track token usage across all batches
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;

    const allFlashcards: any[] = [];

    // Create context cache if multiple batches (saves ~95% on input tokens)
    let cacheName: string | null = null;
    const useCache = totalBatches > 1;

    try {
      if (useCache) {
        console.log(`💰 [CACHE] Creating cache for ${totalBatches} batches to save ~95% on input tokens`);

        const cacheContent = `CONTEÚDO MÉDICO BASE PARA GERAÇÃO DE FLASHCARDS:

${combinedContent}

---
Este conteúdo será usado como base para criar flashcards de medicina.
Todos os flashcards devem se basear EXCLUSIVAMENTE neste conteúdo.`;

        const cacheInfo = await createContextCache(
          cacheContent,
          geminiApiKey,
          'gemini-2.5-flash',
          {
            ttlSeconds: 600, // 10 minutes - enough for batch processing
            displayName: `flashcards-${sessionId}`
          }
        );

        cacheName = cacheInfo.name;
        console.log(`✅ [CACHE] Cache created: ${cacheName}`);
      }

      // Generate flashcards in batches
      for (let i = 0; i < batchSizes.length; i++) {
        const batchCount = batchSizes[i];
        const batchNum = i + 1;

        console.log(`${formatBatchProgress(batchNum, totalBatches)} Generating ${batchCount} flashcards...`);

        // Prompt WITHOUT content when using cache (content is in cache)
        // Prompt WITH content when NOT using cache (single batch)
        const prompt = `Você é um professor especialista em medicina. Analise o conteúdo ${useCache ? 'já fornecido no contexto' : 'abaixo'} e crie ${batchCount} flashcards de alta qualidade para estudantes de medicina.

IMPORTANTE: Toda a frente e verso dos flashcards devem ser em Português do Brasil.

${!useCache ? `CONTEÚDO:
${combinedContent}

` : ''}INSTRUÇÕES:
1. Cada flashcard deve ter uma FRENTE (pergunta/conceito) e VERSO (resposta/explicação)
2. Foque em conceitos-chave, definições, mecanismos e fatos importantes
3. A frente deve ser concisa e clara (pergunta ou termo)
4. O verso deve conter uma explicação completa mas sucinta
5. Classifique a dificuldade como: "fácil", "médio" ou "difícil"${difficulty ? ` - IMPORTANTE: TODOS os flashcards devem ser de nível "${difficulty}"` : ''}
6. Identifique o tópico principal
7. Varie entre diferentes tipos: definições, mecanismos, comparações, aplicações clínicas
${totalBatches > 1 ? `8. Este é o lote ${batchNum} de ${totalBatches}. Varie os tópicos em relação aos lotes anteriores.` : ''}

FORMATO DE SAÍDA (JSON estrito):
{
  "flashcards": [
    {
      "frente": "Pergunta ou conceito aqui",
      "verso": "Resposta ou explicação detalhada aqui",
      "topico": "Nome do tópico principal",
      "dificuldade": "${difficulty || 'médio'}"
    }
  ]
}

Retorne APENAS o JSON, sem texto adicional antes ou depois.`;

        // Enable JSON mode to save tokens and ensure valid JSON output
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

        if (!parsed.flashcards || !Array.isArray(parsed.flashcards)) {
          throw new Error(`Invalid response format from AI in batch ${batchNum}`);
        }

        allFlashcards.push(...parsed.flashcards);
        console.log(`✅ ${formatBatchProgress(batchNum, totalBatches)} Generated ${parsed.flashcards.length} flashcards`);
      }

      console.log(`✅ [PHASE 1] Total flashcards generated: ${allFlashcards.length}`);

    } finally {
      // Always cleanup cache (even if error occurs)
      if (cacheName) {
        await safeDeleteCache(cacheName, geminiApiKey);
      }
    }

    // Save all flashcards to database (sanitize all text fields)
    const flashcardsToInsert = allFlashcards.map((f: any) => ({
      project_id: project_id || sources[0].project_id,
      source_id: source_id || null,
      session_id: sessionId,
      frente: sanitizeString(f.frente || ''),
      verso: sanitizeString(f.verso || ''),
      topico: f.topico ? sanitizeString(f.topico) : null,
      dificuldade: ['fácil', 'médio', 'difícil'].includes(f.dificuldade) ? f.dificuldade : 'médio',
    }));

    const { data: insertedFlashcards, error: insertError } = await supabase
      .from('flashcards')
      .insert(flashcardsToInsert)
      .select();

    if (insertError) throw insertError;

    console.log(`✅ Flashcards saved: ${insertedFlashcards.length}`);
    console.log(`📊 Total tokens: Input ${totalInputTokens}, Output ${totalOutputTokens}, Cached ${totalCachedTokens}`);

    return res.status(200).json({
      success: true,
      count: insertedFlashcards.length,
      session_id: sessionId,
      flashcards: insertedFlashcards,
    });
  } catch (error: any) {
    console.error('❌ Error generating flashcards:', error);
    return res.status(400).json({
      error: error.message || 'Failed to generate flashcards',
    });
  }
}
