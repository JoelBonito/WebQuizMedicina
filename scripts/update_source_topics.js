/**
 * Script para atualizar tópicos de uma fonte no Firestore
 * Usa a nova extração hierárquica
 */

const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const serviceAccount = require('../service-account.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.argv[2];
if (!GEMINI_API_KEY) {
    console.error('❌ Use: GEMINI_API_KEY=chave node scripts/update_source_topics.js');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const SOURCE_NAME = 'Final Anatopato II-compactado.pdf';
const USER_ID = 'aW6ODLcd95RvbReCpgnsxWcXxOw1';

async function extractHierarchicalTopics(content) {
    const MAX_CHARS = 120000;
    let sampledContent = content.length <= MAX_CHARS ? content : content.substring(0, MAX_CHARS);

    const prompt = `
Você é um especialista em análise de conteúdo acadêmico/médico.
Analise o texto e identifique a ESTRUTURA HIERÁRQUICA de tópicos.

REGRAS:
1. Identifique os TÓPICOS PRINCIPAIS (seções/capítulos do conteúdo) - máximo 20 tópicos principais.
2. Para CADA tópico principal, liste os SUB-TÓPICOS específicos mencionados.
3. Classifique cada tópico principal por relevância: high (>15%), medium (5-15%), low (<5%).
4. IMPORTANTE: Cubra TODO o documento - início, meio e fim.

CONTEÚDO:
${sampledContent}

FORMATO JSON (obrigatório):
{
  "topics": [
    {
      "name": "Tópico Principal",
      "relevance": "high",
      "subtopics": ["Sub-tópico 1", "Sub-tópico 2", "Sub-tópico 3"]
    }
  ]
}
`;

    console.log('\n🤖 Chamando Gemini para extração hierárquica...\n');

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: { maxOutputTokens: 16384, responseMimeType: 'application/json' }
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);

    return Array.isArray(parsed) ? parsed : (parsed.topics || []);
}

async function main() {
    console.log('='.repeat(70));
    console.log('📊 ATUALIZAÇÃO DE TÓPICOS NO FIRESTORE');
    console.log('='.repeat(70));

    try {
        // Buscar source
        const projectsSnapshot = await db.collection('projects').where('user_id', '==', USER_ID).get();
        let sourceDoc = null;
        let sourceContent = null;

        for (const project of projectsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }))) {
            const sources = await db.collection('sources').where('project_id', '==', project.id).get();
            for (const doc of sources.docs) {
                const data = doc.data();
                if (data.name === SOURCE_NAME) {
                    sourceDoc = doc;
                    sourceContent = data.extracted_content;
                    console.log(`📄 Fonte encontrada: ${data.name}`);
                    console.log(`   ID: ${doc.id}`);
                    console.log(`   Tópicos atuais: ${data.topics?.length || 0}`);
                    break;
                }
            }
            if (sourceDoc) break;
        }

        if (!sourceDoc || !sourceContent) {
            console.error('❌ Fonte não encontrada');
            process.exit(1);
        }

        // Extrair novos tópicos hierárquicos
        const newTopics = await extractHierarchicalTopics(sourceContent);

        const totalSubtopics = newTopics.reduce((sum, t) => sum + (t.subtopics?.length || 0), 0);
        console.log(`\n✅ Novos tópicos extraídos: ${newTopics.length} principais + ${totalSubtopics} sub-tópicos`);

        // Atualizar no Firestore
        console.log('\n📝 Atualizando Firestore...');
        await sourceDoc.ref.update({
            topics: newTopics,
            topics_updated_at: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log('\n✅ SUCESSO! Tópicos atualizados no Firestore.');
        console.log(`\n📊 Resumo dos novos tópicos:`);
        newTopics.forEach((t, i) => {
            const subtopicCount = t.subtopics?.length || 0;
            console.log(`   ${i + 1}. ${t.name} (${t.relevance}) - ${subtopicCount} sub-tópicos`);
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
    }

    process.exit(0);
}

main();
