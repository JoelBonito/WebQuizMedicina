/**
 * Script para testar extração HIERÁRQUICA de tópicos
 */

const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const serviceAccount = require('../service-account.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.argv[2];
if (!GEMINI_API_KEY) {
    console.error('❌ Use: GEMINI_API_KEY=chave node scripts/test_hierarchical_extraction.js');
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
    console.log('='.repeat(80));
    console.log('📊 EXTRAÇÃO HIERÁRQUICA DE TÓPICOS');
    console.log('='.repeat(80));

    try {
        // Buscar source
        const projectsSnapshot = await db.collection('projects').where('user_id', '==', USER_ID).get();
        let sourceContent = null;

        for (const project of projectsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }))) {
            const sources = await db.collection('sources').where('project_id', '==', project.id).get();
            for (const doc of sources.docs) {
                const data = doc.data();
                if (data.name === SOURCE_NAME) {
                    sourceContent = data.extracted_content;
                    console.log(`📄 Fonte: ${data.name}`);
                    console.log(`   Caracteres: ${sourceContent?.length || 0}`);
                    break;
                }
            }
            if (sourceContent) break;
        }

        if (!sourceContent) {
            console.error('❌ Fonte não encontrada');
            process.exit(1);
        }

        // Extrair tópicos hierárquicos
        const topics = await extractHierarchicalTopics(sourceContent);

        // Gerar quadro
        console.log('\n' + '═'.repeat(80));
        console.log('📋 QUADRO DE TÓPICOS E SUB-TÓPICOS');
        console.log('═'.repeat(80));

        let totalSubtopics = 0;

        for (let i = 0; i < topics.length; i++) {
            const t = topics[i];
            const relevanceEmoji = t.relevance === 'high' ? '🔴' : t.relevance === 'medium' ? '🟡' : '🟢';

            console.log(`\n${i + 1}. ${relevanceEmoji} ${t.name.toUpperCase()}`);
            console.log('   ' + '─'.repeat(70));

            if (t.subtopics && t.subtopics.length > 0) {
                t.subtopics.forEach((st, j) => {
                    console.log(`      ${j + 1}. ${st}`);
                });
                totalSubtopics += t.subtopics.length;
            } else {
                console.log('      (sem sub-tópicos específicos)');
            }
        }

        console.log('\n' + '═'.repeat(80));
        console.log(`📊 RESUMO: ${topics.length} tópicos principais | ${totalSubtopics} sub-tópicos`);
        console.log('═'.repeat(80));

        // Verificar cobertura
        console.log('\n🎯 VERIFICAÇÃO DE COBERTURA:');
        const allText = topics.map(t => `${t.name} ${(t.subtopics || []).join(' ')}`).join(' ').toLowerCase();

        const checks = [
            { name: 'Tireoide', keywords: ['tireoide', 'tireoidite', 'tiroides', 'tiroiditis', 'hashimoto'] },
            { name: 'Fígado', keywords: ['fígado', 'hígado', 'hepat', 'hepatocelular'] },
            { name: 'Esôfago', keywords: ['esôfago', 'esófago', 'barrett', 'erge'] },
            { name: 'Estômago', keywords: ['estômago', 'gástrico', 'gastrit'] },
            { name: 'Intestino', keywords: ['crohn', 'colite', 'colorretal', 'intestin'] },
            { name: 'Cavidade Oral', keywords: ['oral', 'boca', 'salivar'] },
        ];

        checks.forEach(c => {
            const found = c.keywords.some(k => allText.includes(k));
            console.log(`   ${found ? '✅' : '❌'} ${c.name}`);
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
    }

    process.exit(0);
}

main();
