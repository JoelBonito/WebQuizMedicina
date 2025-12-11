const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const path = require('path');

// Configuração
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../service-account.json');
const PROJECT_ID = 'web-quiz-medicina';
const QUESTION_IDS = [
    'zvxmI1RFPkNoYctXVm6E',
    'zuvKIY8khfRLZTUik1Zi',
    'yhSffbp5aiAgONxVSxwh',
    'yaKr2LtWzgYkbJsvDPyU',
    'yF1lOd7GaWIAbo7avScC',
    'vLN8KDjw8J1Jg2RgfnGP',
    'tQwIWnyaYXmj8RWL5fkv',
    'q8mbuM0sOUjT6qQnXx5W',
    'ltj3oGEYR3GPyyyDjPsj',
    'XQhef2BxGYTzWPwPNfN6',
    'XAeLCUk6YSm5VEYwqBLh',
    'PwBZmTdKS73kuWXpIWAy',
    'LkIyJYwefl7dYSG5T82J',
    'JIy7cftRUvt7WVjvR3VU',
    'Gg51Nu3W3cvZ52WE04m9',
    'Fp4KHZYDdTNH1haImvwD',
    'DZBgcwDULZjYJGvWiBZG',
    'AtVkEqvzwVyjMByHn2Re',
    '8dXEVxJYnH1y420nAsF6',
    '2qVue0dlaakJdXglqqzn'
];

// Funções Auxiliares JWT/Auth
function base64UrlEncode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function getAccessToken(serviceAccount) {
    return new Promise((resolve, reject) => {
        const jwtHeader = JSON.stringify({ alg: 'RS256', typ: 'JWT' });
        const jwtClaimSet = JSON.stringify({
            iss: serviceAccount.client_email,
            scope: 'https://www.googleapis.com/auth/datastore',
            aud: 'https://oauth2.googleapis.com/token',
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000)
        });

        const signatureInput = `${base64UrlEncode(jwtHeader)}.${base64UrlEncode(jwtClaimSet)}`;
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(signatureInput);
        const signature = signer.sign(serviceAccount.private_key, 'base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');

        const jwt = `${signatureInput}.${signature}`;
        const postData = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;

        const req = https.request({
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data).access_token);
                } else {
                    reject(new Error(`Auth error: ${res.statusCode} ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function fetchDocument(accessToken, collection, docId) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'firestore.googleapis.com',
            path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    console.error(`Error fetching ${docId}: ${res.statusCode}`);
                    resolve(null);
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// Parsear campos do Firestore REST API
function parseFirestoreField(field) {
    if (!field) return null;
    const keys = Object.keys(field);
    if (keys.length === 0) return null;
    const type = keys[0];
    const value = field[type];

    switch (type) {
        case 'stringValue': return value;
        case 'integerValue': return parseInt(value, 10);
        case 'booleanValue': return value;
        case 'arrayValue':
            return (value.values || []).map(parseFirestoreField);
        case 'mapValue':
            const obj = {};
            if (value.fields) {
                Object.entries(value.fields).forEach(([k, v]) => {
                    obj[k] = parseFirestoreField(v);
                });
            }
            return obj;
        default: return value;
    }
}

async function main() {
    try {
        const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
        console.log('🔑 Obtendo token de acesso...');
        const token = await getAccessToken(serviceAccount);
        console.log('✅ Token obtido.');

        console.log(`\n📋 Extraindo ${QUESTION_IDS.length} questões do Firestore...\n`);

        const extraction = [];

        for (const id of QUESTION_IDS) {
            const doc = await fetchDocument(token, 'questions', id);
            if (doc && doc.fields) {
                const question = {};
                Object.entries(doc.fields).forEach(([key, val]) => {
                    question[key] = parseFirestoreField(val);
                });

                extraction.push({
                    id: id,
                    numero: extraction.length + 1,
                    pergunta: question.pergunta,
                    topico: question.topico,
                    resposta_correta: question.resposta_correta,
                    justificativa: question.justificativa,
                    opcoes: question.opcoes
                });
                process.stdout.write('.');
            }
        }
        console.log('\n\n✅ Extração concluída!');

        // 2. Buscar Resumos e Mapas Mentais para extrair tópicos da fonte
        console.log(`\n📚 Buscando fontes para o projeto ${PROJECT_ID}...`);

        // Buscar Resumo
        // Precisamos listar documentos da coleção summaries filtrando por project_id
        // A API REST suporta filtro structuredQuery, que é complexo de montar manualmente.
        // Vamos tentar buscar todos e filtrar no cliente (não ideal para prod, mas ok para script pontual)
        // OU melhor: vamos usar runQuery endpoint.

        const runQuery = (collectionName) => {
            return new Promise((resolve, reject) => {
                const query = {
                    structuredQuery: {
                        from: [{ collectionId: collectionName }],
                        where: {
                            fieldFilter: {
                                field: { fieldPath: 'project_id' },
                                op: 'EQUAL',
                                value: { stringValue: PROJECT_ID }
                            }
                        },
                        limit: 1,
                        orderBy: [{ field: { fieldPath: 'created_at' }, direction: 'DESCENDING' }]
                    }
                };

                const postData = JSON.stringify(query);
                const req = https.request({
                    hostname: 'firestore.googleapis.com',
                    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Content-Length': postData.length
                    }
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            const results = JSON.parse(data);
                            // runQuery retorna um array de objetos com 'document' ou 'readTime'
                            // Pegamos o primeiro que tiver 'document'
                            const doc = results.find(r => r.document);
                            resolve(doc ? doc.document : null);
                        } else {
                            console.error(`Error querying ${collectionName}: ${res.statusCode} ${data}`);
                            resolve(null);
                        }
                    });
                });
                req.on('error', reject);
                req.write(postData);
                req.end();
            });
        };

        const summaryDoc = await runQuery('summaries');
        const mindmapDoc = await runQuery('mindmaps');

        const sourceTopics = new Set();

        if (summaryDoc && summaryDoc.fields) {
            const content = parseFirestoreField(summaryDoc.fields.content) || '';
            const matches = content.match(/##\s+(.+)/g) || [];
            matches.forEach(m => sourceTopics.add(m.replace(/##\s+/, '').trim()));
            console.log(`✅ Resumo encontrado! ${matches.length} tópicos extraídos.`);
        }

        if (mindmapDoc && mindmapDoc.fields) {
            const markdown = parseFirestoreField(mindmapDoc.fields.markdown) || '';
            const matches = markdown.match(/#{1,3}\s+(.+)/g) || [];
            matches.forEach(m => sourceTopics.add(m.replace(/#{1,3}\s+/, '').trim()));
            console.log(`✅ Mapa Mental encontrado! ${matches.length} tópicos extraídos.`);
        }

        // 3. Gerar Relatório Comparativo
        const questionTopics = new Set();
        const topicDistribution = {};

        extraction.forEach(q => {
            const topic = q.topico || 'Sem tópico';
            questionTopics.add(topic);
            topicDistribution[topic] = (topicDistribution[topic] || 0) + 1;
        });

        const sourceTopicsArray = Array.from(sourceTopics);
        const questionTopicsArray = Array.from(questionTopics);

        // Match fuzzy simples
        const coveredTopics = sourceTopicsArray.filter(st =>
            questionTopicsArray.some(qt =>
                qt.toLowerCase().includes(st.toLowerCase()) || st.toLowerCase().includes(qt.toLowerCase())
            )
        );

        const uncoveredTopics = sourceTopicsArray.filter(st => !coveredTopics.includes(st));

        const finalReport = {
            meta: {
                projeto_id: PROJECT_ID,
                data_analise: new Date().toISOString(),
                total_questoes: extraction.length
            },
            cobertura: {
                total_topicos_fonte: sourceTopicsArray.length,
                total_topicos_cobertos: coveredTopics.length,
                percentual: sourceTopicsArray.length ? ((coveredTopics.length / sourceTopicsArray.length) * 100).toFixed(1) + '%' : '0%',
                topicos_nao_cobertos: uncoveredTopics
            },
            questoes: extraction
        };

        // Salvar JSON
        const reportPath = path.join(__dirname, '../docs/quiz_quality_report.json');
        fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2));
        console.log(`\n💾 Relatório salvo em: ${reportPath}`);

        // Exibir no console de forma bonita
        console.log('\n' + '='.repeat(60));
        console.log(' RELATÓRIO DE QUALIDADE DO QUIZ');
        console.log('='.repeat(60));

        console.log(`\n📊 Cobertura de Tópicos: ${finalReport.cobertura.percentual}`);
        console.log(`Fonte: ${sourceTopicsArray.length} tópicos | Quiz: ${questionTopicsArray.length} tópicos detectados`);

        if (uncoveredTopics.length > 0) {
            console.log('\n⚠️  Tópicos NÃO Cobertos:');
            uncoveredTopics.forEach(t => console.log(`- ${t}`));
        } else {
            console.log('\n✅ Cobertura Total!');
        }

        console.log('\n📝 Tópicos no Quiz (Qtd. Questões):');
        Object.entries(topicDistribution).forEach(([t, qtd]) => {
            console.log(`- ${t}: ${qtd}`);
        });

        console.log('\n' + '-'.repeat(60));
        console.log(' DETALHE DAS QUESTÕES');
        console.log('-'.repeat(60));

        extraction.forEach(q => {
            console.log(`\n[Questão ${q.numero}] (${q.topico})`);
            console.log(`P: ${q.pergunta}`);
            console.log(`R: ${q.resposta_correta}`);
        });

    } catch (error) {
        console.error('Erro fatal:', error);
    }
}

main();
