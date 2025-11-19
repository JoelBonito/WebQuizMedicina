import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { securityHeaders, createErrorResponse, createSuccessResponse, RATE_LIMITS, checkRateLimit, authenticateRequest } from '../_shared/security.ts';
import { validateRequest, generateFocusedSummarySchema, sanitizeString, sanitizeHtml } from '../_shared/validation.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';
import { callGemini } from '../_shared/gemini.ts';

// Lazy-initialize AuditLogger to avoid crashes if env vars are missing
let auditLogger: AuditLogger | null = null;
function getAuditLogger(): AuditLogger {
  if (!auditLogger) {
    auditLogger = new AuditLogger(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );
  }
  return auditLogger;
}

// Force re-deploy: Fix AuditLogger lazy initialization with params (2025-11-17 22:45)

serve(async (req) => {
  // Handle CORS preflight - MUST return 200 OK immediately
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: securityHeaders
    });
  }

  try {
    // 1. Rate limiting (10 requests per minute for AI generation)
    const rateLimitResult = await checkRateLimit(req, RATE_LIMITS.AI_GENERATION);
    if (!rateLimitResult.allowed) {
      await getAuditLogger().logSecurity(
        AuditEventType.SECURITY_RATE_LIMIT_EXCEEDED,
        req,
        null,
        { endpoint: 'generate-focused-summary', limit: RATE_LIMITS.AI_GENERATION.maxRequests }
      );

      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        {
          status: 429,
          headers: {
            ...securityHeaders,
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': '0',
            'Retry-After': String(Math.ceil(rateLimitResult.retryAfter / 1000)),
          },
        }
      );
    }

    // 2. Authentication
    const authResult = await authenticateRequest(req);
    if (!authResult.authenticated || !authResult.user) {
      await getAuditLogger().logAuth(
        AuditEventType.AUTH_FAILED_LOGIN,
        null,
        req,
        { reason: 'Invalid or missing token', endpoint: 'generate-focused-summary' }
      );

      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = authResult.user;

    // 3. Input validation
    const validatedData = await validateRequest(req, generateFocusedSummarySchema);
    const { project_id } = validatedData;

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
        { status: 404, headers: { ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's difficulties (not resolved, ordered by level)
    const { data: difficulties, error: difficultiesError } = await supabaseClient
      .from('difficulties')
      .select('*')
      .eq('user_id', user.id)
      .eq('project_id', project_id)
      .eq('resolvido', false)
      .order('nivel', { ascending: false })
      .limit(10);

    if (difficultiesError) {
      throw difficultiesError;
    }

    if (!difficulties || difficulties.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No difficulties found. Study with quiz and flashcards first to identify your weak points.'
        }),
        { status: 400, headers: { ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all sources for this project
    const { data: sources, error: sourcesError } = await supabaseClient
      .from('sources')
      .select('id, name, extracted_content')
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
        { status: 400, headers: { ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Combine all sources (sanitize to prevent prompt injection)
    const combinedContext = sources
      .map((source) => {
        const sanitizedName = sanitizeString(source.name || 'Unknown');
        const sanitizedContent = sanitizeString(source.extracted_content || '');
        return `[Fonte: ${sanitizedName}]\n${sanitizedContent}`;
      })
      .join('\n\n---\n\n');

    // Build focused prompt (sanitize all user-generated data)
    const difficultiesList = difficulties
      .map((d, index) => {
        const stars = '⚠️'.repeat(Math.min(d.nivel, 5));
        const sanitizedTopic = sanitizeString(d.topico || 'Unknown');
        const sanitizedType = sanitizeString(d.tipo_origem || 'unknown');
        return `${index + 1}. ${sanitizedTopic} ${stars} (nível ${d.nivel}) - origem: ${sanitizedType}`;
      })
      .join('\n');

    const topTopics = difficulties.slice(0, 5).map(d => sanitizeString(d.topico));

    const prompt = `Você é um professor médico especializado em criar material didático personalizado.

CONTEXTO DO ALUNO:
O aluno está estudando "${sanitizeString(project.name)}" e identificou dificuldades específicas durante seus estudos.

MATERIAL DE ESTUDO DISPONÍVEL:
${combinedContext}

🎯 DIFICULDADES IDENTIFICADAS PELO ALUNO (${difficulties.length} tópicos):
${difficultiesList}

TÓPICOS PRIORITÁRIOS PARA ESTE RESUMO:
${topTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

---

TAREFA:
Crie um resumo didático FOCADO EXCLUSIVAMENTE nos tópicos de dificuldade listados acima.

Para CADA tópico de dificuldade, você DEVE incluir:

1. **Explicação SIMPLES e CLARA** (nível de estudante que está aprendendo)
   - Use linguagem acessível, evite jargões desnecessários
   - Explique como se estivesse falando com alguém que NÃO entendeu pela primeira vez

2. **Analogia ou Exemplo Prático**
   - Compare com situações do dia a dia
   - Use metáforas que facilitam memorização
   - Exemplo clínico prático quando aplicável

3. **Pontos-Chave para Memorizar**
   - 3-5 bullet points essenciais
   - Frases curtas e diretas
   - Dicas mnemônicas quando possível

4. **Aplicação Clínica** (se aplicável)
   - Quando isso é importante na prática médica?
   - Exemplos de situações reais

5. **Relação com Outros Conceitos**
   - Como este tópico se conecta com outros assuntos?
   - Visão do "quadro geral"

---

FORMATO DE SAÍDA (HTML estruturado):

<div class="focused-summary">
  <div class="summary-header">
    <h1>🎯 Resumo Focado nas Suas Dificuldades</h1>
    <p class="subtitle">Material personalizado para ${sanitizeString(project.name)}</p>
    <p class="meta">Baseado em ${difficulties.length} tópicos identificados durante seus estudos</p>
  </div>

  <section class="difficulty-topic" data-nivel="[nivel]">
    <div class="topic-header">
      <h2>[número]. [Nome do Tópico] [símbolos de dificuldade]</h2>
      <span class="origin-badge">[origem: quiz/flashcard/chat]</span>
    </div>

    <div class="explanation">
      <h3>🔍 Explicação Simples</h3>
      <p>[Explicação clara e acessível]</p>
    </div>

    <div class="analogy">
      <h3>💡 Analogia/Exemplo Prático</h3>
      <p>[Analogia ou exemplo que facilita compreensão]</p>
    </div>

    <div class="key-points">
      <h3>📌 Pontos-Chave para Memorizar</h3>
      <ul>
        <li><strong>[Conceito]:</strong> [Explicação curta]</li>
        <li><strong>[Conceito]:</strong> [Explicação curta]</li>
        <li>[Dica mnemônica se aplicável]</li>
      </ul>
    </div>

    <div class="clinical-application">
      <h3>🏥 Aplicação Clínica</h3>
      <p>[Quando/como isso importa na prática]</p>
    </div>

    <div class="connections">
      <h3>🔗 Conexões com Outros Conceitos</h3>
      <p>[Relações com outros tópicos]</p>
    </div>
  </section>

  <!-- Repetir para cada tópico de dificuldade -->
</div>

---

INSTRUÇÕES IMPORTANTES:
- Use HTML válido e bem formatado
- PRIORIZE os tópicos com maior nível de dificuldade (mais ⚠️)
- Seja DIDÁTICO, não técnico demais
- Use formatação para facilitar leitura (negrito, listas, destaques)
- Inclua TODOS os tópicos da lista de dificuldades
- Mantenha um tom encorajador e positivo
- Foque em COMPREENSÃO, não memorização mecânica

Responda APENAS com o HTML formatado, sem explicações adicionais.`;

    // Call Gemini with focused prompt (use Pro for better quality)
    const htmlContent = await callGemini(prompt, 'gemini-2.5-pro');

    // Sanitize AI-generated HTML to prevent XSS
    const sanitizedHtml = sanitizeHtml(htmlContent);

    // Save the focused summary (with sanitized content)
    const { data: summary, error: summaryError } = await supabaseClient
      .from('summaries')
      .insert({
        project_id,
        titulo: `🎯 Resumo Focado nas Suas Dificuldades`,
        conteudo_html: sanitizedHtml,
        topicos: topTopics,
      })
      .select()
      .single();

    if (summaryError) {
      throw summaryError;
    }

    // Audit log: AI focused summary generation
    await getAuditLogger().logAIGeneration(
      AuditEventType.AI_SUMMARY_GENERATED,
      user.id,
      project_id,
      req,
      {
        summary_type: 'focused',
        difficulties_count: difficulties.length,
        sources_count: sources.length,
        summary_id: summary.id,
      }
    );

    return createSuccessResponse({
      success: true,
      summary,
      difficulties_count: difficulties.length,
      top_topics: topTopics,
    });
  } catch (error) {
    // Secure error response (no stack traces to client)
    return createErrorResponse(error as Error, 500);
  }
});
