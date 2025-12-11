const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../service-account.json');
const PROJECT_ID = 'web-quiz-medicina';
const TARGET_PROJECT_ID = 'sCYWohQxbvpEed8Aw0hw'; // ID do projeto Fisiopatologia Final

// --- Auth Logic (Reutilizada) ---
function base64UrlEncode(str) {
    return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
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
        const signature = signer.sign(serviceAccount.private_key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        const postData = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${signatureInput}.${signature}`;

        const req = https.request({
            hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': postData.length }
        }, (res) => {
            let data = ''; res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data).access_token));
        });
        req.write(postData); req.end();
    });
}

// --- Fetch Logic ---
async function main() {
    try {
        const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
        const token = await getAccessToken(serviceAccount);

        // Listar documentos da coleção summaries
        // Como não temos filtro server-side fácil via REST simples sem query complexa, vamos listar e filtrar
        const req = https.request({
            hostname: 'firestore.googleapis.com',
            path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/summaries?pageSize=100`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                const response = JSON.parse(data);
                if (!response.documents) {
                    console.log("Nenhum resumo encontrado.");
                    return;
                }

                // Filtrar pelo project_id
                const targetSummary = response.documents.find(doc => {
                    const fields = doc.fields;
                    return fields.project_id && fields.project_id.stringValue === TARGET_PROJECT_ID;
                });

                if (targetSummary) {
                    console.log("\n📅 DATA DO RESUMO ENCONTRADO:");
                    console.log("Título:", targetSummary.fields.titulo ? targetSummary.fields.titulo.stringValue : "Sem título");
                    console.log("Criado em:", targetSummary.fields.created_at ? targetSummary.fields.created_at.timestampValue : "Sem data");

                    // Tentar extrair do campo 'topicos' se for array
                    let topics = [];
                    if (targetSummary.fields.topicos && targetSummary.fields.topicos.arrayValue && targetSummary.fields.topicos.arrayValue.values) {
                        topics = targetSummary.fields.topicos.arrayValue.values.map(v => v.stringValue);
                    }

                    // Se não encontrou, tentar extrair do HTML
                    if (topics.length === 0 && targetSummary.fields.conteudo_html && targetSummary.fields.conteudo_html.stringValue) {
                        // Simplificação: buscar textos dentro de tags h2 ou h3, ou apenas linhas que pareçam títulos
                        // Mas como é HTML, melhor confiar no campo topicos se existir, ou no titulo principal
                        const html = targetSummary.fields.conteudo_html.stringValue;
                        // Regex simples para capturar conteúdo de h1, h2, h3
                        const matches = html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi) || [];
                        topics = matches.map(m => m.replace(/<[^>]+>/g, '').trim());
                    }

                    // Adicionar titulo se não estiver na lista
                    if (targetSummary.fields.titulo && targetSummary.fields.titulo.stringValue) {
                        const title = targetSummary.fields.titulo.stringValue;
                        if (!topics.includes(title)) topics.unshift(title);
                    }

                    console.log("TOPICS_START");
                    console.log(JSON.stringify(topics, null, 2));
                    console.log("TOPICS_END");
                } else {
                    console.log("Resumo não encontrado para este projeto.");
                }
            });
        });
        req.end();

    } catch (e) { console.error(e); }
}

main();
