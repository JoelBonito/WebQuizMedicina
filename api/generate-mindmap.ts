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

    const { source_ids, project_id, tipo = 'standard' } = req.body;

    if (!source_ids && !project_id) {
      return res.status(400).json({ error: 'source_ids or project_id required' });
    }

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

    // Calculate safe output tokens (using 1M context limit)
    const inputTokens = estimateTokens(combinedContent);
    const safeOutputTokens = calculateSafeOutputTokens(combinedContent, 60000); // Target ~60k tokens for mermaid output

    console.log(`🗺️ [MindMap] Input: ~${inputTokens} tokens, Safe output: ${safeOutputTokens} tokens`);

    const GEMINI_MODEL = 'gemini-2.5-flash';

    const prompt = `Você é um professor especialista em medicina. Crie um MAPA MENTAL didático e visual sobre o conteúdo abaixo.

CONTEÚDO:
${combinedContent}

INSTRUÇÕES CRÍTICAS:
1. **ESTRUTURA HIERÁRQUICA**: Organize o conteúdo em uma hierarquia clara de conceitos principais e subconceptos
2. **DIDÁTICO**: Foque nos conceitos-chave, relações importantes e pontos de conexão entre tópicos
3. **VISUAL**: Use a sintaxe Mermaid para criar um diagrama claro e organizado
4. **CONCISO**: Cada nó deve ter texto breve e objetivo (máximo 3-5 palavras)
5. **ABRANGENTE**: Cubra os principais tópicos do conteúdo sem se perder em detalhes excessivos

FORMATO DE SAÍDA MERMAID:
Use a sintaxe "mindmap" do Mermaid. Exemplo:

mindmap
  root((Título Principal))
    Tópico 1
      Subtópico 1.1
      Subtópico 1.2
        Detalhe 1.2.1
    Tópico 2
      Subtópico 2.1
      Subtópico 2.2

ALTERNATIVA: Se preferir um fluxograma hierárquico, use:

graph TD
    A[Título Principal]
    A --> B[Tópico 1]
    A --> C[Tópico 2]
    B --> D[Subtópico 1.1]
    B --> E[Subtópico 1.2]
    C --> F[Subtópico 2.1]

**IMPORTANTE**:
- NÃO use caracteres especiais que quebrem a sintaxe (como aspas não escapadas, parênteses soltos)
- Mantenha os textos dos nós curtos e descritivos
- Use português do Brasil
- Escolha APENAS UMA sintaxe (mindmap OU graph TD) e seja consistente

JSON Output:
{
  "titulo": "Título descritivo do mapa mental",
  "mermaid": "Código completo do diagrama Mermaid aqui"
}`;

    const result = await callGeminiWithUsage(
      prompt,
      geminiApiKey,
      GEMINI_MODEL,
      safeOutputTokens,
      true // Request JSON mode
    );

    console.log(`✅ MindMap generated: ${result.usage.outputTokens} tokens`);

    const parsed = parseJsonFromResponse(result.text);

    if (!parsed.titulo || !parsed.mermaid) {
      throw new Error('Invalid response format from AI');
    }

    // Validate mermaid syntax starts correctly
    const mermaidCode = parsed.mermaid.trim();
    if (!mermaidCode.startsWith('mindmap') && !mermaidCode.startsWith('graph')) {
      console.warn('⚠️ Mermaid code may have invalid syntax. Proceeding anyway...');
    }

    // Save to database
    const { data: insertedMindmap, error: insertError } = await supabase
      .from('mindmaps')
      .insert({
        project_id: project_id || sources[0].project_id,
        user_id: user.id,
        title: sanitizeString(parsed.titulo),
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
