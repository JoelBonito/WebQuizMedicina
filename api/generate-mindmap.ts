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

    // 3. The Improved Prompt with Strict Indentation Rules
    const GEMINI_MODEL = 'gemini-2.5-flash';

    const prompt = `Você é um especialista em didática médica. Crie um MAPA MENTAL completo e detalhado com base no conteúdo fornecido.

CONTEÚDO:
${combinedContent}

INSTRUÇÕES TÉCNICAS (CRÍTICO - SIGA EXATAMENTE):

1. **FORMATO JSON OBRIGATÓRIO**: 
   - Sua resposta DEVE ser APENAS um objeto JSON válido
   - Campos obrigatórios: "titulo" (string) e "mermaid" (string)
   - Nada antes ou depois do JSON

2. **INDENTAÇÃO - REGRA MAIS IMPORTANTE**:
   - Linha 1: mindmap (sem aspas, sem espaços)
   - Linha 2: 2 espaços + "Texto entre aspas"
   - Linha 3: 4 espaços + "Texto entre aspas"
   - Linha 4: 6 espaços + "Texto entre aspas"
   - SEMPRE incremente EXATAMENTE 2 espaços por nível
   - NUNCA pule níveis (não vá de 4 para 8 espaços, sempre 4→6)
   - Sequência correta: 0, 2, 4, 6, 8, 10, 12, 14...
   
3. **ASPAS DUPLAS**:
   - TODO texto deve estar entre aspas duplas (exceto a palavra mindmap)
   - Se precisar aspas dentro do texto, escape com \\"

4. **ESTRUTURA HIERÁRQUICA**:
   - Filhos devem ter EXATAMENTE 2 espaços a mais que o pai
   - Irmãos devem ter EXATAMENTE o mesmo número de espaços
   - Para voltar a um nível anterior, diminua 2 espaços

5. **CARACTERES PERMITIDOS**:
   - Use apenas ASCII básico
   - Substitua: → por ->, ≥ por >=, ≤ por <=, • por -, α por alfa, β por beta
   - Evite parênteses quando possível, use colchetes: [exemplo] ao invés de (exemplo)

6. **PROIBIDO**:
   - NÃO use IDs como n1, n2, root
   - NÃO use formas como (()), [[]], {{}}
   - NÃO use markdown dentro do JSON
   - NÃO pule níveis de indentação

EXEMPLO PERFEITO DE ESTRUTURA:
mindmap
  "Insuficiência Cardíaca"
    "Fisiopatologia"
      "Disfunção Sistólica"
        "Fração de Ejeção < 40%"
        "Dilatação Ventricular"
      "Disfunção Diastólica"
        "Relaxamento Prejudicado"
        "Complacência Reduzida"
    "Sintomas"
      "Congestivos"
        "Dispneia"
        "Ortopneia"
        "Edema"
      "Baixo Débito"
        "Fadiga"
        "Confusão Mental"

EXEMPLO DO JSON ESPERADO:
{
  "titulo": "Mapa Mental de Insuficiência Cardíaca",
  "mermaid": "mindmap\\n  \\"Insuficiência Cardíaca\\"\\n    \\"Fisiopatologia\\"\\n      \\"Disfunção Sistólica\\"\\n        \\"Fração de Ejeção < 40%\\"\\n        \\"Dilatação Ventricular\\"\\n      \\"Disfunção Diastólica\\"\\n        \\"Relaxamento Prejudicado\\"\\n        \\"Complacência Reduzida\\"\\n    \\"Sintomas\\"\\n      \\"Congestivos\\"\\n        \\"Dispneia\\"\\n        \\"Ortopneia\\""
}

REGRAS DE INDENTAÇÃO (MEMORIZE):
- 0 espaços: mindmap
- 2 espaços: nível 1 (título principal)
- 4 espaços: nível 2 (categorias principais)
- 6 espaços: nível 3 (subcategorias)
- 8 espaços: nível 4 (detalhes)
- 10 espaços: nível 5 (sub-detalhes)

Gere o JSON agora, seguindo EXATAMENTE as regras de indentação:`;

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
        parsed.mermaid = 'mindmap\n' + mermaidCode;
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
