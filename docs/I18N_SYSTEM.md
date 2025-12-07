# Sistema de Internacionalização (i18n) - WebQuizMedicina

## 📋 Visão Geral

O WebQuizMedicina possui um sistema completo de internacionalização que suporta 11 idiomas e detecta automaticamente a preferência do usuário.

## 🌍 Idiomas Suportados

1. 🇧🇷 Português (Brasil) - `pt`
2. 🇵🇹 Português (Portugal) - `pt-PT`
3. 🇬🇧 Inglês - `en`
4. 🇪🇸 Espanhol - `es`
5. 🇫🇷 Francês - `fr`
6. 🇩🇪 Alemão - `de`
7. 🇮🇹 Italiano - `it`
8. 🇯🇵 Japonês - `ja`
9. 🇨🇳 Chinês Simplificado - `zh`
10. 🇷🇺 Russo - `ru`
11. 🇸🇦 Árabe - `ar`

## 🔄 Fluxo de Detecção de Idioma

### 1. **Carregamento Inicial (Pre-Auth)**

Quando a aplicação é carregada pela primeira vez:

```typescript
Priority 1: localStorage
  ↓ (se não encontrado)
Priority 2: Detecção do Browser (navigator.language)
  ↓ (se não suportado)
Priority 3: Fallback para Inglês
```

**Arquivo**: `src/lib/languageUtils.ts`
- `getInitialLanguage()`: Gerencia a lógica de priorização
- `detectBrowserLanguage()`: Mapeia o idioma do browser para os idiomas suportados

### 2. **Registro de Novo Usuário**

Ao criar uma nova conta:

1. O idioma atual da interface é capturado
2. Após a criação do usuário no Firebase Auth
3. Um documento é criado no Firestore: `user_profiles/{uid}`
4. Campos salvos:
   - `display_name`: Nome extraído do email
   - `response_language`: Idioma detectado/atual
   - `role`: "user" (padrão)
   - `avatar_url`: URL do avatar (se disponível)
   - `created_at`: Timestamp de criação
   - `updated_at`: Timestamp de atualização

**Arquivo**: `src/contexts/ProfileContext.tsx`

```typescript
const detectedLanguage = getInitialLanguage();
const newProfile = {
  display_name: displayName,
  response_language: detectedLanguage,
  role: 'user',
  // ...
};
await setDoc(docRef, newProfile);
```

### 3. **Login / Sessão Ativa (Hydration)**

Quando um usuário faz login ou já possui sessão ativa:

1. O `AuthContext` detecta o usuário autenticado
2. O `ProfileContext` busca o documento do perfil no Firestore
3. O `LanguageContext` lê `response_language` do perfil
4. O idioma da interface é **forçado** para corresponder à preferência salva

**Arquivo**: `src/contexts/LanguageContext.tsx`

```typescript
useEffect(() => {
  if (profile?.response_language && !hasHydrated) {
    const profileLang = profile.response_language as Language;
    i18n.changeLanguage(profileLang);
    setHasHydrated(true);
  }
}, [profile, hasHydrated]);
```

### 4. **Emails de Sistema do Firebase Auth**

O Firebase Auth é configurado para enviar emails (reset de senha, verificação) no idioma do dispositivo do usuário:

**Arquivo**: `src/lib/firebase.ts`

```typescript
auth.useDeviceLanguage();
```

Isso garante que emails como:
- Verificação de email
- Reset de senha  
- Mudança de email

Sejam enviados no idioma correto automaticamente pelo Google.

## 🔧 Arquitetura de Contextos

```
App
└── ThemeProvider
    └── AuthProvider (gerencia autenticação)
        └── ProfileProvider (gerencia perfil do Firestore)
            └── LanguageProvider (gerencia idioma da UI)
                └── AppContent
```

### Hierarquia de Responsabilidades

1. **AuthContext**: 
   - Listener único do Firebase Auth
   - Estado global do usuário autenticado

2. **ProfileContext**:
   - Listener único do documento `user_profiles/{uid}`
   - Estado global do perfil do usuário
   - Criação automática de perfil no primeiro login

3. **LanguageContext**:
   - Estado do idioma da UI
   - Sincronização com i18n
   - Persistência de preferência no Firestore

## 📝 Como Usar no Código

### Em Componentes React

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>{t('dashboard.title')}</h1>
      <p>{t('dashboard.subtitle')}</p>
    </div>
  );
}
```

### Trocar Idioma Programaticamente

```typescript
import { useLanguage } from '../contexts/LanguageContext';

function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  
  const handleChange = (newLang) => {
    await setLanguage(newLang);
    // Automaticamente:
    // - Atualiza UI (i18n)
    // - Salva no Firestore
    // - Salva no localStorage
  };
}
```

## 🗂️ Estrutura de Arquivos

```
src/
├── locales/
│   ├── pt.json           # Português (Brasil)
│   ├── pt-PT.json        # Português (Portugal)
│   ├── en.json           # Inglês
│   ├── es.json           # Espanhol
│   ├── fr.json           # Francês
│   ├── de.json           # Alemão
│   ├── it.json           # Italiano
│   ├── ja.json           # Japonês
│   ├── zh.json           # Chinês
│   ├── ru.json           # Russo
│   └── ar.json           # Árabe
├── lib/
│   ├── i18n.ts           # Configuração do i18next
│   ├── languageUtils.ts  # Utilidades de detecção de idioma
│   └── firebase.ts       # Configuração do Firebase (useDeviceLanguage)
└── contexts/
    ├── LanguageContext.tsx  # Gerenciamento de idioma da UI
    ├── ProfileContext.tsx   # Gerenciamento de perfil (inclui idioma)
    └── AuthContext.tsx      # Gerenciamento de autenticação
```

## 🔐 Segurança e Boas Práticas

### ✅ Implementado

1. **Validação de Idioma**: Apenas idiomas suportados são aceitos
2. **Fallback Seguro**: Se idioma inválido → Inglês
3. **Persistência Dupla**: 
   - Firestore (fonte de verdade)
   - localStorage (cache offline)
4. **Listener Único**: Um único listener Firestore para todo o profile
5. **Hydration Controlada**: Flag `hasHydrated` evita loops infinitos

### ⚠️ Restrições

1. **Não confiar apenas no browser**: A preferência no Firestore tem prioridade após login
2. **Tratamento de Erros**: Se falhar ao salvar no Firestore, o localStorage serve como backup
3. **Sincronização**: Mudanças de idioma são propagadas para:
   - Estado local do React
   - i18n (UI)
   - Firestore (persistência)
   - localStorage (cache)

## 🧪 Testando o Sistema

### Teste 1: Novo Usuário com Browser em Português

1. Limpar localStorage e cookies
2. Configurar browser para `pt-BR`
3. Criar nova conta
4. ✅ Esperado: Interface em português, perfil salvo com `response_language: 'pt'`

### Teste 2: Novo Usuário com Browser em Inglês

1. Limpar localStorage e cookies  
2. Configurar browser para `en-US`
3. Criar nova conta
4. ✅ Esperado: Interface em inglês, perfil salvo com `response_language: 'en'`

### Teste 3: Usuário Existente

1. Fazer login com conta existente (idioma salvo: alemão)
2. ✅ Esperado: Interface muda para alemão automaticamente

### Teste 4: Troca Manual de Idioma

1. Fazer login
2. Ir em Configurações → Idioma
3. Trocar para japonês
4. ✅ Esperado: UI muda instantaneamente, Firestore atualizado, localStorage atualizado

## 📊 Metricas e Logs

O sistema registra logs importantes para debug:

```
[Language Detection] Using saved language: pt
[Language Detection] Detected browser language: en
[ProfileContext] Creating new profile with detected language: es
[LanguageContext] Hydrating from profile: fr
```

## 🚀 Deploy

Ao fazer deploy:

1. Todos os 11 arquivos JSON de tradução são incluídos no bundle
2. O Vite otimiza os imports
3. Apenas o idioma ativo é carregado inicialmente (code splitting)

## 📅 Data de Implementação

**07 de Dezembro de 2025**

Sessão 8: Implementação do Sistema de Detecção Automática de Idioma
