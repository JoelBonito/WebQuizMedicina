
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Tentar carregar service account
const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ service-account.json não encontrado na raiz.');
    process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

// Prevenir reaproveitamento de app se já inicializado (embora seja script único)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// ID Fornecido pelo usuário
const TARGET_PROJECT_ID = 'Nx7psBo0MlYtqeBfh4Od';

async function diagnoseSpecificProject() {
    try {
        console.log(`🔍 Iniciando diagnóstico para o projeto: ${TARGET_PROJECT_ID}`);

        // 1. Buscar informações do projeto
        const projectDoc = await db.collection('projects').doc(TARGET_PROJECT_ID).get();
        if (!projectDoc.exists) {
            console.error('❌ Projeto não encontrado com este ID.');
            return;
        }
        const project = projectDoc.data();
        console.log(`📁 Título do Projeto: ${project?.title || 'Sem título'}`);
        // console.log(`👤 ID do Usuário: ${project?.user_id}`); // Removido para evitar travar se não tiver user_id

        // 2. Buscar as questões mais recentes deste projeto
        // Pegar as últimas 20 questões para análise
        const questionsSnapshot = await db.collection('questions')
            .where('project_id', '==', TARGET_PROJECT_ID)
            .orderBy('created_at', 'desc')
            .limit(20)
            .get();

        if (questionsSnapshot.empty) {
            console.error('❌ Nenhuma questão encontrada para este projeto.');
            return;
        }

        const quizQuestions = questionsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const latestDate = quizQuestions[0].created_at ? quizQuestions[0].created_at.toDate() : new Date();
        console.log(`📚 Questões analisadas: ${quizQuestions.length}`);
        console.log(`📅 Data do último quiz gerado: ${latestDate.toLocaleString()}`);

        // 3. Buscar Fontes (Summaries e Sources)
        console.log('🕵️ Buscando fontes de conteúdo...');

        const sourceTopics = new Set();

        // A. Resumos (Summaries)
        const summariesSnapshot = await db.collection('summaries')
            .where('project_id', '==', TARGET_PROJECT_ID)
            .orderBy('created_at', 'desc')
            .limit(5) // Limitar para evitar memory leak se tiver muitos
            .get();

        console.log(`📄 Resumos encontrados: ${summariesSnapshot.size}`);
        summariesSnapshot.docs.forEach((doc, idx) => {
            const content = doc.data().content || '';
            console.log(`   [Resumo ${idx + 1}] ID: ${doc.id} | Tamanho: ${content.length} chars`);

            // Tentar extrair tópicos do resumo (Markdown headers)
            const matches = content.match(/##\s+(.+)/g) || [];
            if (matches.length > 0) {
                console.log(`   ✅ ${matches.length} tópicos detectados via Regex (## )`);
                matches.forEach(m => sourceTopics.add(m.replace(/##\s+/, '').trim()));
            } else {
                // Tentar outra estratégia de regex se ## falhar (ex: **Tópico:**)
                const boldMatches = content.match(/\*\*(.+?)\*\*/g) || [];
                if (boldMatches.length > 5) {
                    console.log(`   ⚠️ Usando estratégia de negrito para tópicos (${boldMatches.length} encontrados)`);
                    boldMatches.slice(0, 20).forEach(m => sourceTopics.add(m.replace(/\*\*/g, '').trim()));
                }
            }
        });

        // B. Sources Originais (apenas metadata)
        const sourcesSnapshot = await db.collection('sources')
            .where('project_id', '==', TARGET_PROJECT_ID)
            .limit(10)
            .get();

        console.log(`📦 Fontes originais: ${sourcesSnapshot.size}`);
        sourcesSnapshot.docs.forEach(doc => {
            const data = doc.data();
            //  console.log(`   - ${data.name} (${data.type})`);
            // Se tiver tópicos explicitos no metadata (alguns sistemas salvam)
            if (data.topics && Array.isArray(data.topics)) {
                data.topics.forEach(t => sourceTopics.add(t));
            }
        });

        const extractedSourceTopics = Array.from(sourceTopics);
        console.log(`📋 Total de tópicos identificados nas fontes: ${extractedSourceTopics.length}`);
        if (extractedSourceTopics.length > 0) {
            console.log(`   Amostra: ${extractedSourceTopics.slice(0, 5).join(', ')} ...`);
        } else {
            console.log('⚠️ ALERTA: Não foi possível extrair tópicos das fontes. A análise de cobertura será prejudicada.');
        }

        // 4. Análise de Consistência das Perguntas
        console.log('\n🧐 Verificação de Qualidade das Perguntas:');
        let issues = 0;

        // Agrupar por Session ID para ver consistência do lote
        const sessions = {};
        quizQuestions.forEach(q => {
            const sid = q.session_id || 'sem_sessao';
            if (!sessions[sid]) sessions[sid] = 0;
            sessions[sid]++;
        });
        console.log('Sessões detectadas nas últimas 20 questões:', sessions);

        quizQuestions.forEach((q, i) => {
            const num = i + 1;

            // a) Checar Tópico
            if (!q.topico) {
                console.log(`⚠️ Questão ${num}: Sem tópico definido.`);
                issues++;
            } else {
                // Verificar se o tópico existe nas fontes (se tivermos fontes)
                if (extractedSourceTopics.length > 0) {
                    const match = extractedSourceTopics.some(st =>
                        st.toLowerCase().includes(q.topico.toLowerCase()) ||
                        q.topico.toLowerCase().includes(st.toLowerCase())
                    );
                    if (!match) {
                        // console.log(`ℹ️ Questão ${num}: Tópico '${q.topico}' não encontrado explicitamente nos resumos.`);
                    }
                }
            }

            // b) Checar Resposta Correta e Opções
            let cleanOptions = q.opcoes;
            if (typeof q.opcoes === 'string') {
                try { cleanOptions = JSON.parse(q.opcoes); } catch (e) { }
            }

            if (!Array.isArray(cleanOptions) || cleanOptions.length === 0) {
                console.log(`❌ Questão ${num}: Opções inválidas ou vazias.`);
                console.log('RAW OPCOES:', q.opcoes);
                issues++;
            } else {
                // Validar se resposta correta faz sentido
                const answer = q.resposta_correta;

                // Se for VF, deve ser Verdadeiro ou Falso
                if (q.tipo === 'verdadeiro_falso') {
                    if (!['Verdadeiro', 'Falso', 'V', 'F', 'True', 'False'].includes(answer)) {
                        console.log(`⚠️ Questão ${num} (VF): Resposta '${answer}' fora do padrão.`);
                    }
                } else {
                    // Múltipla escolha
                    // Deve ser A, B, C, D ou o texto exato
                    const isLetter = /^[A-E]$/.test(answer);
                    const isTextMatch = cleanOptions.some(opt => opt === answer || opt.startsWith(answer + ')'));

                    if (!isLetter && !isTextMatch) {
                        console.log(`⚠️ Questão ${num}: Resposta '${answer}' não parece bater com as opções.`);
                        console.log(`   Opções: ${JSON.stringify(cleanOptions)}`);
                    }
                }
            }

            // c) Justificativa
            if (!q.justificativa || q.justificativa === 'Sem justificativa') {
                console.log(`⚠️ Questão ${num}: Sem justificativa útil.`);
            }
        });

        if (issues === 0) console.log('✅ Validação estrutural básica: OK');

        console.log('\n📊 Relatório Final Gerado com Sucesso.');
        process.exit(0); // Forçar saída

    } catch (error) {
        console.error('❌ Erro fatal no script:', error);
        process.exit(1);
    }
}

diagnoseSpecificProject();
