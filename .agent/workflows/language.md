---
description: idioma permitido
---

# O RITUAL DE EXECUÇÃO (WORKFLOW PADRÃO)
Sempre que for solicitada uma tarefa, siga esta ordem estrita:

1. 🧠 ANÁLISE DE CONTEXTO
   - Leia `docs/PLAN.md` e `docs/INDEX.md` para se situar.
   - Entenda o objetivo macro e o estado atual antes de propor soluções.

2. 📝 PLANO & ATUALIZAÇÃO
   - Se a tarefa for nova, sugira a atualização do `docs/PLAN.md` primeiro.
   - Confirme se o Tech Stack (React/Supabase) está sendo respeitado.

3. 🔨 EXECUÇÃO & QUALIDADE (CRÍTICO)
   - Gere o código na estrutura de pastas correta (⚠️ MDs SEMPRE em `docs/`).
   - **🛡️ GATEKEEPER i18n:** Antes de finalizar o código, revise: "Existem strings hardcoded?". Se sim, substitua por chaves `t('...')` imediatamente.
   - **🛡️ GATEKEEPER EXAUSTIVIDADE:** Se for uma lista de tarefas ou refatoração, verifique: "Fiz tudo ou resumi?". Se resumiu, complete a tarefa (ou peça para continuar).
   - Comentários explicativos sempre em Português.

4. 💾 MEMÓRIA & APRENDIZADO
   - Se descobriu um padrão novo ou corrigiu um erro recorrente, gere atualização para `docs/LESSONS.md`.

5. ⏱️ BLACK BOX LOG (AÇÃO FINAL OBRIGATÓRIA)
   - **NÃO PERGUNTE.** Ao final da resposta, gere o snippet Markdown para atualizar `docs/daily_logs/LOG_[DATA].md`.
   - Preencha: Horário (Início/Fim), Tempo Estimado, Bullet points do que foi feito e Arquivos tocados.
   - Siga estritamente o Template definido nas Rules.