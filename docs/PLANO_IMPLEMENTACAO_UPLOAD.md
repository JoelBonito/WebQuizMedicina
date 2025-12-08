# Plano de Implementação - Sistema de Upload de Fontes

## Sumário Executivo

Este plano aborda três áreas principais de melhoria do sistema de upload:
1. Análise e limpeza do Storage (dados desnecessários)
2. Aumento do limite de upload de 50MB para 200MB
3. Expansão dos tipos de ficheiros suportados com OCR e transcrição de áudio

---

## 1. Análise de Dados no Storage

### 1.1 Contexto do Problema

**Situação Atual:**
- O sistema foi desenhado para extrair texto de PDFs/TXT/MD diretamente no browser
- Após extração, o conteúdo é guardado em `extracted_content` no Firestore
- Ficheiros de texto **não deveriam** ser guardados no Firebase Storage
- Apenas imagens e áudio são enviados ao Storage para processamento posterior via Gemini

**Código Relevante (`useSources.ts:120-144`):**
```typescript
// Tenta extrair texto diretamente (PDF, TXT, MD)
const extractedContent = await processFile(file);
if (extractedContent) {
  // Guarda conteúdo extraído - NÃO faz upload ao Storage
}
// Só faz upload se não conseguiu extrair texto
if (!extractedContent) {
  const storageRef = ref(storage, `projects/${projectId}/${timestamp}_${file.name}`);
  await uploadBytes(storageRef, file);
}
```

### 1.2 Tarefas de Investigação

| # | Tarefa | Descrição |
|---|--------|-----------|
| 1.1 | Auditoria do Storage | Listar todos os ficheiros em `projects/` no Firebase Storage |
| 1.2 | Cruzar com Firestore | Verificar se cada ficheiro no Storage tem `source` correspondente com `extracted_content` |
| 1.3 | Identificar Órfãos | Encontrar ficheiros no Storage sem referência no Firestore |
| 1.4 | Identificar Duplicados | PDFs/TXTs que foram guardados no Storage mas têm `extracted_content` |

### 1.3 Script de Auditoria

**Criar:** `scripts/audit-storage.ts`

```typescript
// Pseudocódigo do script de auditoria
async function auditStorage() {
  // 1. Listar todos ficheiros no Storage
  const storageFiles = await listAllFiles('projects/');

  // 2. Buscar todas as sources no Firestore
  const sources = await getAllSources();

  // 3. Criar mapa de storage_path -> source
  const sourcesByPath = new Map(sources.map(s => [s.storage_path, s]));

  // 4. Categorizar ficheiros
  const report = {
    orphaned: [],      // No Storage mas sem source
    redundant: [],     // No Storage mas source tem extracted_content
    valid: [],         // No Storage, source precisa (imagens/áudio sem texto)
    textWithStorage: [] // PDFs/TXTs que não deviam estar no Storage
  };

  for (const file of storageFiles) {
    const source = sourcesByPath.get(file.path);
    if (!source) {
      report.orphaned.push(file);
    } else if (source.extracted_content && ['pdf', 'txt', 'md'].includes(source.type)) {
      report.textWithStorage.push({ file, source });
    } else if (source.extracted_content) {
      report.redundant.push({ file, source });
    } else {
      report.valid.push({ file, source });
    }
  }

  return report;
}
```

### 1.4 Ações de Limpeza

| # | Ação | Risco | Reversível |
|---|------|-------|------------|
| 1 | Eliminar ficheiros órfãos | Baixo | Não |
| 2 | Eliminar PDFs/TXTs redundantes | Médio | Não |
| 3 | Atualizar `storage_path` para null nos redundantes | Baixo | Sim |

**Recomendação:** Executar auditoria primeiro, gerar relatório, revisar manualmente antes de eliminar.

---

## 2. Aumento do Limite de Upload (50MB → 200MB)

### 2.1 Contexto

**Situação Atual:**
- Limite de 50MB definido pensando no Supabase
- Firebase Storage suporta uploads maiores (até 5GB por ficheiro)
- Limite actual em `useSources.ts:49`

```typescript
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
```

### 2.2 Alterações Necessárias

| # | Ficheiro | Linha | Alteração |
|---|----------|-------|-----------|
| 1 | `src/hooks/useSources.ts` | 49 | Alterar `MAX_FILE_SIZE` para 200MB |
| 2 | `src/components/SourcesPanel.tsx` | ~220 | Atualizar mensagem de erro |
| 3 | `storage.rules` | - | Adicionar validação de tamanho (opcional) |

### 2.3 Código Atualizado

**`useSources.ts`:**
```typescript
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
```

### 2.4 Considerações

| Aspecto | Impacto |
|---------|---------|
| **Custo de Storage** | Aumento proporcional ao uso |
| **Tempo de Upload** | Uploads maiores = mais tempo |
| **Processamento Gemini** | Ficheiros maiores = mais tokens |
| **UX** | Necessário feedback de progresso para uploads grandes |

### 2.5 Melhorias UX Recomendadas

```typescript
// Adicionar barra de progresso para uploads
const uploadTask = uploadBytesResumable(storageRef, file);
uploadTask.on('state_changed',
  (snapshot) => {
    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
    setUploadProgress(progress);
  }
);
```

---

## 3. Expansão de Tipos de Ficheiros

### 3.1 Novos Tipos Suportados

| Categoria | Extensões | MIME Types |
|-----------|-----------|------------|
| **Documentos** | `.pdf`, `.txt`, `.md`, `.doc`, `.docx` | `application/pdf`, `text/plain`, `text/markdown`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| **Apresentações** | `.ppt`, `.pptx` | `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| **Imagens** | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.tiff` | `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/bmp`, `image/tiff` |
| **Áudio** | `.mp3`, `.wav`, `.m4a`, `.ogg`, `.webm`, `.aac`, `.flac` | `audio/mpeg`, `audio/wav`, `audio/x-m4a`, `audio/ogg`, `audio/webm`, `audio/aac`, `audio/flac` |

### 3.2 Alterações de Código

**`SourcesPanel.tsx` (allowedTypes):**
```typescript
const allowedTypes = [
  // Documentos
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Apresentações
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Imagens
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  // Áudio
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/flac",
];
```

**`useSources.ts` (FileType):**
```typescript
export type FileType =
  | 'pdf' | 'txt' | 'md' | 'doc' | 'docx'  // Documentos
  | 'ppt' | 'pptx'                          // Apresentações
  | 'jpg' | 'jpeg' | 'png' | 'gif' | 'webp' | 'bmp' | 'tiff'  // Imagens
  | 'mp3' | 'wav' | 'm4a' | 'ogg' | 'webm' | 'aac' | 'flac';  // Áudio
```

---

## 4. Sistema de OCR (Reconhecimento de Texto)

### 4.1 Situação Atual

O sistema já possui OCR básico via Gemini para imagens:

**`process_embeddings_queue.ts:86-121`:**
```typescript
const prompt = "Transcreva todo o texto visível nesta imagem com alta fidelidade,
  **incluindo anotações manuscritas (letra de mão)**...";
```

### 4.2 Melhorias Propostas

| # | Melhoria | Descrição |
|---|----------|-----------|
| 1 | **OCR Avançado** | Usar Gemini 2.0 Flash para melhor qualidade |
| 2 | **Suporte Multi-página** | PDFs escaneados (imagens) com múltiplas páginas |
| 3 | **Detecção de Idioma** | Adaptar prompt ao idioma detectado |
| 4 | **Estrutura Preservada** | Manter formatação de tabelas, listas, etc. |

### 4.3 Prompt OCR Melhorado

```typescript
const ocrPrompt = `
Analise esta imagem e realize as seguintes tarefas:

1. **TRANSCRIÇÃO COMPLETA**
   - Transcreva TODO o texto visível, incluindo:
     - Texto impresso
     - Anotações manuscritas (letra de mão)
     - Texto em diagramas, gráficos e tabelas

2. **PRESERVAÇÃO DE ESTRUTURA**
   - Mantenha a hierarquia de títulos e subtítulos
   - Preserve listas numeradas e com marcadores
   - Reproduza tabelas em formato Markdown

3. **ELEMENTOS VISUAIS**
   - Descreva brevemente diagramas e figuras relevantes
   - Identifique fórmulas matemáticas (use notação LaTeX)

4. **QUALIDADE**
   - Se algum texto estiver ilegível, indique com [ilegível]
   - Se houver incerteza, indique com [?]

Idioma esperado: Português (adapte se detectar outro idioma)
`;
```

### 4.4 Processamento de DOC/DOCX/PPT/PPTX

**Opção A: Conversão Server-side**
- Usar biblioteca como `mammoth` para DOCX
- Usar biblioteca como `pptx-parser` para PPTX
- Processar no Cloud Function

**Opção B: Via Gemini (Recomendado)**
- Enviar ficheiro diretamente ao Gemini
- Gemini 1.5/2.0 suporta extração de texto de Office files
- Mais simples e mantém consistência

```typescript
// process_embeddings_queue.ts
if (['doc', 'docx', 'ppt', 'pptx'].includes(sourceData.type)) {
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: sourceData.metadata.mimeType,
        data: base64Data
      }
    },
    "Extraia todo o texto deste documento, preservando a estrutura e formatação."
  ]);
  extractedContent = result.response.text();
}
```

---

## 5. Transcrição de Áudio - Estudo de Viabilidade

### 5.1 Opções Técnicas

| Serviço | Qualidade | Custo | Integração |
|---------|-----------|-------|------------|
| **Google Cloud Speech-to-Text** | Excelente | $0.006/15seg (standard) | Nativa (Firebase) |
| **OpenAI Whisper API** | Excelente | $0.006/minuto | Simples |
| **Gemini 1.5/2.0** | Boa | ~$0.075/milhão tokens input | Já integrado |
| **Assembly AI** | Excelente | $0.00025/segundo | API REST |

### 5.2 Análise Detalhada

#### 5.2.1 Google Cloud Speech-to-Text

**Prós:**
- Integração nativa com Firebase
- Suporta português (PT-BR, PT-PT)
- Reconhecimento em tempo real ou batch
- Modelos especializados (médico disponível em inglês)

**Contras:**
- Configuração adicional necessária
- Custo pode acumular com áudios longos

**Custos:**
| Modelo | Preço |
|--------|-------|
| Standard | $0.024/minuto |
| Enhanced | $0.036/minuto |
| Medical | $0.078/minuto |

**Exemplo: Aula de 1 hora**
- Standard: $1.44
- Enhanced: $2.16

#### 5.2.2 OpenAI Whisper

**Prós:**
- Qualidade excepcional
- Preço competitivo
- Suporta múltiplos idiomas
- Detecta idioma automaticamente

**Contras:**
- Limite de 25MB por ficheiro
- Requer conta OpenAI separada

**Custos:**
- $0.006/minuto = $0.36/hora

#### 5.2.3 Gemini (Atual)

**Prós:**
- Já integrado no sistema
- Sem configuração adicional
- Suporta multimodal (áudio + contexto)

**Contras:**
- Qualidade inferior para áudios longos
- Limite de contexto pode ser atingido
- Custo por tokens pode ser alto

**Custos (Gemini 1.5 Flash):**
- Input: $0.075/milhão tokens
- 1 hora de áudio ≈ 15,000-30,000 tokens
- Custo estimado: $0.001-0.002/hora (muito barato!)

**Nota:** Gemini 2.0 Flash suporta áudio nativo até 9.5 horas

### 5.3 Recomendação

**Abordagem Híbrida:**

1. **Áudios curtos (<15 min):** Usar Gemini 2.0 Flash
   - Já integrado, custo baixíssimo
   - Qualidade suficiente para anotações

2. **Áudios longos (>15 min):** Usar Google Cloud Speech-to-Text
   - Melhor qualidade para transcrições longas
   - Integração nativa com Firebase

3. **Fallback:** OpenAI Whisper
   - Quando alta precisão é necessária
   - Áudios com sotaques ou ruído

### 5.4 Estimativa de Custos por Uso

| Cenário | Duração | Gemini | Speech-to-Text | Whisper |
|---------|---------|--------|----------------|---------|
| Nota de voz | 2 min | $0.0001 | $0.05 | $0.012 |
| Resumo de aula | 15 min | $0.001 | $0.36 | $0.09 |
| Aula completa | 1 hora | $0.002 | $1.44 | $0.36 |
| Palestra | 2 horas | $0.004 | $2.88 | $0.72 |

### 5.5 Implementação Proposta

```typescript
// functions/src/transcribe_audio.ts

async function transcribeAudio(
  storagePath: string,
  duration: number,
  options: { quality: 'fast' | 'accurate' }
): Promise<string> {

  // Escolher serviço baseado em duração e qualidade
  if (duration <= 900 || options.quality === 'fast') { // 15 minutos
    return transcribeWithGemini(storagePath);
  } else {
    return transcribeWithSpeechToText(storagePath);
  }
}

async function transcribeWithGemini(storagePath: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const audioData = await downloadFromStorage(storagePath);
  const base64Audio = Buffer.from(audioData).toString('base64');

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: getMimeType(storagePath),
        data: base64Audio
      }
    },
    `Transcreva este áudio com alta fidelidade:
     - Inclua pontuação adequada
     - Preserve pausas significativas com [pausa]
     - Identifique diferentes falantes se houver
     - Corrija erros gramaticais óbvios mas mantenha o conteúdo original
     - Se houver termos técnicos médicos, escreva-os corretamente`
  ]);

  return result.response.text();
}

async function transcribeWithSpeechToText(storagePath: string): Promise<string> {
  const speech = require('@google-cloud/speech');
  const client = new speech.SpeechClient();

  const gcsUri = `gs://${bucket}/${storagePath}`;

  const request = {
    config: {
      encoding: 'MP3',
      languageCode: 'pt-BR',
      alternativeLanguageCodes: ['pt-PT', 'en-US'],
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      model: 'latest_long', // Otimizado para áudios longos
    },
    audio: { uri: gcsUri },
  };

  const [operation] = await client.longRunningRecognize(request);
  const [response] = await operation.promise();

  return response.results
    .map(result => result.alternatives[0].transcript)
    .join('\n');
}
```

---

## 6. Cronograma de Implementação

### Fase 1: Auditoria e Limpeza (Prioridade Alta)
- [ ] Criar script de auditoria do Storage
- [ ] Executar auditoria e gerar relatório
- [ ] Revisar resultados manualmente
- [ ] Limpar ficheiros órfãos/redundantes
- [ ] Atualizar documentação

### Fase 2: Limite de Upload (Prioridade Alta)
- [ ] Alterar `MAX_FILE_SIZE` para 200MB
- [ ] Atualizar mensagens de erro
- [ ] Adicionar barra de progresso para uploads grandes
- [ ] Testar com ficheiros de vários tamanhos
- [ ] Atualizar Storage Rules (opcional)

### Fase 3: Novos Tipos de Ficheiros (Prioridade Média)
- [ ] Atualizar lista de tipos permitidos (frontend)
- [ ] Atualizar `FileType` enum
- [ ] Adicionar processamento para DOC/DOCX
- [ ] Adicionar processamento para PPT/PPTX
- [ ] Adicionar novos formatos de imagem
- [ ] Testar extração de cada tipo

### Fase 4: OCR Avançado (Prioridade Média)
- [ ] Melhorar prompt de OCR
- [ ] Adicionar suporte multi-página para scans
- [ ] Testar com documentos manuscritos
- [ ] Testar com fotos de livros
- [ ] Otimizar qualidade vs custo

### Fase 5: Transcrição de Áudio (Prioridade Baixa)
- [ ] Implementar transcrição via Gemini (básico)
- [ ] Configurar Google Cloud Speech-to-Text
- [ ] Implementar lógica de escolha de serviço
- [ ] Adicionar UI para qualidade de transcrição
- [ ] Testar com diferentes tipos de áudio
- [ ] Monitorar custos

---

## 7. Riscos e Mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Custos de transcrição elevados | Alto | Médio | Limites por usuário, cache de transcrições |
| OCR falha em manuscritos | Médio | Médio | Fallback manual, múltiplas tentativas |
| Uploads grandes falham | Médio | Baixo | Upload resumable, retry automático |
| Tipos Office não processam | Médio | Baixo | Converter para PDF antes de enviar |
| Storage costs increase | Médio | Alto | Lifecycle rules para eliminar após processamento |

---

## 8. Métricas de Sucesso

| Métrica | Valor Atual | Objetivo |
|---------|-------------|----------|
| Tipos de ficheiros suportados | 8 | 20+ |
| Limite de upload | 50MB | 200MB |
| Taxa sucesso OCR manuscrito | N/A | >85% |
| Taxa sucesso transcrição áudio | N/A | >90% |
| Ficheiros órfãos no Storage | ? | 0 |
| Tempo médio processamento | ? | <2min/ficheiro |

---

## 9. Dependências e Bibliotecas

### Novas Dependências (Functions)
```json
{
  "@google-cloud/speech": "^6.0.0"  // Apenas se usar Speech-to-Text
}
```

### Dependências Existentes (Suficientes)
- `@google/generative-ai` - Gemini para OCR e transcrição
- `firebase-admin` - Storage e Firestore
- `pdfjs-dist` - Extração de PDF (frontend)

---

## 10. Conclusão

Este plano propõe uma abordagem incremental:

1. **Primeiro:** Limpar o Storage e aumentar limite (quick wins)
2. **Segundo:** Expandir tipos de ficheiros (valor imediato)
3. **Terceiro:** Melhorar OCR (qualidade)
4. **Quarto:** Transcrição de áudio (feature avançada)

A transcrição de áudio via Gemini é surpreendentemente barata e viável para a maioria dos casos de uso. Para áudios longos ou quando alta precisão é necessária, Google Cloud Speech-to-Text oferece a melhor relação qualidade/preço no ecossistema Firebase.
