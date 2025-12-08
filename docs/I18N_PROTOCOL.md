# 🌐 Protocolo de Internacionalização (i18n)

**REGRA DE OURO**: Zero tolerância para "preguiça digital" - TODOS os idiomas devem estar sempre sincronizados.

## 📋 Idiomas Suportados

O projeto suporta **11 idiomas**:

| Código | Idioma | Arquivo |
|--------|--------|---------|
| `pt` | Português (Brasil) | `src/locales/pt.json` |
| `en` | Inglês | `src/locales/en.json` |
| `es` | Espanhol | `src/locales/es.json` |
| `fr` | Francês | `src/locales/fr.json` |
| `de` | Alemão | `src/locales/de.json` |
| `it` | Italiano | `src/locales/it.json` |
| `ja` | Japonês | `src/locales/ja.json` |
| `pt-PT` | Português (Portugal) | `src/locales/pt-PT.json` |
| `ru` | Russo | `src/locales/ru.json` |
| `zh` | Chinês | `src/locales/zh.json` |
| `ar` | Árabe | `src/locales/ar.json` |

## 🚫 Regras Obrigatórias

### 1. Zero Hardcoding
```tsx
// ❌ ERRADO - String hardcoded
<h1>Bem-vindo ao QuizMed</h1>

// ✅ CORRETO - Usando i18n
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
<h1>{t('auth.welcome')}</h1>
```

### 2. Sincronização Total
Ao adicionar **UMA** chave, você deve adicioná-la em **TODOS** os 11 idiomas:

```json
// pt.json
{
  "toasts": {
    "newFeature": "Nova funcionalidade adicionada!"
  }
}

// en.json
{
  "toasts": {
    "newFeature": "New feature added!"
  }
}

// ... e assim por diante para es, fr, de, it, ja, pt-PT, ru, zh, ar
```

## 🔧 Ferramentas de Validação

### 1. Script de Auditoria
```bash
npm run i18n:check
```

Este comando executa `scripts/check-i18n-keys.js` e mostra:
- Total de chaves em cada idioma
- Chaves faltando por idioma
- Status: ✓ Completo ou ❌ Faltando X chaves

### 2. Hook de Pré-Commit
Instalado automaticamente em `.git/hooks/pre-commit`:
- Bloqueia commits se houver chaves faltando
- Executa automaticamente a validação
- Fornece feedback claro sobre o que está faltando

## 📝 Fluxo de Trabalho

### Adicionando Nova Chave i18n

1. **Identifique a necessidade**
   ```tsx
   // Você precisa adicionar um novo texto
   <Button>Salvar Alterações</Button>
   ```

2. **Crie a chave em pt.json**
   ```json
   {
     "buttons": {
       "saveChanges": "Salvar Alterações"
     }
   }
   ```

3. **Adicione em en.json**
   ```json
   {
     "buttons": {
       "saveChanges": "Save Changes"
     }
   }
   ```

4. **Replique para TODOS os outros idiomas**
   - `es.json`: "Guardar Cambios"
   - `fr.json`: "Sauvegarder les Modifications"
   - `de.json`: "Änderungen Speichern"
   - `it.json`: "Salva Modifiche"
   - `ja.json`: "変更を保存"
   - `pt-PT.json`: "Guardar Alterações"
   - `ru.json`: "Сохранить Изменения"
   - `zh.json`: "保存更改"
   - `ar.json`: "حفظ التغييرات"

5. **Valide antes de continuar**
   ```bash
   npm run i18n:check
   ```

6. **Use no componente**
   ```tsx
   import { useTranslation } from 'react-i18next';
   
   function MyComponent() {
     const { t } = useTranslation();
     return <Button>{t('buttons.saveChanges')}</Button>;
   }
   ```

## 🛡️ Proteções Automáticas

### Pré-Commit Hook
Quando você tentar fazer commit, o hook verifica automaticamente:

```bash
git commit -m "feat: adiciona botão salvar"

🌐 Validando sincronização i18n...
❌ ERRO: Chaves i18n faltando em alguns idiomas!

[ES] 1 chave faltando:
  - buttons.saveChanges

⚠️  Adicione as chaves faltantes antes de fazer commit.
   Execute: npm run i18n:check para detalhes.
```

## 🎯 Casos Especiais

### Pluralização
Use o padrão i18next para plural:

```json
{
  "sourcesCount": "{{count}} fonte",
  "sourcesCount_other": "{{count}} fontes"
}
```

### Interpolação
```json
{
  "greeting": "Olá, {{name}}!"
}
```

### Contexto
```json
{
  "delete": "Excluir",
  "delete_confirm": "Tem certeza que deseja excluir?"
}
```

## 📊 Métricas de Qualidade

Execute periodicamente:
```bash
npm run i18n:check
```

**Meta**: Todos os idiomas devem mostrar:
```
[XX] ✓ Completo
```

## ⚠️ Penalidades por Violação

Se você:
- Adicionar texto hardcoded
- Esquecer de traduzir para todos os idiomas
- Tentar fazer commit com chaves faltando

**O sistema irá**:
1. Bloquear o commit
2. Gerar erro no hook de pré-commit
3. Exibir lista clara de chaves faltantes
4. Impedir o push até correção

## 🆘 Resolução de Problemas

### "Não sei traduzir para idioma X"
Use uma tradução automática como placeholder:

```json
// Tradução temporária (marcar com TODO se necessário)
{
  "newKey": "Automatic translation - needs review"
}
```

### "Muitos idiomas para atualizar manualmente"
Considere usar ferramentas de tradução em lote (com revisão posterior):
- Google Translate API
- DeepL API
- Ou mantenha um arquivo de "pending translations"

### "O hook está bloqueando meu commit"
Significa que há chaves faltando. Execute:

```bash
npm run i18n:check
# Veja quais chaves estão faltando
# Adicione-as
# Tente o commit novamente
```

## 📚 Recursos

- [i18next Documentation](https://www.i18next.com/)
- [react-i18next Documentation](https://react.i18next.com/)
- Script de auditoria: `scripts/check-i18n-keys.js`

---

**Lembre-se**: Internacionalização completa não é opcional - é obrigatória! 🌍
