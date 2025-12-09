## [2025-12-06] UX/UI: A Metodologia "Antigravity Dark Mode"
**Contexto:**
A implementação inicial de um Dark Mode resultou em uma interface "assustadora" e inconsistente devido ao uso de cores hardcoded e falta de hierarquia visual.
**O Erro:**
- Uso de cores hexadecimais fixas (`bg-[#F0F9FF]`) que não se adaptam.
- Falta de contraste entre camadas (fundo vs. cards).
- Modais e janelas com restrições globais (`max-h-[90vh]`) quebrando layouts fullscreen.
**A Solução (O Padrão Antigravity):**
1. **Paleta Deep Blue-Grey:** Em vez de preto absoluto (#000), usar `oklch(.11 .02 240)` para fundo e `oklch(.16 .03 240)` para cards. Isso reduz fadiga ocular e aumenta a sofisticação.
2. **Variáveis Semânticas:** NUNCA usar hexadecimais em componentes. Usar sempre variáveis do tema:
   - `bg-background` (Fundo profundo)
   - `bg-card` (Superfícies flutuantes)
   - `bg-muted` (Áreas secundárias)
   - `text-muted-foreground` (Texto secundário)
3. **Hotfix de Layout Fullscreen:** Para diálogos de tela cheia, sempre usar overrides: `!max-w-none !w-screen !h-screen !max-w-none !h-screen !max-h-none`.

## [2025-12-09] Firestore: Segurança em Queries de Coleção vs. Documento
**Contexto:**
Após implementar um painel administrativo, o admin recebia erros persistentes de `permission-denied` ao tentar listar todos os usuários, mesmo tendo permissão de leitura configurada nas regras de segurança.
**O Erro:**
- As regras de segurança utilizavam `match /user_profiles/{userId}` com `allow read: if isOwner(userId)`.
- O código do admin tentava fazer uma **query em toda a coleção** (`getDocs(collection(db, 'user_profiles'))`).
- O Firestore avalia queries de coleção de forma diferente: ele verifica se a regra permite a leitura de **qualquer documento possível** retornado pela query. Como a regra `isOwner(userId)` restringe o acesso apenas aos documentos do próprio usuário, a query na coleção inteira falha preventivamente (mesmo que o admin pudesse filtrar depois, o Firestore bloqueia na origem).
**A Solução:**
1. **Regra de Coleção Explícita para Admin:** É necessário adicionar uma regra que permita ao Admin ler a coleção inteira, independentemente do ID do documento.
2. **Helper Function `isAdmin()`:** Centralizar a verificação de admin nas regras (`request.auth.token.email == 'admin@email.com'`).
3. **Regra Correta:**
   ```javascript
   match /user_profiles/{userId} {
     allow read: if isOwner(userId) || isAdmin(); // Admin pode ler TUDO
   }
   ```
