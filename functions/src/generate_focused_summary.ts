import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { onCall } from "firebase-functions/v2/https";
import { callGeminiWithUsage } from "./shared/gemini";
import { sanitizeHtml, sanitizeString } from "./shared/sanitization";
import { validateRequest, generateFocusedSummarySchema } from "./shared/validation";
import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";

const db = admin.firestore();

export const generate_focused_summary = onCall({
  timeoutSeconds: 120, // Increased timeout for potentially large context
  memory: "1GiB",
  region: "us-central1",
}, async (request) => {
  try {
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { project_id } = validateRequest(request.data, generateFocusedSummarySchema);
    const userId = request.auth.uid;

    // 1. Verify project ownership and get name
    const projectDoc = await db.collection("projects").doc(project_id).get();
    if (!projectDoc.exists || projectDoc.data()?.user_id !== userId) {
      throw new functions.https.HttpsError("not-found", "Project not found or unauthorized");
    }
    const project = projectDoc.data();

    // 2. Get user's difficulties (not resolved, ordered by level)
    const difficultiesSnapshot = await db.collection("difficulties")
      .where("user_id", "==", userId)
      .where("project_id", "==", project_id)
      .where("resolvido", "==", false)
      .orderBy("nivel", "desc")
      .limit(10)
      .get();

    const difficulties = difficultiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (difficulties.length === 0) {
      throw new functions.https.HttpsError("failed-precondition", "No difficulties found. Study with quiz and flashcards first to identify your weak points.");
    }

    // 3. Get all sources for this project
    const sourcesSnapshot = await db.collection("sources")
      .where("project_id", "==", project_id)
      .where("status", "==", "ready")
      .get();

    const sources = sourcesSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter((s: any) => s.extracted_content); // Ensure content exists

    if (sources.length === 0) {
      throw new functions.https.HttpsError("failed-precondition", "No sources available. Please upload and process sources first.");
    }

    // 4. Build difficulty list for context
    const difficultiesList = difficulties
      .map((d: any, index: number) => {
        const stars = '⚠️'.repeat(Math.min(d.nivel, 5));
        const sanitizedTopic = sanitizeString(d.topico || 'Unknown');
        const sanitizedType = sanitizeString(d.tipo_origem || 'unknown');
        return `${index + 1}. ${sanitizedTopic} ${stars} (nível ${d.nivel}) - origem: ${sanitizedType}`;
      })
      .join('\n');

    const topTopics = difficulties.slice(0, 5).map((d: any) => sanitizeString(d.topico));

    // 5. Build Context
    console.log('📚 [FULL-SOURCES] Using complete sources for maximum quality');

    const combinedContext = sources
      .map((source: any) => {
        const sanitizedName = sanitizeString(source.name || 'Unknown');
        const sanitizedContent = sanitizeString(source.extracted_content || '');
        return `[Fonte: ${sanitizedName}]\n${sanitizedContent}`;
      })
      .join('\n\n---\n\n');

    console.log(`📊 [FULL-SOURCES] ${sources.length} sources, ~${Math.ceil(combinedContext.length / 4)} tokens`);

    // 6. Construct Prompt
    const prompt = `Você é um professor médico EXPERIENTE e DIDÁTICO criando material de estudo personalizado.

SEU OBJETIVO: Criar resumos que REALMENTE ajudem alunos que NÃO entenderam o tópico na primeira vez.

PERFIL DO ALUNO:
- Estudando: "${sanitizeString(project?.name || '')}"
- Identificou ${difficulties.length} dificuldades durante estudos com quiz/flashcards
- Precisa de explicações SIMPLES, não muito técnicas
- Aprende melhor com analogias, exemplos práticos e conexões
- Está buscando COMPREENDER, não decorar

MATERIAL DE ESTUDO COMPLETO:
${combinedContext}

🎯 DIFICULDADES IDENTIFICADAS (ordenadas por prioridade):
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
    <p class="subtitle">Material personalizado para ${sanitizeString(project?.name || '')}</p>
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

    // 7. Call Gemini
    // ✅ Seleção automática e inteligente
    const selector = getModelSelector();
    const modelName = await selector.selectBestModel('general');
    console.log(`🤖 Using model: ${modelName} for focused summary`);

    let result;
    try {
      result = await callGeminiWithUsage(
        prompt,
        modelName,
        undefined, // maxOutputTokens (use default)
        false // jsonMode (we want HTML)
      );
    } catch (error: any) {
      // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
      if (error.status === 404 || error.message.includes('not found')) {
        console.warn('⚠️ Primary model failed, trying fallback...');
        const fallbackModel = 'gemini-flash-latest'; // Safe fallback
        console.log(`🤖 Using fallback model: ${fallbackModel}`);
        result = await callGeminiWithUsage(
          prompt,
          fallbackModel,
          undefined,
          false
        );
      } else {
        throw error;
      }
    }

    // 8. Sanitize HTML
    const sanitizedHtml = sanitizeHtml(result.text);

    // 9. Save Summary
    const summaryData = {
      project_id,
      user_id: userId, // Added user_id for RLS/security
      titulo: `🎯 Resumo Focado nas Suas Dificuldades`,
      conteudo_html: sanitizedHtml,
      topicos: topTopics,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      type: 'focused', // Added type for filtering
      difficulties_count: difficulties.length
    };

    const docRef = await db.collection("summaries").add(summaryData);
    const savedDoc = await docRef.get();

    // 10. Log Token Usage
    await logTokenUsage(
      userId,
      project_id,
      "focused_summary",
      result.usage.inputTokens,
      result.usage.outputTokens,
      modelName, // Log the actual model used
      { difficulties_count: difficulties.length, top_topics: topTopics }
    );

    return {
      success: true,
      summary: { id: docRef.id, ...savedDoc.data() },
      difficulties_count: difficulties.length,
      top_topics: topTopics,
    };

  } catch (error: any) {
    console.error("❌ Error generating focused summary:", error);
    throw new functions.https.HttpsError("internal", error.message || "Failed to generate focused summary");
  }
});
