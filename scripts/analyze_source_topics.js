/**
 * Análise de Tópicos dos Sources do Projeto
 * Objetivo: Extrair distribuição percentual de tópicos do conteúdo original
 * para comparar com a distribuição do Quiz gerado.
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// --- Configuração ---
const PROJECT_ID = 'web-quiz-medicina';
const FIRESTORE_PROJECT_ID = 'sCYWohQxbvpEed8Aw0hw'; // ID do projeto "Fisiopatologia Final"
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'service-account.json');

// Carregar service account
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

// --- Funções de Autenticação (JWT) ---
function base64url(str) {
    return Buffer.from(str).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createJWT(serviceAccount) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: serviceAccount.client_email,
        sub: serviceAccount.client_email,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
        scope: 'https://www.googleapis.com/auth/datastore'
    };

    const headerB64 = base64url(JSON.stringify(header));
    const payloadB64 = base64url(JSON.stringify(payload));
    const signatureInput = `${headerB64}.${payloadB64}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(serviceAccount.private_key, 'base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return `${signatureInput}.${signature}`;
}

async function getAccessToken(serviceAccount) {
    const jwt = createJWT(serviceAccount);
    return new Promise((resolve, reject) => {
        const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;
        const options = {
            hostname: 'oauth2.googleapis.com',
            port: 443,
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const parsed = JSON.parse(data);
                resolve(parsed.access_token);
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// --- Funções de API REST Firestore ---
async function firestoreRequest(accessToken, method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'firestore.googleapis.com',
            port: 443,
            path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents${path}`,
            method: method,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// --- Análise de Tópicos ---
function extractTopicsFromContent(content) {
    // Lista de tópicos médicos que esperamos encontrar (baseado no contexto de Fisiopatologia Hepática/Renal)
    const topicPatterns = [
        { name: 'Hepatite A (VHA)', patterns: ['hepatite a', 'vha', 'vírus da hepatite a', 'virus da hepatite a'] },
        { name: 'Hepatite B (VHB)', patterns: ['hepatite b', 'vhb', 'vírus da hepatite b', 'virus da hepatite b', 'hbsag', 'anti-hbs', 'hbeag', 'anti-hbe', 'anti-hbc'] },
        { name: 'Hepatite C (VHC)', patterns: ['hepatite c', 'vhc', 'vírus da hepatite c', 'virus da hepatite c', 'anti-hcv'] },
        { name: 'Hepatite D (VHD)', patterns: ['hepatite d', 'vhd', 'vírus da hepatite d', 'virus da hepatite d', 'delta'] },
        { name: 'Hepatite E (VHE)', patterns: ['hepatite e', 'vhe', 'vírus da hepatite e', 'virus da hepatite e'] },
        { name: 'Cirrose Hepática', patterns: ['cirrose', 'fibrose hepática', 'fibrose hepatica', 'nódulos de regeneração', 'nodulos de regeneracao'] },
        { name: 'Hepatopatia Alcoólica', patterns: ['hepatopatia alcoólica', 'hepatopatia alcoolica', 'doença hepática alcoólica', 'doenca hepatica alcoolica', 'esteatose alcoólica', 'esteatose alcoolica'] },
        { name: 'Esteatose Hepática/NASH', patterns: ['esteatose hepática', 'esteatose hepatica', 'nash', 'esteato-hepatite', 'esteatohepatite', 'doença hepática gordurosa', 'doenca hepatica gordurosa', 'nafld'] },
        { name: 'Síndrome Nefrótica', patterns: ['síndrome nefrótica', 'sindrome nefrotica', 'nefrose', 'proteinúria maciça', 'proteinuria macica'] },
        { name: 'Síndrome Nefrítica', patterns: ['síndrome nefrítica', 'sindrome nefritica', 'glomerulonefrite', 'hematúria', 'hematuria'] },
        { name: 'Insuficiência Renal Aguda', patterns: ['insuficiência renal aguda', 'insuficiencia renal aguda', 'ira', 'lesão renal aguda', 'lesao renal aguda'] },
        { name: 'Insuficiência Renal Crônica', patterns: ['insuficiência renal crônica', 'insuficiencia renal cronica', 'irc', 'doença renal crônica', 'doenca renal cronica', 'drc'] },
        { name: 'Carcinoma Hepatocelular', patterns: ['carcinoma hepatocelular', 'hepatocarcinoma', 'chc', 'câncer de fígado', 'cancer de figado'] },
        { name: 'Hipertensão Portal', patterns: ['hipertensão portal', 'hipertensao portal', 'varizes esofágicas', 'varizes esofagicas', 'ascite'] },
        { name: 'Encefalopatia Hepática', patterns: ['encefalopatia hepática', 'encefalopatia hepatica', 'asterixis', 'flapping'] },
        { name: 'Icterícia', patterns: ['icterícia', 'ictericia', 'bilirrubina', 'hiperbilirrubinemia'] },
        { name: 'Colestase', patterns: ['colestase', 'colestática', 'colestatica', 'bile'] },
        { name: 'Hemocromatose', patterns: ['hemocromatose', 'sobrecarga de ferro'] },
        { name: 'Doença de Wilson', patterns: ['doença de wilson', 'doenca de wilson', 'ceruloplasmina'] },
        { name: 'Hepatite Autoimune', patterns: ['hepatite autoimune', 'autoimune hepática', 'autoimune hepatica'] },
    ];

    const contentLower = content.toLowerCase();
    const results = {};

    for (const topic of topicPatterns) {
        let count = 0;
        for (const pattern of topic.patterns) {
            const regex = new RegExp(pattern, 'gi');
            const matches = contentLower.match(regex);
            if (matches) {
                count += matches.length;
            }
        }
        if (count > 0) {
            results[topic.name] = count;
        }
    }

    return results;
}

function calculatePercentages(topicCounts) {
    const total = Object.values(topicCounts).reduce((sum, count) => sum + count, 0);
    const percentages = {};

    for (const [topic, count] of Object.entries(topicCounts)) {
        percentages[topic] = {
            count: count,
            percentage: ((count / total) * 100).toFixed(1)
        };
    }

    return { percentages, total };
}

// --- Main ---
async function main() {
    console.log('🔍 Análise de Tópicos dos Sources do Projeto');
    console.log('='.repeat(60));
    console.log(`📁 Projeto: Fisiopatologia Final (${FIRESTORE_PROJECT_ID})`);
    console.log('');

    try {
        // 1. Obter token de acesso
        console.log('🔐 Obtendo token de acesso...');
        const accessToken = await getAccessToken(serviceAccount);

        // 2. Buscar todos os sources do projeto
        console.log('📥 Buscando sources do projeto...');

        // Usar runQuery para filtrar por project_id
        const queryBody = {
            structuredQuery: {
                from: [{ collectionId: 'sources' }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: 'project_id' },
                        op: 'EQUAL',
                        value: { stringValue: FIRESTORE_PROJECT_ID }
                    }
                }
            }
        };

        const queryResult = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'firestore.googleapis.com',
                port: 443,
                path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve([]);
                    }
                });
            });

            req.on('error', reject);
            req.write(JSON.stringify(queryBody));
            req.end();
        });

        // Processar resultados
        const sources = [];
        if (Array.isArray(queryResult)) {
            for (const item of queryResult) {
                if (item.document && item.document.fields) {
                    const fields = item.document.fields;
                    sources.push({
                        id: item.document.name.split('/').pop(),
                        name: fields.name?.stringValue || 'Sem nome',
                        extracted_content: fields.extracted_content?.stringValue || '',
                        status: fields.status?.stringValue || 'unknown',
                        created_at: fields.created_at?.timestampValue || null
                    });
                }
            }
        }

        console.log(`✅ Encontrados ${sources.length} source(s)`);
        console.log('');

        if (sources.length === 0) {
            console.log('❌ Nenhum source encontrado para este projeto.');
            return;
        }

        // 3. Listar sources
        console.log('📄 Sources encontrados:');
        console.log('-'.repeat(60));
        let totalChars = 0;
        for (const source of sources) {
            const contentLength = source.extracted_content.length;
            totalChars += contentLength;
            console.log(`  • ${source.name}`);
            console.log(`    ID: ${source.id}`);
            console.log(`    Status: ${source.status}`);
            console.log(`    Tamanho: ${contentLength.toLocaleString()} caracteres`);
            if (source.created_at) {
                console.log(`    Criado em: ${new Date(source.created_at).toLocaleString('pt-BR')}`);
            }
            console.log('');
        }

        console.log(`📊 Total de conteúdo: ${totalChars.toLocaleString()} caracteres`);
        console.log('');

        // 4. Combinar todo o conteúdo
        const combinedContent = sources.map(s => s.extracted_content).join('\n\n');

        // 5. Analisar tópicos
        console.log('🔬 Analisando distribuição de tópicos...');
        console.log('-'.repeat(60));

        const topicCounts = extractTopicsFromContent(combinedContent);
        const { percentages, total } = calculatePercentages(topicCounts);

        // Ordenar por porcentagem (decrescente)
        const sortedTopics = Object.entries(percentages)
            .sort((a, b) => parseFloat(b[1].percentage) - parseFloat(a[1].percentage));

        console.log('');
        console.log('📈 DISTRIBUIÇÃO DE TÓPICOS NO MATERIAL ORIGINAL:');
        console.log('='.repeat(60));
        console.log('');

        for (const [topic, data] of sortedTopics) {
            const bar = '█'.repeat(Math.round(parseFloat(data.percentage) / 2));
            console.log(`${topic.padEnd(30)} ${data.percentage.padStart(5)}% ${bar} (${data.count} menções)`);
        }

        console.log('');
        console.log(`Total de menções analisadas: ${total}`);
        console.log(`Total de tópicos identificados: ${sortedTopics.length}`);

        // 6. Salvar resultado
        const report = {
            project_id: FIRESTORE_PROJECT_ID,
            analysis_date: new Date().toISOString(),
            sources: sources.map(s => ({ id: s.id, name: s.name, chars: s.extracted_content.length })),
            total_content_chars: totalChars,
            topic_distribution: sortedTopics.map(([topic, data]) => ({
                topic,
                count: data.count,
                percentage: parseFloat(data.percentage)
            })),
            total_mentions: total
        };

        const reportPath = path.join(__dirname, '..', 'docs', 'source_topics_analysis.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log('');
        console.log(`💾 Relatório salvo em: ${reportPath}`);

        // 7. Comparação com Quiz (dados anteriores)
        console.log('');
        console.log('='.repeat(60));
        console.log('📊 COMPARAÇÃO: SOURCES vs QUIZ GERADO');
        console.log('='.repeat(60));
        console.log('');

        const quizDistribution = {
            'Hepatite B (VHB)': 4,
            'Hepatite C (VHC)': 3,
            'Hepatopatia Alcoólica': 3,
            'Hepatite D (VHD)': 2,
            'Hepatite E (VHE)': 0, // Estava junto com D no quiz
            'Cirrose Hepática': 2,
            'Esteatose Hepática/NASH': 2,
            'Síndrome Nefrótica': 2,
            'Hepatite A (VHA)': 2
        };

        // Ajustar: Hepatite D e E juntas = 2
        quizDistribution['Hepatite D (VHD)'] = 1;
        quizDistribution['Hepatite E (VHE)'] = 1;

        const quizTotal = Object.values(quizDistribution).reduce((sum, c) => sum + c, 0);

        console.log('Tópico'.padEnd(30) + ' | ' + 'Source %'.padStart(10) + ' | ' + 'Quiz %'.padStart(10) + ' | Diferença');
        console.log('-'.repeat(70));

        for (const [topic, data] of sortedTopics) {
            const sourcePercent = parseFloat(data.percentage);
            const quizCount = quizDistribution[topic] || 0;
            const quizPercent = quizTotal > 0 ? ((quizCount / quizTotal) * 100) : 0;
            const diff = quizPercent - sourcePercent;
            const diffStr = diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
            const indicator = Math.abs(diff) > 10 ? ' ⚠️' : '';

            console.log(`${topic.padEnd(30)} | ${sourcePercent.toFixed(1).padStart(10)}% | ${quizPercent.toFixed(1).padStart(10)}% | ${diffStr}${indicator}`);
        }

        console.log('');
        console.log('Legenda: ⚠️ = Diferença significativa (>10%)');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    }
}

main();
