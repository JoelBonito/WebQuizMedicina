// Vercel Serverless Function for generating medical summaries
// Migrated from Supabase Edge Functions to avoid timeout/resource limits

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  callGeminiWithUsage,
  parseJsonFromResponse,
} from './lib/gemini';
// IMPORTANT: Imports limits from output-limits, NOT gemini.ts
import {
  estimateTokens,
  calculateSafeOutputTokens,
  calculateSummaryStrategy
} from './lib/output-limits';
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
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { source_id, source_ids, project_id } = req.body;

    if (!source_id && !source_ids && !project_id) {
      return res.status(400).json({ error: 'source_id, source_ids, or project_id required' });
    }

    let sources = [];

    if (source_ids && Array.isArray(source_ids) && source_ids.length > 0) {
      console.log(`📊 [Summary] Fetching ${source_ids.length} user-selected sources`);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .in('id', source_ids)
        .eq('status', 'ready');
      if (error) throw error;
      sources = data || [];
    } else if (source_id) {
      console.log(`📊 [Summary] Fetching single user-selected source: ${source_id}`);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('id', source_id)
        .single();
      if (error) throw error;
      sources = [data];
    } else if (project_id) {
      console.log(`📊 [Summary] Fetching ALL sources from project: ${project_id}`);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('project_id', project_id)
        .eq('status', 'ready')
        .order('created_at', { ascending: false });
      if (error) throw error;
      sources = data || [];
    }

    if (sources.length === 0) {
      throw new Error('No sources found');
    }

    const sourceIds = sources.map((s: any) => s.id);
    let combinedContent = '';

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

    // Calculate strategy using updated limits
    const strategyInfo = calculateSummaryStrategy(combinedContent);
    console.log(`📊 [Strategy] ${strategyInfo.strategy}: ${strategyInfo.explanation}`);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let parsed: any;

    // UPDATED MODEL: Using gemini-2.5-flash everywhere
    const GEMINI_MODEL = 'gemini-2.5-flash';

    if (strategyInfo.strategy === 'SINGLE') {
      const prompt = `Você é um professor especialista em medicina. Crie um resumo estruturado e CONSOLIDADO do conteúdo abaixo.

CONTEÚDO:
${combinedContent}

INSTRUÇÕES CRÍTICAS:
1. **CONSOLIDE TÓPICOS DUPLICADOS**: Integre informações de várias fontes.
2. **PRESERVE DETALHES CLÍNICOS**: Dosagens, posologias, contraindicações, tabelas.
3. **ESTRUTURA**: <h2>, <h3>, <h4>, <ul>/<li>, <strong>.
4. **PROFUNDIDADE**: Resumo extenso e técnico.
5. **IDIOMA**: Português do Brasil.

JSON Output:
{
  "titulo": "Título descritivo",
  "conteudo_html": "HTML estruturado",
  "topicos": ["tópico 1", "tópico 2"]
}`;

      const result = await callGeminiWithUsage(
        prompt,
        geminiApiKey,
        GEMINI_MODEL,
        strategyInfo.maxOutputTokens,
        true
      );

      totalInputTokens += result.usage.inputTokens;
      totalOutputTokens += result.usage.outputTokens;
      parsed = parseJsonFromResponse(result.text);
      console.log(`✅ Single summary generated: ${result.usage.outputTokens} tokens`);

    } else {
      // Batched strategy (Only for huge content now)
      console.log('🔄 [BATCHED] Generating sections in parallel...');
      
      // Larger chunks allowed due to 1M context
      const chunkSize = 200000; // ~50k tokens per chunk
      const chunks: string[] = [];
      for (let i = 0; i < combinedContent.length; i += chunkSize) {
        chunks.push(combinedContent.substring(i, i + chunkSize));
      }

      console.log(`📑 Split into ${chunks.length} sections (${chunkSize} chars each)...`);

      const sectionPromises = chunks.map(async (chunk, i) => {
        const chunkNum = i + 1;
        const sectionPrompt = `Você é um professor especialista em medicina. Crie um resumo ESTRUTURADO desta seção.
SEÇÃO ${chunkNum} DE ${chunks.length}:
${chunk}
INSTRUÇÕES: Resumo detalhado com formatação HTML (<h3>, <ul>, <p>). Português do Brasil.`;

        try {
          const targetOutput = 30000; 
          const safeChunkOutput = calculateSafeOutputTokens(sectionPrompt, targetOutput);

          return await callGeminiWithUsage(
            sectionPrompt,
            geminiApiKey,
            GEMINI_MODEL,
            safeChunkOutput
          );
        } catch (err) {
          console.error(`❌ [Seção ${chunkNum}] Failed:`, err);
          return { text: '', usage: { inputTokens: 0, outputTokens: 0 } };
        }
      });

      const results = await Promise.all(sectionPromises);
      const sectionSummaries = results.map(r => r.text).filter(t => t);
      
      // Consolidation
      console.log('🔄 Combining sections...');
      const combinePrompt = `Combine os resumos abaixo em um resumo final CONSOLIDADO:
${sectionSummaries.map((s, i) => `\n=== SEÇÃO ${i + 1} ===\n${s}`).join('\n\n')}
INSTRUÇÕES: Unifique tópicos, elimine redundâncias, mantenha detalhes técnicos. Formato JSON.`;

      const safeOutputTokens = calculateSafeOutputTokens(combinePrompt, 40000);
      const combineResult = await callGeminiWithUsage(
        combinePrompt,
        geminiApiKey,
        GEMINI_MODEL,
        safeOutputTokens,
        true
      );

      parsed = parseJsonFromResponse(combineResult.text);
      totalInputTokens += combineResult.usage.inputTokens;
      totalOutputTokens += combineResult.usage.outputTokens;
    }

    if (!parsed.titulo || !parsed.conteudo_html) {
      throw new Error('Invalid response format from AI');
    }

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
    return res.status(200).json({ success: true, summary: insertedSummary });

  } catch (error: any) {
    console.error('❌ Error generating summary:', error);
    return res.status(400).json({ error: error.message || 'Failed to generate summary' });
  }
}
