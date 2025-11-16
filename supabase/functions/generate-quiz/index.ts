import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { callGemini, callGeminiWithFile, parseJsonFromResponse } from '../_shared/gemini.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { source_id, project_id, count = 15 } = await req.json();

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
      throw new Error('No content available to generate quiz');
    }

    // Generate quiz with Gemini
    const prompt = `Você é um professor especialista em medicina. Analise o conteúdo abaixo e gere ${count} perguntas de múltipla escolha de alta qualidade para estudantes de medicina.

CONTEÚDO:
${combinedContent}

INSTRUÇÕES:
1. Crie perguntas que testem compreensão profunda, não apenas memorização
2. Cada pergunta deve ter 4 alternativas (A, B, C, D)
3. Apenas UMA alternativa deve estar correta
4. Forneça uma justificativa clara e educativa para a resposta correta
5. Classifique a dificuldade como: "fácil", "médio" ou "difícil"
6. Identifique o tópico principal da pergunta
7. Quando apropriado, forneça uma dica que ajude sem revelar a resposta

FORMATO DE SAÍDA (JSON estrito):
{
  "perguntas": [
    {
      "pergunta": "Texto da pergunta aqui?",
      "opcoes": ["A) Primeira opção", "B) Segunda opção", "C) Terceira opção", "D) Quarta opção"],
      "resposta_correta": "A",
      "justificativa": "Explicação detalhada do porquê esta é a resposta correta e por que as outras estão erradas.",
      "dica": "Uma dica útil sem revelar a resposta",
      "topico": "Nome do tópico principal",
      "dificuldade": "médio"
    }
  ]
}

Retorne APENAS o JSON, sem texto adicional antes ou depois.`;

    const response = await callGemini(prompt);
    const parsed = parseJsonFromResponse(response);

    if (!parsed.perguntas || !Array.isArray(parsed.perguntas)) {
      throw new Error('Invalid response format from AI');
    }

    // Save questions to database
    const questionsToInsert = parsed.perguntas.map((q: any) => ({
      project_id: project_id || sources[0].project_id,
      source_id: source_id || null,
      pergunta: q.pergunta,
      opcoes: q.opcoes,
      resposta_correta: q.resposta_correta,
      justificativa: q.justificativa,
      dica: q.dica || null,
      topico: q.topico || null,
      dificuldade: q.dificuldade || 'médio',
    }));

    const { data: insertedQuestions, error: insertError } = await supabaseClient
      .from('questions')
      .insert(questionsToInsert)
      .select();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        success: true,
        count: insertedQuestions.length,
        questions: insertedQuestions,
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
