const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const projectId = 'Nx7psBo0MlYtqeBfh4Od';

async function analyzeSourceTopics() {
    console.log('🔍 Analisando tópicos da fonte do projeto...\n');

    try {
        const sourcesSnapshot = await db.collection('sources')
            .where('project_id', '==', projectId)
            .where('status', '==', 'ready')
            .get();

        if (sourcesSnapshot.empty) {
            console.log('❌ Nenhuma source encontrada.');
            process.exit(1);
        }

        const sourceDoc = sourcesSnapshot.docs[0];
        const data = sourceDoc.data();

        console.log('📄 Source:', data.name);
        console.log('📏 Tamanho do conteúdo:', data.extracted_content?.length || 0, 'caracteres\n');

        // Verificar Summary
        console.log('═'.repeat(80));
        console.log('📝 SUMMARY');
        console.log('═'.repeat(80));

        if (data.summary) {
            console.log('✅ Summary disponível');
            console.log('Tamanho:', data.summary.length, 'caracteres\n');

            // Extrair tópicos do summary
            const summaryTopics = extractTopicsFromSummary(data.summary);
            console.log(`📊 Tópicos extraídos: ${summaryTopics.length}\n`);

            if (summaryTopics.length > 0) {
                summaryTopics.forEach((topic, i) => {
                    console.log(`   ${(i + 1).toString().padStart(2, ' ')}. ${topic}`);
                });
            }
        } else {
            console.log('❌ Summary NÃO DISPONÍVEL');
        }

        // Verificar Mindmap
        console.log('\n' + '═'.repeat(80));
        console.log('🧠 MINDMAP');
        console.log('═'.repeat(80));

        if (data.mindmap && data.mindmap.nodes) {
            console.log('✅ Mindmap disponível');
            console.log('Total de nós:', data.mindmap.nodes.length, '\n');

            console.log('📊 Tópicos (labels dos nós):\n');
            data.mindmap.nodes.forEach((node, i) => {
                console.log(`   ${(i + 1).toString().padStart(2, ' ')}. ${node.label}`);
            });
        } else {
            console.log('❌ Mindmap NÃO DISPONÍVEL');
        }

        console.log('\n' + '═'.repeat(80));
        console.log('💡 RECOMENDAÇÃO');
        console.log('═'.repeat(80));

        if (!data.summary && !data.mindmap) {
            console.log('⚠️  Source não tem summary nem mindmap!');
            console.log('📌 O sistema vai extrair tópicos sob demanda durante a geração do quiz.');
            console.log('📌 Para melhor performance, gere summary e mindmap manualmente.');
        } else {
            console.log('✅ Source tem dados estruturados para extração de tópicos.');
        }

        process.exit(0);

    } catch (error) {
        console.error('❌ Erro:', error);
        process.exit(1);
    }
}

function extractTopicsFromSummary(summary) {
    if (!summary) return [];
    const topics = [];
    const patterns = [
        /##\s+(.+)/g,
        /\*\*(.+?)\*\*/g,
        /(\d+\.\s+.+?)(?=\d+\.|$)/g
    ];

    patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(summary)) !== null) {
            const topic = match[1].trim()
                .replace(/[\*\#]/g, '')
                .replace(/\s+/g, ' ')
                .substring(0, 100);

            if (topic.length > 5 && !topics.includes(topic)) {
                topics.push(topic);
            }
        }
    });

    return topics.slice(0, 20);
}

analyzeSourceTopics();
