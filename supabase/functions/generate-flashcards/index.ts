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
    const { source_id, project_id, count = 20 } = await req.json();

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
    for (const source of sources) {
      if (source.extracted_content) {
        combinedContent += `\n\n=== ${source.name} ===\n${source.extracted_content}`;
      }
    }

    if (!combinedContent.trim()) {
      throw new Error('No content available to generate flashcards');
    }

    // Generate flashcards with Gemini
    const prompt = `Você é um professor especialista em medicina. Analise o conteúdo abaixo e crie ${count} flashcards de alta qualidade para estudantes de medicina.

CONTEÚDO:
${combinedContent}

INSTRUÇÕES:
1. Cada flashcard deve ter uma FRENTE (pergunta/conceito) e VERSO (resposta/explicação)
2. Foque em conceitos-chave, definições, mecanismos e fatos importantes
3. A frente deve ser concisa e clara (pergunta ou termo)
4. O verso deve conter uma explicação completa mas sucinta
5. Classifique a dificuldade como: "fácil", "médio" ou "difícil"
6. Identifique o tópico principal
7. Varie entre diferentes tipos: definições, mecanismos, comparações, aplicações clínicas

FORMATO DE SAÍDA (JSON estrito):
{
  "flashcards": [
    {
      "frente": "Pergunta ou conceito aqui",
      "verso": "Resposta ou explicação detalhada aqui",
      "topico": "Nome do tópico principal",
      "dificuldade": "médio"
    }
  ]
}

Retorne APENAS o JSON, sem texto adicional antes ou depois.`;

    const response = await callGemini(prompt);
    const parsed = parseJsonFromResponse(response);

    if (!parsed.flashcards || !Array.isArray(parsed.flashcards)) {
      throw new Error('Invalid response format from AI');
    }

    // Save flashcards to database
    const flashcardsToInsert = parsed.flashcards.map((f: any) => ({
      project_id: project_id || sources[0].project_id,
      source_id: source_id || null,
      frente: f.frente,
      verso: f.verso,
      topico: f.topico || null,
      dificuldade: f.dificuldade || 'médio',
    }));

    const { data: insertedFlashcards, error: insertError } = await supabaseClient
      .from('flashcards')
      .insert(flashcardsToInsert)
      .select();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        success: true,
        count: insertedFlashcards.length,
        flashcards: insertedFlashcards,
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
