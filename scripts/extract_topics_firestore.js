/**
 * Script para testar extração de tópicos usando o conteúdo já extraído do Firestore
 * Simula o mesmo processo da Cloud Function
 */

const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

// Service Account
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// API Key passada como argumento ou variável de ambiente
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.argv[2];

if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY não encontrada.');
    console.error('   Use: GEMINI_API_KEY=sua_chave node scripts/extract_topics_firestore.js');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Source a testar
const SOURCE_NAME = 'Final Anatopato II-compactado.pdf';
const USER_ID = 'aW6ODLcd95RvbReCpgnsxWcXxOw1';

/**
 * Amostragem estratificada (mesmo código da Cloud Function)
 */
function stratifiedSampling(content) {
    const MAX_CHARS = 120000; // ~30k tokens

    if (content.length <= MAX_CHARS) {
        console.log(`📊 Documento pequeno (${content.length} chars). Usando completo.`);
        return content;
    }

    // Documento grande: amostragem estratificada
    const startSize = Math.floor(MAX_CHARS * 0.4);
    const midSize = Math.floor(MAX_CHARS * 0.2 / 3);
    const endSize = Math.floor(MAX_CHARS * 0.4);

    const start = content.substring(0, startSize);
    const end = content.substring(content.length - endSize);

    const third = Math.floor(content.length / 3);
    const mid1 = content.substring(third - midSize / 2, third + midSize / 2);
    const mid2 = content.substring(third * 2 - midSize / 2, third * 2 + midSize / 2);
    const mid3 = content.substring(third * 1.5 - midSize / 2, third * 1.5 + midSize / 2);

    const sampledContent = `${start}\n\n[...MEIO DO DOCUMENTO - AMOSTRA 1...]\n${mid1}\n\n[...MEIO DO DOCUMENTO - AMOSTRA 2...]\n${mid2}\n\n[...MEIO DO DOCUMENTO - AMOSTRA 3...]\n${mid3}\n\n[...FIM DO DOCUMENTO...]\n${end}`;

    console.log(`📊 Documento grande (${content.length} chars). Usando amostragem: ${sampledContent.length} chars`);
    return sampledContent;
}

/**
 * Extrai tópicos usando Gemini (mesmo prompt da Cloud Function ATUALIZADA)
 */
async function extractTopicsWithGemini(content) {
    const sampledContent = stratifiedSampling(content);

    const prompt = `
Você é um especialista em análise de conteúdo acadêmico/médico.
Analise o texto abaixo e identifique TODOS os tópicos distintos presentes.

REGRAS:
1. Liste tópicos ESPECÍFICOS (ex: "Hepatite B", "Insuficiência Renal Aguda").
2. Classifique a relevância: high (>20%), medium (5-20%), low (<5%).
3. Máximo de 50 tópicos (extraia TODOS os tópicos encontrados, não ignore seções do documento).
4. IMPORTANTE: Verifique TODO o documento, incluindo início, meio e fim.

CONTEÚDO:
${sampledContent}

FORMATO JSON (obrigatório):
{"topics":[{"name":"Tópico","relevance":"high"}]}
`;

    console.log('\n🤖 Chamando Gemini para extração de tópicos...\n');

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: {
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
        }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const parsed = JSON.parse(text);

    // Aceitar tanto {topics: [...]} quanto array direto [...]
    let topics;
    if (Array.isArray(parsed)) {
        topics = parsed;
    } else if (parsed.topics && Array.isArray(parsed.topics)) {
        topics = parsed.topics;
    } else {
        console.error('❌ Resposta inválida:', text.substring(0, 500));
        return [];
    }

    return topics;
}

/**
 * Main
 */
async function main() {
    console.log('='.repeat(60));
    console.log('🧪 TESTE DE EXTRAÇÃO DE TÓPICOS (Limite: 50)');
    console.log('='.repeat(60));

    try {
        // 1. Buscar projetos do usuário
        console.log(`\n👤 Buscando projetos do usuário: ${USER_ID}`);
        const projectsSnapshot = await db.collection('projects')
            .where('user_id', '==', USER_ID)
            .get();

        const projects = projectsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log(`📁 Projetos encontrados: ${projects.length}`);

        // 2. Buscar source específico
        let sourceContent = null;
        let sourceName = null;

        for (const project of projects) {
            const sourcesSnapshot = await db.collection('sources')
                .where('project_id', '==', project.id)
                .get();

            for (const doc of sourcesSnapshot.docs) {
                const data = doc.data();
                if (data.name === SOURCE_NAME || data.filename === SOURCE_NAME) {
                    sourceContent = data.extracted_content;
                    sourceName = data.name;
                    console.log(`\n📄 Fonte encontrada: ${sourceName}`);
                    console.log(`   Caracteres: ${sourceContent?.length || 0}`);
                    console.log(`   Tópicos atuais: ${data.topics?.length || 0}`);

                    if (data.topics && data.topics.length > 0) {
                        console.log(`\n📋 TÓPICOS ATUAIS NO FIRESTORE (${data.topics.length}):`);
                        data.topics.forEach((t, i) => console.log(`   ${i + 1}. ${t.name} (${t.relevance})`));
                    }
                    break;
                }
            }
            if (sourceContent) break;
        }

        if (!sourceContent) {
            console.error(`❌ Fonte "${SOURCE_NAME}" não encontrada`);
            process.exit(1);
        }

        // 3. Extrair tópicos com Gemini (usando novo limite de 50)
        const topics = await extractTopicsWithGemini(sourceContent);

        // 4. Exibir resultados
        console.log('\n' + '='.repeat(60));
        console.log(`✅ TÓPICOS EXTRAÍDOS COM NOVO LIMITE: ${topics.length}`);
        console.log('='.repeat(60));

        // Agrupar por relevância
        const high = topics.filter(t => t.relevance === 'high');
        const medium = topics.filter(t => t.relevance === 'medium');
        const low = topics.filter(t => t.relevance === 'low');

        console.log(`\n📊 ALTA RELEVÂNCIA (${high.length}):`);
        high.forEach((t, i) => console.log(`   ${i + 1}. ${t.name}`));

        console.log(`\n📊 MÉDIA RELEVÂNCIA (${medium.length}):`);
        medium.forEach((t, i) => console.log(`   ${i + 1}. ${t.name}`));

        console.log(`\n📊 BAIXA RELEVÂNCIA (${low.length}):`);
        low.forEach((t, i) => console.log(`   ${i + 1}. ${t.name}`));

        // 5. Verificar tópicos-alvo
        console.log('\n' + '='.repeat(60));
        console.log('🎯 VERIFICAÇÃO DE TÓPICOS-ALVO:');
        console.log('='.repeat(60));

        const targetKeywords = ['tireoide', 'tireoid', 'thyroid', 'hepat', 'figado', 'fígado', 'liver', 'tumor', 'nódulo', 'nodulo'];
        const allTopicNames = topics.map(t => t.name.toLowerCase());

        for (const target of targetKeywords) {
            const found = allTopicNames.filter(name => name.includes(target));
            if (found.length > 0) {
                console.log(`   ✅ "${target}": Encontrado em: ${found.join(', ')}`);
            } else {
                console.log(`   ❌ "${target}": NÃO encontrado`);
            }
        }

        // 6. Comparar com mapa mental
        console.log('\n' + '='.repeat(60));
        console.log('📋 COMPARAÇÃO COM MAPA MENTAL:');
        console.log('='.repeat(60));

        const mapaTopics = [
            'PATOLOGIAS DA CAVIDADE ORAL',
            'PATOLOGIAS DO ESÔFAGO',
            'PATOLOGIAS DO ESTÔMAGO',
            'DOENÇA INFLAMATÓRIA INTESTINAL (DII)',
            'PÓLIPOS E NEOPLASIAS',
            'NÓDULOS E TUMORES HEPÁTICOS',
            'PATOLOGIAS DA TIREOIDE'
        ];

        for (const mapaSection of mapaTopics) {
            const keywords = mapaSection.toLowerCase().split(/[\s,]+/);
            const found = allTopicNames.some(name =>
                keywords.some(kw => kw.length > 3 && name.includes(kw))
            );
            console.log(`   ${found ? '✅' : '❌'} ${mapaSection}`);
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    }

    process.exit(0);
}

main();
