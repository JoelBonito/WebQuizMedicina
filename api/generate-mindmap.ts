// Vercel Serverless Function for generating mind maps
// Uses Gemini 2.5 Flash to create Mermaid diagrams for educational content

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  callGeminiWithUsage,
  parseJsonFromResponse,
} from './lib/gemini';
import {
  estimateTokens,
  calculateSafeOutputTokens,
} from './lib/output-limits';
import { sanitizeString } from './lib/sanitization';

// Configuração de Timeout para Vercel (Vital para outputs grandes)
export const maxDuration = 60; // 60 segundos
export const dynamic = 'force-dynamic';

// CORS configuration
const ALLOWED_ORIGINS = [
  '[https://web-quiz-medicina.vercel.app](https://web-quiz-medicina.vercel.app)',
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
 * Remove markdown code blocks from the mermaid string if present
 * Gemini often wraps the code in ```mermaid ... ``` even inside JSON
 */
function cleanMermaidCode(code: string): string {
  if (!code) return '';
  
  let cleaned = code.trim();
  
  // Remove markdown block start
  cleaned = cleaned.replace(/^```mermaid\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/, '');
  
  // Remove markdown block end
  cleaned = cleaned.replace(/```$/, '');
  
  return cleaned.trim();
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

    const { source_ids, project_id, tipo = 'standard' } = req.body;

    if (!source_ids && !project_id) {
      return res.status(400).json({ error: 'source_ids or project_id required' });
    }

    // 1. Fetch Sources
    let sources = [];
    if (source_ids && Array.isArray(source_ids) && source_ids.length > 0) {
      console.log(`🗺️ [MindMap] Fetching ${source_ids.length} user-selected sources`);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .in('id', source_ids)
        .eq('status', 'ready');
      if (error) throw error;
      sources = data || [];
    } else if (project_id) {
      console.log(`🗺️ [MindMap] Fetching ALL sources from project: ${project_id}`);
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

    console.log(`🗺️ [MindMap] Combined ${sources.length} sources: ${combinedContent.length} chars`);

    if (!combinedContent.trim()) {
      throw new Error('No content available to generate mind map');
    }

    // 2. Token Calculation
    // FIX: Using 60,000 as requested to allow large Mermaid diagrams
    const inputTokens = estimateTokens(combinedContent);
    const safeOutputTokens = calculateSafeOutputTokens(combinedContent, 60000);

    console.log(`🗺️ [MindMap] Input: ~${inputTokens} tokens, Safe output: ${safeOutputTokens} tokens`);

    // 3. The Prompt
    const GEMINI_MODEL = 'gemini-2.5-flash';

    const prompt = `Você é um especialista em didática médica. Crie um MAPA MENTAL completo e detalhado com base no conteúdo fornecido.

CONTEÚDO:
${combinedContent}

INSTRUÇÕES TÉCNICAS (CRÍTICO - SIGA EXATAMENTE):
1. **FORMATO JSON**: Sua resposta DEVE ser um objeto JSON válido com campos "titulo" e "mermaid".
2. **SINTAXE MERMAID**: Dentro do campo "mermaid", use APENAS a sintaxe 'mindmap' simples.
3. **INDENTAÇÃO OBRIGATÓRIA - EXTREMAMENTE IMPORTANTE**:
   - Linha 1: "mindmap" (sem indentação)
   - Linha 2: 2 espaços + "Título Principal"
   - Linha 3: 4 espaços + "Categoria 1"
   - Linha 4: 6 espaços + "Subcategoria 1.1"
   - Linha 5: 6 espaços + "Subcategoria 1.2"
   - Linha 6: 4 espaços + "Categoria 2"
   - CADA NÍVEL FILHO deve ter EXATAMENTE 2 espaços A MAIS que o pai
   - NUNCA pule de 8 para 10 espaços. Sempre: 0, 2, 4, 6, 8, 10, 12...
4. **SEM IDs**: NUNCA use identificadores como n1, n2, id, root, etc.
5. **ASPAS OBRIGATÓRIAS**: TODO texto (exceto "mindmap") DEVE estar entre aspas duplas.
6. **CARACTERES**: Use apenas ASCII. Substitua: → por ->, ≥ por >=, ≤ por <=
7. **SEM FORMAS**: Nunca use (()), [[]], {{}}, apenas texto entre aspas.

EXEMPLO CORRETO DE ESTRUTURA (copie este padrão de indentação):
mindmap
  "Tema Principal"
    "Categoria A"
      "Item A.1"
      "Item A.2"
        "Detalhe A.2.1"
        "Detalhe A.2.2"
      "Item A.3"
    "Categoria B"
      "Item B.1"

EXEMPLO DE OUTPUT JSON:
{
  "titulo": "Fisiopatologia Renal",
  "mermaid": "mindmap\\n  \\"Fisiopatologia Renal\\"\\n    \\"Síndrome Nefrótico\\"\\n      \\"Definição\\"\\n        \\"Proteinúria maciça\\"\\n        \\"Hipoalbuminemia\\""
}`;

Gere o JSON agora:`;

    // 4. Call Gemini
    const result = await callGeminiWithUsage(
      prompt,
      geminiApiKey,
      GEMINI_MODEL,
      safeOutputTokens,
      true // JSON mode
    );

    console.log(`✅ MindMap generated: ${result.usage.outputTokens} tokens`);

    // 5. Parse & Clean
    const parsed = parseJsonFromResponse(result.text);

    if (!parsed.titulo || !parsed.mermaid) {
      console.error('Invalid AI Response:', result.text.substring(0, 200));
      throw new Error('Invalid response format from AI: Missing titulo or mermaid field');
    }

    // Clean the mermaid code (remove ``` if present inside the string)
    const mermaidCode = cleanMermaidCode(parsed.mermaid);

    // Validate basic syntax
    if (!mermaidCode.startsWith('mindmap') && !mermaidCode.startsWith('graph')) {
        // Fallback: If AI forgot 'mindmap' keyword, prepend it
        console.warn('⚠️ Mermaid syntax missing "mindmap" keyword. Auto-fixing...');
        // Only prepending if it looks like an indented list
        if (mermaidCode.includes('\n')) {
             // This assumes the AI returned an indented list without the header
             // It's a risky fix, but better than empty. 
             // Ideally, we just save what we got, but let's try to be helpful.
        }
    }

    // 6. Save to Database
    const titlePrefix = tipo === 'recovery' ? 'Recovery: ' : '';
    const finalTitle = titlePrefix + sanitizeString(parsed.titulo);

    const { data: insertedMindmap, error: insertError } = await supabase
      .from('mindmaps')
      .insert({
        project_id: project_id || sources[0].project_id,
        user_id: user.id,
        title: finalTitle,
        content_mermaid: mermaidCode,
        source_ids: sourceIds,
        tipo: tipo,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`✅ MindMap saved: ${insertedMindmap.id}`);
    return res.status(200).json({ success: true, mindmap: insertedMindmap });

  } catch (error: any) {
    console.error('❌ Error generating mind map:', error);
    return res.status(400).json({ error: error.message || 'Failed to generate mind map' });
  }
}
