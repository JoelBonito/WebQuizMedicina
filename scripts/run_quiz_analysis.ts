/**
 * Script Cliente para Análise de Qualidade do Quiz
 * 
 * Executa localmente usando o Firebase SDK do cliente
 * para chamar a Cloud Function analyzeQuizQuality
 */

import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import * as fs from 'fs';
import * as path from 'path';

// Configuração do Firebase (do seu projeto)
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'southamerica-east1');
const auth = getAuth(app);

async function runAnalysis() {
    try {
        console.log('🔐 Autenticando como admin...');

        // Fazer login como admin para ter permissões
        await signInWithEmailAndPassword(auth, 'jbento1@gmail.com', process.env.ADMIN_PASSWORD || '');

        console.log('✅ Autenticado com sucesso!\n');
        console.log('📊 Iniciando análise de qualidade do quiz...\n');

        // Chamar a Cloud Function
        const analyzeQuizQuality = httpsCallable(functions, 'analyzeQuizQuality');

        const result = await analyzeQuizQuality({
            email: 'renata@medicina.com',
            projectName: 'Fisiopatologia Final',
            targetTime: '2025-12-09T21:51:00'
        });

        const report: any = result.data;

        // Exibir relatório no console
        console.log('='.repeat(80));
        console.log('📊 RELATÓRIO DE ANÁLISE DE QUALIDADE DO QUIZ');
        console.log('='.repeat(80));
        console.log();
        console.log(`📁 Projeto: ${report.projeto}`);
        console.log(`📅 Data do Quiz: ${new Date(report.data_quiz).toLocaleString('pt-BR')}`);
        console.log(`📝 Total de Questões: ${report.total_questoes}`);
        console.log();
        console.log('-'.repeat(80));
        console.log('📈 ESTATÍSTICAS');
        console.log('-'.repeat(80));
        console.log(`Tópicos na Fonte: ${report.estatisticas.topicos_fonte}`);
        console.log(`Tópicos no Quiz: ${report.estatisticas.topicos_quiz}`);
        console.log(`Tópicos Cobertos: ${report.estatisticas.topicos_cobertos}`);
        console.log(`Tópicos NÃO Cobertos: ${report.estatisticas.topicos_nao_cobertos}`);
        console.log(`Taxa de Cobertura: ${report.estatisticas.taxa_cobertura}`);
        console.log();

        if (report.topicos_nao_cobertos.length > 0) {
            console.log('-'.repeat(80));
            console.log('⚠️  TÓPICOS NÃO COBERTOS PELO QUIZ');
            console.log('-'.repeat(80));
            report.topicos_nao_cobertos.forEach((topico: string, i: number) => {
                console.log(`${i + 1}. ${topico}`);
            });
            console.log();
        }

        console.log('-'.repeat(80));
        console.log('📊 DISTRIBUIÇÃO DE QUESTÕES POR TÓPICO');
        console.log('-'.repeat(80));
        Object.entries(report.distribuicao_topicos).forEach(([topico, count]) => {
            console.log(`${topico}: ${count} questões`);
        });
        console.log();

        console.log('-'.repeat(80));
        console.log('📝 QUESTÕES DO QUIZ');
        console.log('-'.repeat(80));
        console.log();

        report.questoes.forEach((q: any) => {
            console.log(`\n📌 QUESTÃO ${q.numero}`);
            console.log(`Tópico: ${q.topico}`);
            console.log(`Dificuldade: ${q.dificuldade}`);
            console.log(`Tipo: ${q.tipo}`);
            console.log(`\nPergunta: ${q.pergunta}`);

            if (q.opcoes && q.opcoes.length > 0) {
                console.log('\nOpções:');
                q.opcoes.forEach((opt: string, i: number) => {
                    const marker = opt === q.resposta_correta ? '✅' : '  ';
                    console.log(`${marker} ${String.fromCharCode(65 + i)}) ${opt}`);
                });
            }

            console.log(`\nResposta Correta: ${q.resposta_correta}`);
            if (q.justificativa && q.justificativa !== 'Sem justificativa') {
                console.log(`Justificativa: ${q.justificativa}`);
            }
            console.log('-'.repeat(80));
        });

        // Salvar relatório completo em JSON
        const reportPath = path.join(__dirname, '../docs/quiz_quality_report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

        console.logo(`\n💾 Relatório completo salvo em: ${reportPath}`);
        console.log('\n' + '='.repeat(80));

        process.exit(0);
    } catch (error: any) {
        console.error('\n❌ Erro na análise:', error);
        console.error('Mensagem:', error.message);
        if (error.code) {
            console.error('Código:', error.code);
        }
        process.exit(1);
    }
}

// Executar análise
runAnalysis();
