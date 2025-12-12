const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const sourceId = 'u2J5MQ9zGGiaZI8R0xT8';

async function checkSourceHistory() {
    console.log('🕵️ Investigando histórico do source...\n');

    try {
        const sourceDoc = await db.collection('sources').doc(sourceId).get();

        if (!sourceDoc.exists) {
            console.log('❌ Source não encontrado');
            process.exit(1);
        }

        const data = sourceDoc.data();

        console.log('📄 Source:', data.name);
        console.log('📅 Criado em:', data.created_at?.toDate().toLocaleString('pt-BR') || 'Desconhecido');
        console.log('🔧 Processado em:', data.processed_at?.toDate().toLocaleString('pt-BR') || 'Nunca');
        console.log('📊 Status:', data.status);
        console.log('📝 Embeddings status:', data.embeddings_status || 'N/A');
        console.log('\n' + '═'.repeat(80));
        console.log('📋 CAMPOS DE TÓPICOS');
        console.log('═'.repeat(80));
        console.log('topics:', data.topics ? `${data.topics.length} tópicos` : '❌ Campo não existe');
        console.log('topics_status:', data.topics_status || '❌ Campo não existe');
        console.log('topics_extracted_at:', data.topics_extracted_at?.toDate().toLocaleString('pt-BR') || '❌ Campo não existe');

        console.log('\n' + '═'.repeat(80));
        console.log('💡 DIAGNÓSTICO');
        console.log('═'.repeat(80));

        if (!data.topics || data.topics.length === 0) {
            console.log('⚠️  Source foi processado ANTES da funcionalidade de extração de tópicos');
            console.log('📌 Solução: Reprocessar o source para extrair os tópicos');
            console.log('📌 Como fazer:');
            console.log('   1. Na interface, delete e faça re-upload do PDF');
            console.log('   2. OU execute manualmente a Cloud Function process_embeddings_queue');
            console.log('   3. OU use o script de reprocessamento (se existir)');
        } else {
            console.log('✅ Tópicos foram extraídos com sucesso!');
            console.log(`📊 Total: ${data.topics.length} tópicos\n`);

            data.topics.forEach((topic, i) => {
                console.log(`   ${(i + 1).toString().padStart(2, ' ')}. ${topic.name} (${topic.relevance})`);
            });
        }

        process.exit(0);

    } catch (error) {
        console.error('❌ Erro:', error);
        process.exit(1);
    }
}

checkSourceHistory();
