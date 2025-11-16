import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { callGemini } from '../_shared/gemini.ts';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message, project_id } = await req.json();

    if (!message || !project_id) {
      return new Response(
        JSON.stringify({ error: 'message and project_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify project ownership
    const { data: project, error: projectError } = await supabaseClient
      .from('projects')
      .select('id, name')
      .eq('id', project_id)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: 'Project not found or unauthorized' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all sources for this project
    const { data: sources, error: sourcesError } = await supabaseClient
      .from('sources')
      .select('id, file_name, extracted_content, file_type')
      .eq('project_id', project_id)
      .eq('status', 'ready')
      .not('extracted_content', 'is', null);

    if (sourcesError) {
      throw sourcesError;
    }

    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No sources available. Please upload and process sources first.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's difficulties for context
    const { data: difficulties } = await supabaseClient
      .from('difficulties')
      .select('topico, nivel')
      .eq('user_id', user.id)
      .eq('resolvido', false)
      .order('nivel', { ascending: false })
      .limit(5);

    // Simple RAG: Combine all sources (for MVP - in production, use embeddings + vector search)
    const combinedContext = sources
      .map((source) => `[Fonte: ${source.file_name}]\n${source.extracted_content}`)
      .join('\n\n---\n\n');

    // Build prompt with RAG context
    let prompt = `Você é um assistente de estudos médicos especializado. Você tem acesso às seguintes fontes do projeto "${project.name}":\n\n${combinedContext}\n\n`;

    if (difficulties && difficulties.length > 0) {
      const topicsList = difficulties.map((d) => `- ${d.topico} (nível de dificuldade: ${d.nivel})`).join('\n');
      prompt += `\nO aluno tem dificuldade nos seguintes tópicos:\n${topicsList}\n\n`;
      prompt += `Ao responder, considere essas dificuldades e ofereça explicações mais detalhadas nesses tópicos quando relevante.\n\n`;
    }

    prompt += `Pergunta do aluno: ${message}\n\n`;
    prompt += `Instruções:
1. Responda APENAS com base nas fontes fornecidas acima
2. Se a informação não estiver nas fontes, diga claramente que não encontrou
3. Sempre cite a fonte (nome do arquivo) ao mencionar informações específicas
4. Use formatação markdown para melhor legibilidade
5. Se a pergunta relacionar-se com algum tópico de dificuldade do aluno, dê uma explicação mais detalhada
6. Seja didático e claro, usando exemplos quando apropriado

Resposta:`;

    // Call Gemini with RAG context
    const response = await callGemini(prompt, 'gemini-2.5-flash');

    // Extract sources mentioned (simple approach - match file names in response)
    const citedSources = sources
      .filter((source) => response.toLowerCase().includes(source.file_name.toLowerCase()))
      .map((source) => ({
        id: source.id,
        file_name: source.file_name,
        file_type: source.file_type,
      }));

    // Save chat message to database
    const { error: messageError } = await supabaseClient.from('chat_messages').insert({
      project_id,
      user_id: user.id,
      message,
      response,
      sources_cited: citedSources.map((s) => s.id),
    });

    if (messageError) {
      console.error('Error saving message:', messageError);
      // Don't throw - still return the response
    }

    // Check if response suggests topics related to difficulties
    const suggestedTopics = difficulties
      ? difficulties
          .filter((d) => response.toLowerCase().includes(d.topico.toLowerCase()))
          .map((d) => d.topico)
      : [];

    return new Response(
      JSON.stringify({
        response,
        cited_sources: citedSources,
        suggested_topics: suggestedTopics,
        has_difficulties_context: difficulties && difficulties.length > 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in chat function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
