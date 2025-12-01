import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Configuração
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FIREBASE_SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './service-account.json';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Faltando SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no arquivo .env');
    process.exit(1);
}

if (!fs.existsSync(FIREBASE_SERVICE_ACCOUNT_PATH)) {
    console.error(`❌ Faltando arquivo de Conta de Serviço do Firebase em ${FIREBASE_SERVICE_ACCOUNT_PATH}`);
    console.error('Por favor, baixe-o do Console do Firebase > Configurações do Projeto > Contas de Serviço');
    process.exit(1);
}

// Inicializar Clientes
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
const auth = admin.auth();

// Tabelas para migrar
const TABLES = [
    'user_profiles', // Tratamento especial
    'projects',
    'sources',
    'questions',
    'flashcards',
    'summaries',
    'difficulties',
    'progress',
    'chat_messages'
];

async function migrate() {
    console.log('🚀 Iniciando migração...');

    // 1. Criar Mapeamento de Usuários (Email -> Firebase UID)
    console.log('👥 Construindo Mapeamento de Usuários...');
    const userMapping = new Map<string, string>(); // Supabase UID -> Firebase UID

    // Buscar todos os usuários do Firebase
    const firebaseUsers = await listAllFirebaseUsers();
    const emailToFirebaseUid = new Map<string, string>();
    firebaseUsers.forEach(u => {
        if (u.email) emailToFirebaseUid.set(u.email.toLowerCase(), u.uid);
    });

    // Buscar todos os usuários do Supabase
    const { data: { users: supabaseUsers }, error: supabaseError } = await supabase.auth.admin.listUsers();

    if (supabaseError) {
        console.error('⚠️ Não foi possível listar usuários do Supabase. A migração dependerá da correspondência de e-mail se possível, ou falhará no mapeamento de IDs.', supabaseError);
    } else {
        supabaseUsers.forEach(u => {
            if (u.email) {
                const firebaseUid = emailToFirebaseUid.get(u.email.toLowerCase());
                if (firebaseUid) {
                    userMapping.set(u.id, firebaseUid);
                    console.log(`   🔗 Mapeado ${u.email}: ${u.id} -> ${firebaseUid}`);
                } else {
                    console.warn(`   ⚠️ Usuário ${u.email} encontrado no Supabase mas NÃO no Firebase. Dados deste usuário podem ser pulados ou ficar órfãos.`);
                }
            }
        });
    }

    // 2. Migrar Tabelas
    for (const table of TABLES) {
        console.log(`\n📦 Migrando tabela: ${table}...`);

        // Buscar dados do Supabase
        const { data: rows, error } = await supabase.from(table).select('*');

        if (error) {
            console.error(`   ❌ Erro ao buscar ${table}:`, error.message);
            continue;
        }

        if (!rows || rows.length === 0) {
            console.log(`   ℹ️ Tabela ${table} está vazia.`);
            continue;
        }

        console.log(`   Buscadas ${rows.length} linhas.`);

        const batchSize = 400; // Limite de batch do Firestore é 500
        let batch = db.batch();
        let count = 0;
        let totalMigrated = 0;

        for (const row of rows) {
            // Determinar novo ID (usar existente se possível, ou gerar auto)
            // IDs do Supabase geralmente são UUIDs. IDs do Firestore podem ser strings. Podemos manter UUIDs.
            const docId = row.id ? String(row.id) : db.collection(table).doc().id;

            // Mapear ID de Usuário
            let newUserId = row.user_id;
            if (row.user_id) {
                if (userMapping.has(row.user_id)) {
                    newUserId = userMapping.get(row.user_id);
                } else {
                    // Fallback: se não mapeou, mantém original mas avisa.
                    // Ou talvez este user_id não esteja em auth.users, mas seja apenas uma string? Improvável.
                    // Se não encontramos o usuário no Firebase, não podemos atribuí-lo corretamente.
                    // Opção: Pular ou Manter Órfão.
                    // Por enquanto, vamos manter órfão, mas registrar.
                    // console.warn(`   ⚠️ Linha ${docId} tem user_id ${row.user_id} que não foi mapeado para o Firebase.`);
                }
            }

            // Preparar dados
            const data = { ...row };

            // Corrigir campo ID (remover 'id' dos dados pois é a chave do doc)
            delete data.id;

            // Atualizar user_id
            if (data.user_id) data.user_id = newUserId;

            // Tratamento especial para user_profiles
            if (table === 'user_profiles') {
                // No Supabase user_profiles geralmente tem 'id' como o user_id.
                // Então o docId deve ser o newUserId.
                // E geralmente não precisamos de um campo 'user_id' separado dentro, ou ele corresponde ao 'id'.
                if (userMapping.has(row.id)) {
                    const mappedUid = userMapping.get(row.id);
                    const userProfileRef = db.collection('user_profiles').doc(mappedUid!); // Usar ! porque verificamos 'has'
                    batch.set(userProfileRef, data);
                } else {
                    console.warn(`   ⚠️ Pulando perfil para Usuário Supabase ${row.id} (não encontrado no Firebase)`);
                    continue;
                }
            } else {
                // Tabela padrão
                const docRef = db.collection(table).doc(docId);
                batch.set(docRef, data);
            }

            count++;
            if (count >= batchSize) {
                await batch.commit();
                totalMigrated += count;
                console.log(`   Salvas ${totalMigrated} linhas...`);
                batch = db.batch();
                count = 0;
            }
        }

        if (count > 0) {
            await batch.commit();
            totalMigrated += count;
        }

        console.log(`   ✅ Migradas ${totalMigrated} linhas de ${table}.`);
    }

    console.log('\n🎉 Migração Completa!');
}

async function listAllFirebaseUsers(nextPageToken?: string): Promise<admin.auth.UserRecord[]> {
    const listUsersResult = await auth.listUsers(1000, nextPageToken);
    const users = listUsersResult.users;
    if (listUsersResult.pageToken) {
        const nextUsers = await listAllFirebaseUsers(listUsersResult.pageToken);
        return users.concat(nextUsers);
    }
    return users;
}

migrate().catch(console.error);
