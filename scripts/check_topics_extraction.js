const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const projectId = 'Nx7psBo0MlYtqeBfh4Od';

async function checkTopics() {
    console.log('🔍 Verificando tópicos extraídos das sources...\n');

    const sourcesSnapshot = await db.collection('sources')
        .where('project_id', '==', projectId)
        .where('status', '==', 'ready')
        .get();

    console.log(`📚 Total de sources: ${sourcesSnapshot.size}\n`);

    sourcesSnapshot.forEach(doc => {
        const data = doc.data();
        console.log('='.repeat(80));
        console.log(`📄 Source: ${data.name}`);
        console.log(`   ID: ${doc.id}`);

        // Verificar summary
        if (data.summary) {
            const summaryTopics = extractTopicsFromSummary(data.summary);
            console.log(`   📝 Tópicos do Summary: ${summaryTopics.length > 0 ? summaryTopics.join(', ') : '❌ NENHUM'}`);
        } else {
            console.log(`   📝 Summary: ❌ NÃO DISPONÍVEL`);
        }

        // Verificar mindmap
        if (data.mindmap) {
            const mindmapTopics = extractTopicsFromMindmap(data.mindmap);
            console.log(`   🧠 Tópicos do Mindmap: ${mindmapTopics.length > 0 ? mindmapTopics.join(', ') : '❌ NENHUM'}`);
        } else {
            console.log(`   🧠 Mindmap: ❌ NÃO DISPONÍVEL`);
        }

        console.log();
    });

    console.log('='.repeat(80));
}

// Funções de extração (copiadas do topic_extractor.ts)
function extractTopicsFromSummary(summary) {
    if (!summary) return [];
    const topics = [];
    const patterns = [
        /##\s+(.+)/g,      // Markdown headers
        /\*\*(.+?)\*\*/g,  // Bold text
        /(\d+\.\s+.+?)(?=\d+\.|$)/g  // Numbered lists
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

function extractTopicsFromMindmap(mindmap) {
    if (!mindmap || !mindmap.nodes) return [];

    return mindmap.nodes
        .map(node => node.label)
        .filter(label => label && label.length > 5)
        .slice(0, 20);
}

checkTopics().catch(error => {
    console.error('❌ Erro:', error);
    process.exit(1);
});
