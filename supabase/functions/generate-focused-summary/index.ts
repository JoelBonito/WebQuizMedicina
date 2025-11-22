import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { securityHeaders, createErrorResponse, createSuccessResponse, RATE_LIMITS, checkRateLimit, authenticateRequest } from '../_shared/security.ts';
import { validateRequest, generateFocusedSummarySchema, sanitizeString, sanitizeHtml } from '../_shared/validation.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';
import { callGeminiWithUsage } from '../_shared/gemini.ts';
import { logTokenUsage } from '../_shared/token-logger.ts';
import { getOrCreateProjectCache } from '../_shared/project-cache.ts';

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

    // Build difficulty list for context
    const difficultiesList = difficulties
      .map((d, index) => {
        const stars = '⚠️'.repeat(Math.min(d.nivel, 5));
        const sanitizedTopic = sanitizeString(d.topico || 'Unknown');
        const sanitizedType = sanitizeString(d.tipo_origem || 'unknown');
        return `${index + 1}. ${sanitizedTopic} ${stars} (nível ${d.nivel}) - origem: ${sanitizedType}`;
      })
      .join('\n');

    const topTopics = difficulties.slice(0, 5).map(d => sanitizeString(d.topico));

    // STRATEGY: Use FULL sources (not semantic search)
    // With Flash being so cheap, full context gives better quality
    // Cost difference: ~$0.0003 USD per operation (negligible)
    // Quality gain: LLM sees complete context and makes better connections
    console.log('📚 [FULL-SOURCES] Using complete sources for maximum quality');

    const combinedContext = sources
      .map((source) => {
        const sanitizedName = sanitizeString(source.name || 'Unknown');
        const sanitizedContent = sanitizeString(source.extracted_content || '');
        return `[Fonte: ${sanitizedName}]\n${sanitizedContent}`;
      })
      .join('\n\n---\n\n');

    console.log(`📊 [FULL-SOURCES] ${sources.length} sources, ~${Math.ceil(combinedContext.length / 4)} tokens`);

    // OPTIMIZATION: Use project-level cache (reuse across operations)
    // Create or retrieve cached content for this project
    let cacheName: string | null = null;

    try {
      cacheName = await getOrCreateProjectCache(
        supabaseClient,
        project_id,
        'focused-summary-sources',
        combinedContext,
        'gemini-2.5-flash', // Flash is 32x cheaper than Pro!
        1800 // 30 minutes TTL
      );
    } catch (error) {
      console.warn('⚠️ [CACHE] Failed to create/retrieve cache, continuing without cache:', error);
      // Continue without cache rather than failing
    }

    // EXPANDED PROMPT: With Flash being cheap, we can afford detailed instructions
    // Cost: ~500 tokens × $0.075/1M = $0.0000375 USD (negligible)
    // Benefit: Much better quality from Flash model
    const prompt = `Você é um professor médico EXPERIENTE e DIDÁTICO criando material de estudo personalizado.

SEU OBJETIVO: Criar resumos que REALMENTE ajudem alunos que NÃO entenderam o tópico na primeira vez.

PERFIL DO ALUNO:
- Estudando: "${sanitizeString(project.name)}"
- Identificou ${difficulties.length} dificuldades durante estudos com quiz/flashcards
- Precisa de explicações SIMPLES, não muito técnicas
- Aprende melhor com analogias, exemplos práticos e conexões
- Está buscando COMPREENDER, não decorar

${!cacheName ? `MATERIAL DE ESTUDO COMPLETO:\n${combinedContext}\n\n` : ''}🎯 DIFICULDADES IDENTIFICADAS (ordenadas por prioridade):
${difficultiesList}

---

TAREFA: Criar resumo didático FOCADO EXCLUSIVAMENTE nos tópicos de dificuldade acima.

Para CADA tópico de dificuldade, você DEVE incluir as 5 seções abaixo:

📖 SEÇÃO 1 - Explicação Simples e Clara
Objetivo: Fazer o aluno ENTENDER, não decorar
- Nível de linguagem: Como explicaria para um colega que está aprendendo
- Evite jargões técnicos sem explicação
- Use frases curtas e diretas
- Comece com "Em termos simples..." ou "Basicamente..." ou "O que acontece é..."
- Dê contexto: POR QUE isso importa? QUANDO acontece?
- 2-3 parágrafos curtos

💡 SEÇÃO 2 - Analogia ou Exemplo Prático
Objetivo: Tornar o conceito MEMORÁVEL e VISUAL
- Compare com situações do cotidiano
- Use metáforas que criam imagens mentais
- Exemplo clínico prático quando aplicável
- Formato sugerido: "Pense nisso como..." ou "É como quando..." ou "Imagine que..."
- Seja criativo mas preciso
- 1-2 parágrafos

📌 SEÇÃO 3 - Pontos-Chave para Memorizar
Objetivo: Dar "ganchos" para fixação
- 3-5 bullet points essenciais
- Cada ponto: MÁXIMO 1 linha
- Use negrito para palavras-chave
- Inclua números, valores, critérios específicos
- Se possível, crie dica mnemônica ou frase de efeito
- Formato: <li><strong>[Conceito]:</strong> [Explicação curta]</li>

🏥 SEÇÃO 4 - Aplicação Clínica (se aplicável)
Objetivo: Mostrar QUANDO e COMO usar na prática
- Em que situações você precisa lembrar disso?
- Qual a importância prática desse conhecimento?
- Exemplos de casos reais ou questões de prova
- Como evitar erros comuns?
- Por que isso cai em concursos/residência?
- 1-2 parágrafos

🔗 SEÇÃO 5 - Conexões com Outros Conceitos
Objetivo: Integrar conhecimento, não isolar
- Como este tópico se conecta com outros assuntos?
- Relações de causa-efeito
- Quadro geral: onde isso se encaixa?
- O que estudar em seguida para consolidar?
- Use lista de bullet points para clareza

---

FORMATO HTML - Estrutura Semântica:

ESTRUTURA GERAL:
<div class="focused-summary">
  <div class="summary-header">
    <h1>🎯 Resumo Focado nas Suas Dificuldades</h1>
    <p class="subtitle">Material personalizado para ${sanitizeString(project.name)}</p>
    <p class="meta">Baseado em ${difficulties.length} tópicos identificados durante seus estudos</p>
  </div>

  <!-- Repetir seção abaixo para CADA tópico de dificuldade -->
  <section class="difficulty-topic" data-nivel="[nível]">
    ...
  </section>
</div>

ESTRUTURA DE CADA TÓPICO:
<section class="difficulty-topic" data-nivel="[nível]">
  <div class="topic-header">
    <h2>[número]. [Nome do Tópico] [⚠️ símbolos correspondentes ao nível]</h2>
    <span class="origin-badge">[origem: quiz/flashcard/chat]</span>
  </div>

  <div class="explanation">
    <h3>🔍 Explicação Simples</h3>
    <p>[Primeiro parágrafo: conceito básico]</p>
    <p>[Segundo parágrafo: por que importa]</p>
  </div>

  <div class="analogy">
    <h3>💡 Analogia/Exemplo Prático</h3>
    <p>[Analogia concreta e memorável]</p>
  </div>

  <div class="key-points">
    <h3>📌 Pontos-Chave</h3>
    <ul>
      <li><strong>Conceito 1:</strong> Explicação curta</li>
      <li><strong>Conceito 2:</strong> Explicação curta</li>
      <li><strong>Conceito 3:</strong> Explicação curta</li>
      <li>💡 <strong>Dica:</strong> Mnemônico ou frase de efeito (se aplicável)</li>
    </ul>
  </div>

  <div class="clinical-application">
    <h3>🏥 Aplicação Clínica</h3>
    <p>[Quando/como isso importa na prática médica]</p>
  </div>

  <div class="connections">
    <h3>🔗 Conexões com Outros Conceitos</h3>
    <ul>
      <li><strong>[Tópico relacionado 1]:</strong> Como se conecta</li>
      <li><strong>[Tópico relacionado 2]:</strong> Como se conecta</li>
    </ul>
  </div>
</section>

---

INSTRUÇÕES CRÍTICAS - LEIA COM ATENÇÃO:

✅ QUALIDADE DO HTML:
- HTML VÁLIDO e bem estruturado
- Feche todas as tags corretamente
- Use classes CSS descritivas (explanation, analogy, key-points, clinical-application, connections)
- Estrutura bem indentada e organizada
- Não use atributos inline style

✅ PRIORIZAÇÃO:
- Tópicos com MAIS ⚠️ (maior nível) devem vir PRIMEIRO
- Dedique mais detalhes e exemplos aos tópicos mais difíceis
- Se tópicos forem relacionados, mencione as conexões

✅ TOM E LINGUAGEM:
- Tom ENCORAJADOR e POSITIVO
- "Você consegue entender isso!" não "Isso é complicado"
- Linguagem ACESSÍVEL, não muito técnica
- Explique termos médicos quando usá-los
- Use negrito <strong> para dar ênfase
- Emojis apenas nos títulos das seções (🔍💡📌🏥🔗)

✅ FOCO:
- COMPREENSÃO > memorização mecânica
- POR QUÊ e QUANDO > decoreba de fatos
- APLICAÇÃO PRÁTICA > teoria abstrata
- CONEXÕES > tópicos isolados

❌ NÃO FAÇA:
- Não use jargão médico sem explicar
- Não presuma que o aluno já sabe conceitos básicos
- Não seja vago ou genérico ("isso é importante", "estude bem")
- Não ignore nenhum tópico da lista de dificuldades
- Não copie texto do material sem adaptar para linguagem didática
- Não crie seções vazias

---

EXEMPLO DE BOA EXPLICAÇÃO (para você seguir):

❌ RUIM (técnico demais, sem contexto):
"A fibrilação atrial é uma arritmia cardíaca caracterizada por despolarização atrial descoordenada resultante de múltiplos focos ectópicos."

✅ BOM (simples, com contexto, memorável):

<div class="explanation">
  <h3>🔍 Explicação Simples</h3>
  <p>Em termos simples: A fibrilação atrial (FA) acontece quando as câmaras superiores do coração (os átrios) começam a bater de forma completamente descoordenada e muito rápida - tipo um motor falhando. Em vez de contrair de forma organizada, eles "tremem" ou "fibrilam", daí o nome.</p>
  <p>Por que isso importa? Quando os átrios não contraem direito, o sangue fica "parado" lá dentro e pode formar coágulos. Esses coágulos podem soltar e ir para o cérebro, causando AVC. Essa é a complicação mais temida da FA!</p>
</div>

<div class="analogy">
  <h3>💡 Analogia Prática</h3>
  <p>Pense nos átrios como uma orquestra. Normalmente, todos os músicos tocam em sincronia perfeita, seguindo o maestro (nó sinusal). Na fibrilação atrial, cada músico resolve tocar no seu próprio ritmo - vira uma bagunça total! O coração até continua funcionando, mas de forma muito ineficiente.</p>
</div>

<div class="key-points">
  <h3>📌 Pontos-Chave</h3>
  <ul>
    <li><strong>Ritmo:</strong> Irregularmente irregular (sem nenhum padrão)</li>
    <li><strong>Principal risco:</strong> Formação de coágulos → AVC (15-20% ao ano sem anticoagulação)</li>
    <li><strong>Sintomas comuns:</strong> Palpitações, cansaço, falta de ar</li>
    <li><strong>ECG clássico:</strong> Ausência de onda P + intervalos R-R completamente irregulares</li>
    <li>💡 <strong>Mnemônico:</strong> "FA = Falta de Atividade atrial coordenada"</li>
  </ul>
</div>

---

AGORA É COM VOCÊ:

Crie o resumo focado seguindo EXATAMENTE o formato acima para TODOS os ${difficulties.length} tópicos de dificuldade listados.

Responda APENAS com o HTML completo e bem formatado. Não adicione explicações fora do HTML.`;

    // Call Gemini FLASH with expanded prompt and cache
    const result = await callGeminiWithUsage(
      prompt,
      'gemini-2.5-flash', // ✅ Flash is 32x cheaper and fully capable!
      undefined, // maxTokens (use default)
      undefined, // systemInstruction
      cacheName || undefined // Use cache if available
    );

    // Sanitize AI-generated HTML to prevent XSS
    const sanitizedHtml = sanitizeHtml(result.text);

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

    // Log Token Usage for Admin Analytics (with optimization metrics)
    await logTokenUsage(
      supabaseClient,
      user.id,
      project_id,
      'summary',
      {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cachedTokens: result.usage.cachedTokens || 0,
      },
      'gemini-2.5-flash',
      {
        summary_id: summary.id,
        summary_type: 'focused',
        difficulties_count: difficulties.length,
        sources_count: sources.length,
        strategy: 'full-sources', // Using all sources for best quality
        used_cache: cacheName !== null,
        cache_hit: (result.usage.cachedTokens || 0) > 0,
      }
    );

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
