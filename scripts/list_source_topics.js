/**
 * Script para listar tópicos de uma fonte específica
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SOURCE_NAME = 'Final Anatopato II-compactado.pdf';
const PROJECT_ID = 'dO2SztlGlidmA5hhliyb';

const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function listSourceTopics() {
    console.log('═'.repeat(80));
    console.log(`📄 Buscando tópicos da fonte: "${SOURCE_NAME}"`);
    console.log('═'.repeat(80));
    console.log('');

    // 1. Buscar a fonte
    const sourcesSnapshot = await db.collection('sources')
        .where('project_id', '==', PROJECT_ID)
        .get();

    const source = sourcesSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .find(s => s.name === SOURCE_NAME || s.filename === SOURCE_NAME);

    if (!source) {
        console.error('❌ Fonte não encontrada!');
        process.exit(1);
    }

    console.log(`✅ Fonte encontrada: ${source.id}`);
    console.log(`   Tipo: ${source.type}`);
    console.log('');

    // 2. Verificar tópicos extraídos na fonte
    if (source.extracted_topics && source.extracted_topics.length > 0) {
        console.log('📊 TÓPICOS EXTRAÍDOS DA FONTE (extracted_topics):');
        source.extracted_topics.forEach((t, i) => {
            console.log(`   ${i + 1}. ${t}`);
        });
    } else {
        console.log('⚠️  Nenhum tópico extraído diretamente na fonte.');
    }

    // 3. Buscar todos os tópicos únicos das questões dessa fonte
    console.log('');
    console.log('🔍 Buscando tópicos nas questões geradas desta fonte...');

    const questionsSnapshot = await db.collection('questions')
        .where('source_id', '==', source.id)
        .get();

    if (questionsSnapshot.empty) {
        // Tentar buscar pelo project_id
        const projectQuestionsSnapshot = await db.collection('questions')
            .where('project_id', '==', PROJECT_ID)
            .get();

        const uniqueTopics = new Set();
        projectQuestionsSnapshot.docs.forEach(d => {
            const topico = d.data().topico;
            if (topico) uniqueTopics.add(topico);
        });

        const topicsList = Array.from(uniqueTopics).sort();
        console.log(`   📝 ${topicsList.length} tópicos únicos encontrados nas questões do projeto:`);
        console.log('');
        topicsList.forEach((t, i) => {
            console.log(`   ${(i + 1).toString().padStart(2)}. ${t}`);
        });
    } else {
        const uniqueTopics = new Set();
        questionsSnapshot.docs.forEach(d => {
            const topico = d.data().topico;
            if (topico) uniqueTopics.add(topico);
        });

        const topicsList = Array.from(uniqueTopics).sort();
        console.log(`   📝 ${topicsList.length} tópicos únicos:`);
        console.log('');
        topicsList.forEach((t, i) => {
            console.log(`   ${(i + 1).toString().padStart(2)}. ${t}`);
        });
    }

    console.log('');
    console.log('═'.repeat(80));

    process.exit(0);
}

listSourceTopics().catch(e => {
    console.error('❌ Erro:', e);
    process.exit(1);
});
