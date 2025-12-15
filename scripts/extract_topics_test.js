/**
 * Script para testar extração de tópicos de um PDF
 * Simula o mesmo processo da Cloud Function
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');

// Carregar API Key do .env ou variável de ambiente
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Tentar múltiplas variáveis de ambiente
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
    || process.env.VITE_GOOGLE_AI_API_KEY
    || process.env.GOOGLE_AI_API_KEY
    || process.argv[2]; // Aceita como argumento CLI

if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY não encontrada.');
    console.error('   Use: GEMINI_API_KEY=sua_chave node scripts/extract_topics_test.js');
    console.error('   Ou: node scripts/extract_topics_test.js SUA_CHAVE_API');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Caminho do PDF a testar
const PDF_PATH = '/Users/macbookdejoel/Documents/PROJETOS/WebQuizMedicina/docs/Final Anatopato II-compactado.pdf';

/**
 * Extrai texto do PDF
 */
async function extractTextFromPDF(filePath) {
    console.log(`📄 Lendo PDF: ${path.basename(filePath)}`);

    // Usar pdfjs-dist para extrair texto
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

    const dataBuffer = fs.readFileSync(filePath);
    const data = new Uint8Array(dataBuffer);

    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDoc = await loadingTask.promise;

    let fullText = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }

    console.log(`📝 Texto extraído: ${fullText.length} caracteres (${pdfDoc.numPages} páginas)`);
    return fullText;
}

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
    // 40% início + 20% meio (3 amostras) + 40% fim
    const startSize = Math.floor(MAX_CHARS * 0.4);
    const midSize = Math.floor(MAX_CHARS * 0.2 / 3);
    const endSize = Math.floor(MAX_CHARS * 0.4);

    const start = content.substring(0, startSize);
    const end = content.substring(content.length - endSize);

    // Pegar 3 amostras do meio
    const third = Math.floor(content.length / 3);
    const mid1 = content.substring(third - midSize / 2, third + midSize / 2);
    const mid2 = content.substring(third * 2 - midSize / 2, third * 2 + midSize / 2);
    const mid3 = content.substring(third * 1.5 - midSize / 2, third * 1.5 + midSize / 2);

    const sampledContent = `${start}\n\n[...MEIO DO DOCUMENTO - AMOSTRA 1...]\n${mid1}\n\n[...MEIO DO DOCUMENTO - AMOSTRA 2...]\n${mid2}\n\n[...MEIO DO DOCUMENTO - AMOSTRA 3...]\n${mid3}\n\n[...FIM DO DOCUMENTO...]\n${end}`;

    console.log(`📊 Documento grande (${content.length} chars). Usando amostragem estratificada: ${sampledContent.length} chars`);
    return sampledContent;
}

/**
 * Extrai tópicos usando Gemini (mesmo prompt da Cloud Function ATUALIZADA)
 */
async function extractTopicsWithGemini(content) {
    const sampledContent = stratifiedSampling(content);

    // PROMPT ATUALIZADO (igual ao que acabamos de fazer deploy)
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

    // Parse JSON
    const parsed = JSON.parse(text);

    if (!parsed.topics || !Array.isArray(parsed.topics)) {
        console.error('❌ Resposta inválida:', text.substring(0, 500));
        return [];
    }

    return parsed.topics;
}

/**
 * Main
 */
async function main() {
    console.log('='.repeat(60));
    console.log('🧪 TESTE DE EXTRAÇÃO DE TÓPICOS (Limite: 50)');
    console.log('='.repeat(60));

    try {
        // 1. Extrair texto do PDF
        const text = await extractTextFromPDF(PDF_PATH);

        // 2. Extrair tópicos com Gemini
        const topics = await extractTopicsWithGemini(text);

        // 3. Exibir resultados
        console.log('='.repeat(60));
        console.log(`✅ TÓPICOS ENCONTRADOS: ${topics.length}`);
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

        // Verificar tópicos-alvo
        console.log('\n' + '='.repeat(60));
        console.log('🎯 VERIFICAÇÃO DE TÓPICOS-ALVO:');
        console.log('='.repeat(60));

        const targetTopics = ['tireoide', 'tireoid', 'thyroid', 'hepat', 'figado', 'fígado', 'liver', 'tumor'];
        const allTopicNames = topics.map(t => t.name.toLowerCase());

        for (const target of targetTopics) {
            const found = allTopicNames.filter(name => name.includes(target));
            if (found.length > 0) {
                console.log(`   ✅ "${target}": Encontrado em: ${found.join(', ')}`);
            } else {
                console.log(`   ❌ "${target}": NÃO encontrado`);
            }
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    }
}

main();
