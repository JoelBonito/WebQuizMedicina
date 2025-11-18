# 🚀 Plano de Implementação - WebQuizMedicina
## Sistema RAG Robusto com Embeddings e Batching Inteligente

---

## 📊 **Estado Atual**

### ✅ **Implementado (Phase 0 e 1)**
- ✅ Truncamento básico de input (3 PDFs, 40k chars)
- ✅ Batching básico para flashcards e quiz
- ✅ Validação robusta de resposta Gemini API
- ✅ Logs de debug para tamanho de prompt
- ✅ Tratamento de erros MAX_TOKENS, SAFETY, RECITATION

### ❌ **Problemas Identificados**
- ❌ **Input não otimizado**: Truncamento bruto perde contexto relevante
- ❌ **RAG primitivo**: Concatenação simples, sem busca semântica
- ❌ **Batching reativo**: Só limita após erro, não previne
- ❌ **Sem embeddings**: Não há busca por relevância
- ❌ **5+ PDFs falham**: Mesmo com 3 PDFs, conteúdo pode ser muito grande

---

## 🎯 **Objetivo Final**

Transformar o WebQuizMedicina em uma aplicação **sólida e escalável** com:

1. **RAG Semântico** - Busca inteligente com embeddings
2. **Batching Preventivo** - Regras que impedem erros antes de ocorrer
3. **Input Otimizado** - Apenas conteúdo relevante enviado ao LLM
4. **Output Confiável** - Resposta sempre completa, nunca truncada
5. **Monitoramento** - Logs e métricas para debugging

---

## 📋 **FASE 2: RAG Semântico com Embeddings**

### **2.1 - Arquitetura de Embeddings**

#### **Objetivo**
Substituir concatenação bruta por busca semântica inteligente usando Gemini Embeddings API.

#### **Como Funciona**

```
┌─────────────────────────────────────────────────────────────┐
│                     UPLOAD DE PDF                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
         ┌──────────────────────┐
         │  1. Extrair Texto    │
         │     (parse-pdf)      │
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  2. Chunking         │
         │  • 800 tokens/chunk  │
         │  • Overlap 100 tokens│
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  3. Generate         │
         │     Embeddings       │
         │  (Gemini API)        │
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  4. Store Vector DB  │
         │  (Supabase pgvector) │
         └──────────────────────┘
```

#### **Schema de Banco de Dados**

```sql
-- Nova tabela: source_chunks
CREATE TABLE source_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768), -- Gemini embedding dimension
  token_count INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca vetorial (HNSW é mais rápido que IVFFlat)
CREATE INDEX source_chunks_embedding_idx
ON source_chunks
USING hnsw (embedding vector_cosine_ops);

-- Índice para ordenação
CREATE INDEX source_chunks_source_idx
ON source_chunks(source_id, chunk_index);
```

#### **Arquivos a Criar**

**1. `supabase/functions/_shared/embeddings.ts`**

```typescript
const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
const CHUNK_SIZE_TOKENS = 800; // Safe limit
const CHUNK_OVERLAP_TOKENS = 100;

export interface Chunk {
  content: string;
  index: number;
  tokenCount: number;
}

export interface ChunkWithEmbedding extends Chunk {
  embedding: number[];
}

/**
 * Split text into chunks with overlap
 */
export function chunkText(text: string, chunkSize: number = CHUNK_SIZE_TOKENS): Chunk[] {
  // Rough estimate: 1 token ≈ 4 characters
  const chunkSizeChars = chunkSize * 4;
  const overlapChars = CHUNK_OVERLAP_TOKENS * 4;

  const chunks: Chunk[] = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSizeChars, text.length);
    const content = text.substring(startIndex, endIndex);

    chunks.push({
      content,
      index: chunkIndex++,
      tokenCount: Math.ceil(content.length / 4)
    });

    // Move with overlap
    startIndex += chunkSizeChars - overlapChars;
  }

  return chunks;
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: {
          parts: [{ text }]
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini Embedding API error: ${error}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

/**
 * Generate embeddings for multiple chunks (batched)
 */
export async function generateEmbeddings(chunks: Chunk[]): Promise<ChunkWithEmbedding[]> {
  console.log(`📊 [Embeddings] Generating embeddings for ${chunks.length} chunks...`);

  const chunksWithEmbeddings: ChunkWithEmbedding[] = [];

  // Process in batches of 10 to avoid rate limits
  const BATCH_SIZE = 10;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

    console.log(`🔄 [Embeddings] [${batchNum}/${totalBatches}] Processing batch...`);

    const embeddings = await Promise.all(
      batch.map(chunk => generateEmbedding(chunk.content))
    );

    batch.forEach((chunk, idx) => {
      chunksWithEmbeddings.push({
        ...chunk,
        embedding: embeddings[idx]
      });
    });

    console.log(`✅ [Embeddings] [${batchNum}/${totalBatches}] Batch complete`);
  }

  console.log(`✅ [Embeddings] All embeddings generated successfully`);
  return chunksWithEmbeddings;
}

/**
 * Semantic search using cosine similarity
 */
export async function semanticSearch(
  supabaseClient: any,
  query: string,
  sourceIds: string[],
  topK: number = 5
): Promise<Array<{ content: string; similarity: number; sourceId: string }>> {

  // Generate embedding for query
  console.log(`🔍 [Search] Generating query embedding...`);
  const queryEmbedding = await generateEmbedding(query);

  // Perform vector search
  console.log(`🔍 [Search] Searching top ${topK} relevant chunks from ${sourceIds.length} sources...`);

  const { data, error } = await supabaseClient.rpc('match_source_chunks', {
    query_embedding: queryEmbedding,
    source_ids: sourceIds,
    match_count: topK
  });

  if (error) {
    console.error('❌ [Search] Semantic search failed:', error);
    throw error;
  }

  console.log(`✅ [Search] Found ${data.length} relevant chunks`);
  return data;
}
```

**2. `supabase/migrations/YYYYMMDD_add_embeddings.sql`**

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create source_chunks table
CREATE TABLE source_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768),
  token_count INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX source_chunks_embedding_idx
ON source_chunks
USING hnsw (embedding vector_cosine_ops);

CREATE INDEX source_chunks_source_idx
ON source_chunks(source_id, chunk_index);

-- RPC function for semantic search
CREATE OR REPLACE FUNCTION match_source_chunks(
  query_embedding vector(768),
  source_ids UUID[],
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  content TEXT,
  similarity FLOAT,
  source_id UUID
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    source_chunks.content,
    1 - (source_chunks.embedding <=> query_embedding) AS similarity,
    source_chunks.source_id
  FROM source_chunks
  WHERE source_chunks.source_id = ANY(source_ids)
  ORDER BY source_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

**3. Nova Edge Function: `supabase/functions/generate-embeddings/index.ts`**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, createSuccessResponse, createErrorResponse } from '../_shared/security.ts';
import { chunkText, generateEmbeddings } from '../_shared/embeddings.ts';

serve(async (req) => {
  try {
    // Auth
    const authResult = await authenticateRequest(req);
    if (!authResult.authenticated || !authResult.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { source_id } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: req.headers.get('Authorization')! } }
      }
    );

    // Get source
    const { data: source, error: sourceError } = await supabaseClient
      .from('sources')
      .select('*')
      .eq('id', source_id)
      .single();

    if (sourceError || !source) {
      throw new Error('Source not found');
    }

    if (!source.extracted_content) {
      throw new Error('No content to embed');
    }

    console.log(`📄 [Embeddings] Processing source: ${source.name}`);

    // 1. Chunk text
    const chunks = chunkText(source.extracted_content);
    console.log(`📦 [Embeddings] Split into ${chunks.length} chunks`);

    // 2. Generate embeddings
    const chunksWithEmbeddings = await generateEmbeddings(chunks);

    // 3. Store in database
    const chunksToInsert = chunksWithEmbeddings.map(chunk => ({
      source_id: source.id,
      chunk_index: chunk.index,
      content: chunk.content,
      embedding: chunk.embedding,
      token_count: chunk.tokenCount
    }));

    const { error: insertError } = await supabaseClient
      .from('source_chunks')
      .insert(chunksToInsert);

    if (insertError) throw insertError;

    console.log(`✅ [Embeddings] Stored ${chunksWithEmbeddings.length} chunks with embeddings`);

    return createSuccessResponse({
      success: true,
      chunks_created: chunksWithEmbeddings.length
    });

  } catch (error) {
    return createErrorResponse(error as Error, 400);
  }
});
```

#### **Integração com Upload de PDFs**

Modificar `supabase/functions/process-pdf/index.ts` para gerar embeddings automaticamente:

```typescript
// Após extrair conteúdo e salvar na tabela sources...

// Trigger embedding generation (async)
console.log('🚀 Triggering embedding generation...');

await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-embeddings`, {
  method: 'POST',
  headers: {
    'Authorization': req.headers.get('Authorization')!,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ source_id: savedSource.id })
});
```

---

## 📋 **FASE 3: Batching Inteligente de Output**

### **3.1 - Arquivo Compartilhado: output-limits.ts**

**Criar: `supabase/functions/_shared/output-limits.ts`**

```typescript
/**
 * Output Limits and Batching Logic
 *
 * Prevents token overflow by calculating safe batch sizes
 * based on empirical token consumption per item type.
 */

export const OUTPUT_LIMITS = {
  // Estimated tokens per item (based on testing)
  TOKENS_PER_ITEM: {
    FLASHCARD: 290,
    QUIZ_MULTIPLE_CHOICE: 400,
    QUIZ_TRUE_FALSE: 300,
    QUIZ_CLINICAL_CASE: 700,
    SUMMARY_SECTION: 1500
  },

  // Gemini API limits
  GEMINI_MAX_OUTPUT_TOKENS: 8192,

  // Safe limit (80% of max for buffer)
  SAFE_OUTPUT_LIMIT: 6400
};

export interface ValidationResult {
  valid: boolean;
  needsBatching: boolean;
  estimatedTokens: number;
  warning?: string;
  error?: string;
}

/**
 * Validate if output request is safe
 */
export function validateOutputRequest(
  itemType: keyof typeof OUTPUT_LIMITS.TOKENS_PER_ITEM,
  count: number
): ValidationResult {

  const tokensPerItem = OUTPUT_LIMITS.TOKENS_PER_ITEM[itemType];
  const estimatedTokens = count * tokensPerItem;

  // Check if it fits in single batch
  if (estimatedTokens <= OUTPUT_LIMITS.SAFE_OUTPUT_LIMIT) {
    return {
      valid: true,
      needsBatching: false,
      estimatedTokens
    };
  }

  // Check if it's within reasonable total limit (max 5 batches)
  const maxItems = Math.floor((OUTPUT_LIMITS.SAFE_OUTPUT_LIMIT * 5) / tokensPerItem);

  if (count > maxItems) {
    return {
      valid: false,
      needsBatching: false,
      estimatedTokens,
      error: `Requested ${count} items exceeds maximum of ${maxItems} items. Please reduce the count.`
    };
  }

  // Needs batching
  return {
    valid: true,
    needsBatching: true,
    estimatedTokens,
    warning: `Requested ${count} items (~${estimatedTokens} tokens) exceeds safe limit. Will process in batches.`
  };
}

/**
 * Calculate optimal batch sizes
 */
export function calculateBatchSizes(
  itemType: keyof typeof OUTPUT_LIMITS.TOKENS_PER_ITEM,
  totalCount: number
): number[] {

  const tokensPerItem = OUTPUT_LIMITS.TOKENS_PER_ITEM[itemType];
  const itemsPerBatch = Math.floor(OUTPUT_LIMITS.SAFE_OUTPUT_LIMIT / tokensPerItem);

  const batches: number[] = [];
  let remaining = totalCount;

  while (remaining > 0) {
    const batchSize = Math.min(itemsPerBatch, remaining);
    batches.push(batchSize);
    remaining -= batchSize;
  }

  return batches;
}

/**
 * Format batch progress for logging
 */
export function formatBatchProgress(current: number, total: number): string {
  return `[Batch ${current}/${total}]`;
}

/**
 * Calculate summary strategy based on input size
 */
export function calculateSummaryStrategy(inputText: string): {
  strategy: 'SINGLE' | 'BATCHED' | 'EXECUTIVE';
  explanation: string;
  estimatedOutputTokens: number;
} {

  const inputChars = inputText.length;
  const inputTokens = Math.ceil(inputChars / 4);

  // Empirical: summary is ~15-20% of input
  const estimatedOutputTokens = Math.ceil(inputTokens * 0.18);

  if (estimatedOutputTokens <= OUTPUT_LIMITS.SAFE_OUTPUT_LIMIT) {
    return {
      strategy: 'SINGLE',
      estimatedOutputTokens,
      explanation: `Input: ${inputTokens} tokens → Estimated output: ${estimatedOutputTokens} tokens (fits in single request)`
    };
  }

  if (estimatedOutputTokens <= OUTPUT_LIMITS.SAFE_OUTPUT_LIMIT * 2) {
    return {
      strategy: 'BATCHED',
      estimatedOutputTokens,
      explanation: `Input: ${inputTokens} tokens → Estimated output: ${estimatedOutputTokens} tokens (needs 2-3 batches)`
    };
  }

  return {
    strategy: 'EXECUTIVE',
    estimatedOutputTokens,
    explanation: `Input: ${inputTokens} tokens → Output too large (${estimatedOutputTokens} tokens). Using executive summary strategy.`
  };
}
```

### **3.2 - Integrar em Todas as Edge Functions**

**Exemplo: `generate-flashcards/index.ts`**

```typescript
import { validateOutputRequest, calculateBatchSizes, formatBatchProgress, SAFE_OUTPUT_LIMIT } from '../_shared/output-limits.ts';

// ... após validação de entrada ...

// PHASE 1: Validate output request
const validation = validateOutputRequest('FLASHCARD', count);

if (!validation.valid) {
  return createErrorResponse(new Error(validation.error!), 400, req);
}

console.log(`📊 [PHASE 1] Flashcard generation: ${count} cards, estimated ${validation.estimatedTokens} tokens`);

if (validation.needsBatching) {
  console.warn(`⚠️ [PHASE 1] ${validation.warning}`);
}

const batchSizes = calculateBatchSizes('FLASHCARD', count);
const totalBatches = batchSizes.length;

console.log(`🔄 [PHASE 1] Processing in ${totalBatches} batch(es): ${batchSizes.join(', ')} flashcards each`);

// Generate flashcards in batches
const allFlashcards: any[] = [];

for (let i = 0; i < batchSizes.length; i++) {
  const batchCount = batchSizes[i];
  const batchNum = i + 1;

  console.log(`${formatBatchProgress(batchNum, totalBatches)} Generating ${batchCount} flashcards...`);

  const prompt = `... gere ${batchCount} flashcards ...`;
  const response = await callGemini(prompt, 'gemini-2.5-flash', SAFE_OUTPUT_LIMIT);
  const parsed = parseJsonFromResponse(response);

  allFlashcards.push(...parsed.flashcards);
  console.log(`✅ ${formatBatchProgress(batchNum, totalBatches)} Generated ${parsed.flashcards.length} flashcards`);
}

console.log(`✅ [PHASE 1] Total flashcards generated: ${allFlashcards.length}`);
```

---

## 📋 **FASE 4: RAG Semântico nas Edge Functions**

### **4.1 - Modificar Edge Functions para Usar Embeddings**

**Exemplo: `generate-flashcards/index.ts`**

```typescript
import { semanticSearch } from '../_shared/embeddings.ts';

// ... após obter sources ...

// Check if embeddings exist
const { data: chunksExist } = await supabaseClient
  .from('source_chunks')
  .select('id')
  .in('source_id', sources.map(s => s.id))
  .limit(1);

if (!chunksExist || chunksExist.length === 0) {
  // Fallback to old method (truncated concatenation)
  console.warn('⚠️ No embeddings found. Using fallback method.');
  // ... código antigo ...
} else {
  // Use semantic search
  console.log('✅ Using semantic search with embeddings');

  // Generate query based on task
  const query = `Criar flashcards sobre os principais conceitos médicos, terminologia, processos fisiológicos e patológicos`;

  // Get top 15 most relevant chunks (limit to fit in prompt)
  const relevantChunks = await semanticSearch(
    supabaseClient,
    query,
    sources.map(s => s.id),
    15 // top K
  );

  // Build context from relevant chunks
  const combinedContent = relevantChunks
    .map((chunk, idx) => `[Chunk ${idx + 1} - Relevância: ${(chunk.similarity * 100).toFixed(1)}%]\n${chunk.content}`)
    .join('\n\n---\n\n');

  console.log(`📊 Using ${relevantChunks.length} relevant chunks (avg similarity: ${(relevantChunks.reduce((sum, c) => sum + c.similarity, 0) / relevantChunks.length * 100).toFixed(1)}%)`);
}
```

---

## 📋 **FASE 5: Monitoramento e Observabilidade**

### **5.1 - Logs Estruturados**

**Criar: `supabase/functions/_shared/logger.ts`**

```typescript
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogContext {
  userId?: string;
  projectId?: string;
  sourceId?: string;
  functionName: string;
  [key: string]: any;
}

export class Logger {
  constructor(private context: LogContext) {}

  private log(level: LogLevel, message: string, data?: any) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...(data && { data })
    };

    console.log(JSON.stringify(logEntry));
  }

  debug(message: string, data?: any) {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: any) {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any) {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: Error, data?: any) {
    this.log(LogLevel.ERROR, message, {
      ...data,
      error: {
        message: error?.message,
        stack: error?.stack
      }
    });
  }
}
```

### **5.2 - Métricas de Performance**

**Adicionar em cada Edge Function:**

```typescript
const startTime = Date.now();

// ... processamento ...

const duration = Date.now() - startTime;
console.log(`⏱️ [Performance] Total duration: ${duration}ms`);
console.log(`📊 [Stats] Tokens used (est): ${estimatedTokens}`);
console.log(`📊 [Stats] Batches: ${totalBatches}`);
console.log(`📊 [Stats] Items generated: ${result.length}`);
```

---

## 📋 **Cronograma de Implementação**

| Fase | Tarefa | Duração | Prioridade |
|------|--------|---------|------------|
| **Phase 2.1** | Schema pgvector + migration | 1h | 🔴 CRÍTICA |
| **Phase 2.2** | `embeddings.ts` + semantic search | 3h | 🔴 CRÍTICA |
| **Phase 2.3** | `generate-embeddings` function | 2h | 🔴 CRÍTICA |
| **Phase 2.4** | Integrar com upload PDF | 1h | 🔴 CRÍTICA |
| **Phase 3.1** | `output-limits.ts` completo | 2h | 🔴 CRÍTICA |
| **Phase 3.2** | Integrar em flashcards | 1h | 🔴 CRÍTICA |
| **Phase 3.3** | Integrar em quiz | 1h | 🔴 CRÍTICA |
| **Phase 3.4** | Integrar em summary | 2h | 🔴 CRÍTICA |
| **Phase 4.1** | RAG semântico em flashcards | 2h | 🟡 ALTA |
| **Phase 4.2** | RAG semântico em quiz | 2h | 🟡 ALTA |
| **Phase 4.3** | RAG semântico em summary | 2h | 🟡 ALTA |
| **Phase 4.4** | RAG semântico em chat | 2h | 🟡 ALTA |
| **Phase 5.1** | Logger estruturado | 1h | 🟢 MÉDIA |
| **Phase 5.2** | Métricas de performance | 1h | 🟢 MÉDIA |
| **Phase 6** | Testes E2E | 4h | 🟡 ALTA |

**Total Estimado: ~27 horas (~3-4 dias de trabalho)**

---

## 🎯 **Priorização Recomendada**

### **Sprint 1 (Dia 1-2): Fundação**
1. ✅ Schema pgvector + migration
2. ✅ `embeddings.ts` completo
3. ✅ `output-limits.ts` completo
4. ✅ `generate-embeddings` function

### **Sprint 2 (Dia 2-3): Integração**
1. ✅ Integrar embeddings no upload
2. ✅ Integrar output-limits em todas functions
3. ✅ RAG semântico em flashcards e quiz

### **Sprint 3 (Dia 3-4): Refinamento**
1. ✅ RAG semântico em summary e chat
2. ✅ Logger estruturado
3. ✅ Testes E2E
4. ✅ Documentação

---

## 📊 **Resultados Esperados**

### **Antes (Phase 0-1)**
- ❌ 5 PDFs = erro
- ❌ Concatenação bruta
- ❌ Contexto irrelevante no prompt
- ❌ Batching reativo

### **Depois (Phase 2-3)**
- ✅ 10+ PDFs = funciona perfeitamente
- ✅ Busca semântica inteligente
- ✅ Apenas chunks relevantes
- ✅ Batching preventivo
- ✅ Zero truncamento
- ✅ Logs detalhados

---

## 🔍 **Perguntas para o Usuário**

Antes de começar a implementação, preciso confirmar:

1. **Supabase já tem pgvector habilitado?** (preciso checar?)
2. **Preferência de ordem?** (começar por embeddings ou batching?)
3. **Quer que eu implemente tudo ou você quer fazer partes manualmente?**
4. **Limite de custos Gemini API?** (embeddings custam ~$0.00025/1K tokens)

---

## 📝 **Próximos Passos**

Aguardando sua confirmação para começar. Recomendo:

**Opção A (Mais Seguro):**
1. Primeiro: Implementar `output-limits.ts` completo
2. Testar com 5 PDFs atuais
3. Depois: Implementar embeddings

**Opção B (Mais Impacto):**
1. Primeiro: Implementar embeddings
2. Testar busca semântica
3. Depois: Refinar batching

**Qual você prefere?** 🚀
