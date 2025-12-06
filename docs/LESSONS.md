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
3. **Hotfix de Layout Fullscreen:** Para diálogos de tela cheia, sempre usar overrides: `!max-w-none !w-screen !h-screen !max-h-none`.
