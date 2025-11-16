import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { callGemini, parseJsonFromResponse } from '../_shared/gemini.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { source_id, project_id } = await req.json();

    if (!source_id && !project_id) {
      throw new Error('source_id or project_id is required');
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get auth user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    let sources = [];

    // Fetch source(s)
    if (source_id) {
      const { data, error } = await supabaseClient
        .from('sources')
        .select('*')
        .eq('id', source_id)
        .single();

      if (error) throw error;
      sources = [data];
    } else {
      const { data, error } = await supabaseClient
        .from('sources')
        .select('*')
        .eq('project_id', project_id)
        .eq('status', 'ready');

      if (error) throw error;
      sources = data || [];
    }

    if (sources.length === 0) {
      throw new Error('No sources found');
    }

    // Combine content from all sources
    let combinedContent = '';
    const sourceIds = [];
    for (const source of sources) {
      sourceIds.push(source.id);
      if (source.extracted_content) {
        combinedContent += `\n\n=== ${source.name} ===\n${source.extracted_content}`;
      }
    }

    if (!combinedContent.trim()) {
      throw new Error('No content available to generate summary');
    }

    // Generate summary with Gemini
    const prompt = `Você é um professor especialista em medicina. Analise o conteúdo abaixo e crie um resumo estruturado e completo para estudantes de medicina.

CONTEÚDO:
${combinedContent}

INSTRUÇÕES:
1. Crie um título descritivo e atrativo para o resumo
2. Organize o conteúdo em HTML bem estruturado usando:
   - <h2> para seções principais
   - <h3> para subseções
   - <p> para parágrafos
   - <ul> e <li> para listas
   - <strong> para termos importantes
   - <em> para ênfase
3. Identifique os tópicos principais abordados
4. Seja claro, conciso mas completo
5. Mantenha a terminologia médica correta
6. Organize logicamente (introdução → conceitos → mecanismos → aplicações clínicas)

FORMATO DE SAÍDA (JSON estrito):
{
  "titulo": "Título do Resumo",
  "conteudo_html": "<h2>Seção 1</h2><p>Conteúdo...</p><h3>Subseção</h3><ul><li>Item 1</li><li>Item 2</li></ul>",
  "topicos": ["Tópico 1", "Tópico 2", "Tópico 3"]
}

Retorne APENAS o JSON, sem texto adicional antes ou depois.`;

    const response = await callGemini(prompt, 'gemini-1.5-pro');
    const parsed = parseJsonFromResponse(response);

    if (!parsed.titulo || !parsed.conteudo_html) {
      throw new Error('Invalid response format from AI');
    }

    // Save summary to database
    const { data: insertedSummary, error: insertError } = await supabaseClient
      .from('summaries')
      .insert({
        project_id: project_id || sources[0].project_id,
        titulo: parsed.titulo,
        conteudo_html: parsed.conteudo_html,
        topicos: parsed.topicos || [],
        source_ids: sourceIds,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        success: true,
        summary: insertedSummary,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
