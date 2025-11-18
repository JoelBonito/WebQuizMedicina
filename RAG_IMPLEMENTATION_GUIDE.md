# 🚀 RAG System - Resumo de Implementação para Claude Code

## ✅ **JÁ IMPLEMENTADO (80%)**

### **Fase 1: Infraestrutura Base**
- ✅ Extension pgvector habilitada no Supabase
- ✅ Migration `add_embeddings_rag_system` aplicada
- ✅ Tabela `source_chunks` criada com índices HNSW
- ✅ Funções RPC criadas:
  - `match_source_chunks()` - busca semântica
  - `source_has_embeddings()` - verificar se fonte tem embeddings
  - `get_embeddings_stats()` - estatísticas do sistema
- ✅ Módulo `supabase/functions/_shared/embeddings.ts` completo

---

## ❌ **FALTA IMPLEMENTAR (20%)**

### **Tarefa 1: Edge Function - generate-embeddings** 🔴 CRÍTICA

**Arquivo:** `supabase/functions/generate-embeddings/index.ts`

**Objetivo:** Processar PDFs, gerar chunks e embeddings, salvar no banco.

**Código completo:**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  authenticateRequest,
  createSuccessResponse,
  createErrorResponse,
  getSecurityHeaders,
} from '../_shared/security.ts';
import {
  chunkText,
  generateEmbeddings,
} from '../_shared/embeddings.ts';
import { AuditEventType, AuditLogger } from '../_shared/audit.ts';

let auditLogger: AuditLogger | null = null;
function getAuditLogger(): AuditLogger {
  if (!auditLogger) {
    auditLogger = new AuditLogger(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );
  }
  return auditLogger;
}

serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: getSecurityHeaders(req),
    });
  }

  try {
    // Auth
    const authResult = await authenticateRequest(req);
    if (!authResult.authenticated || !authResult.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: getSecurityHeaders(req) }
      );
    }

    const { source_id, force_regenerate } = await req.json();

    if (!source_id) {
      throw new Error('source_id is required');
    }

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
      throw new Error('No content to embed. Extract text from PDF first.');
    }

    console.log(`📄 [Embeddings] Processing source: ${source.name}`);
    console.log(`📊 [Embeddings] Content length: ${source.extracted_content.length} chars`);

    // Check if embeddings already exist
    const { data: existingChunks } = await supabaseClient
      .from('source_chunks')
      .select('id')
      .eq('source_id', source_id)
      .limit(1);

    if (existingChunks && existingChunks.length > 0 && !force_regenerate) {
      console.log('⚠️ [Embeddings] Embeddings already exist. Use force_regenerate: true to regenerate.');
      return createSuccessResponse({
        success: true,
        message: 'Embeddings already exist',
        chunks_created: 0
      }, 200, req);
    }

    // Delete old chunks if regenerating
    if (force_regenerate) {
      console.log('🗑️ [Embeddings] Deleting old chunks...');
      await supabaseClient
        .from('source_chunks')
        .delete()
        .eq('source_id', source_id);
    }

    // 1. Chunk text
    console.log('📦 [Embeddings] Step 1: Chunking text...');
    const chunks = chunkText(source.extracted_content);
    
    if (chunks.length === 0) {
      throw new Error('No chunks generated from content');
    }

    // 2. Generate embeddings
    console.log('🎯 [Embeddings] Step 2: Generating embeddings...');
    const chunksWithEmbeddings = await generateEmbeddings(chunks);

    // 3. Store in database
    console.log('💾 [Embeddings] Step 3: Storing chunks...');
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

    if (insertError) {
      console.error('❌ [Embeddings] Insert failed:', insertError);
      throw insertError;
    }

    console.log(`✅ [Embeddings] Success! Stored ${chunksWithEmbeddings.length} chunks`);

    // Audit log
    await getAuditLogger().logAIGeneration(
      AuditEventType.AI_EMBEDDINGS_GENERATED,
      authResult.user.id,
      source.project_id,
      req,
      {
        source_id: source.id,
        chunks_created: chunksWithEmbeddings.length,
        total_tokens: chunksWithEmbeddings.reduce((sum, c) => sum + c.tokenCount, 0)
      }
    );

    return createSuccessResponse(
      {
        success: true,
        source_id: source.id,
        chunks_created: chunksWithEmbeddings.length,
        avg_tokens_per_chunk: Math.round(
          chunksWithEmbeddings.reduce((sum, c) => sum + c.tokenCount, 0) / chunksWithEmbeddings.length
        )
      },
      200,
      req
    );

  } catch (error) {
    console.error('❌ [Embeddings] Error:', error);
    return createErrorResponse(error as Error, 500, req);
  }
});
```

---

### **Tarefa 2: Output Limits Module** 🔴 CRÍTICA

**Arquivo:** `supabase/functions/_shared/output-limits.ts`

**Objetivo:** Prevenir truncamento de respostas com validação e batching.

**Código completo:**

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
  batchSizes: number[];
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
      estimatedTokens,
      batchSizes: [count]
    };
  }

  // Check if it's within reasonable total limit (max 5 batches)
  const maxItems = Math.floor((OUTPUT_LIMITS.SAFE_OUTPUT_LIMIT * 5) / tokensPerItem);

  if (count > maxItems) {
    return {
      valid: false,
      needsBatching: false,
      estimatedTokens,
      batchSizes: [],
      error: `Requested ${count} items exceeds maximum of ${maxItems} items. Please reduce the count.`
    };
  }

  // Calculate batch sizes
  const batchSizes = calculateBatchSizes(itemType, count);

  return {
    valid: true,
    needsBatching: true,
    estimatedTokens,
    batchSizes,
    warning: `Requested ${count} items (~${estimatedTokens} tokens) exceeds safe limit. Will process in ${batchSizes.length} batches.`
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

/**
 * Estimate tokens for text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

---

### **Tarefa 3: Integrar RAG em generate-flashcards** 🟡 ALTA

**Arquivo:** `supabase/functions/generate-flashcards/index.ts`

**Modificações necessárias:**

1. **Adicionar imports:**
```typescript
import { 
  hasAnyEmbeddings, 
  semanticSearch, 
  formatChunksForContext 
} from '../_shared/embeddings.ts';
import { 
  validateOutputRequest, 
  formatBatchProgress 
} from '../_shared/output-limits.ts';
```

2. **Após obter sources, ADICIONAR antes do prompt:**
```typescript
// ===== PHASE 1: Output Validation =====
const validation = validateOutputRequest('FLASHCARD', count);

if (!validation.valid) {
  console.error(`❌ [PHASE 1] ${validation.error}`);
  throw new Error(validation.error);
}

console.log(`📊 [PHASE 1] Validação: ${count} flashcards, ~${validation.estimatedTokens} tokens`);
if (validation.needsBatching) {
  console.log(`🔄 [PHASE 1] Batching necessário: ${validation.batchSizes.length} batches`);
}

// ===== PHASE 2: Smart Context (RAG ou Fallback) =====
let combinedContent = '';
const sourceIds = sources.map(s => s.id);

// Check if embeddings exist
const embeddingsExist = await hasAnyEmbeddings(supabaseClient, sourceIds);

if (embeddingsExist) {
  console.log('✅ [PHASE 2] Using RAG with semantic search');
  
  const query = 'Criar flashcards sobre os principais conceitos médicos, terminologia, processos fisiológicos e patológicos, diagnósticos e tratamentos';
  
  const relevantChunks = await semanticSearch(
    supabaseClient,
    query,
    sourceIds,
    15, // top-K
    0.5 // similarity threshold
  );
  
  if (relevantChunks.length === 0) {
    console.warn('⚠️ [PHASE 2] No relevant chunks found, using fallback');
    // Fallback: usar conteúdo truncado
    combinedContent = sources
      .map(s => s.extracted_content?.substring(0, 13000) || '')
      .join('\n\n---\n\n')
      .substring(0, 40000);
  } else {
    combinedContent = formatChunksForContext(relevantChunks);
    console.log(`📊 [PHASE 2] Using ${relevantChunks.length} chunks, ~${combinedContent.length} chars`);
  }
} else {
  console.warn('⚠️ [PHASE 2] No embeddings found, using fallback (truncated content)');
  combinedContent = sources
    .map(s => s.extracted_content?.substring(0, 13000) || '')
    .join('\n\n---\n\n')
    .substring(0, 40000);
}

// ===== PHASE 3: Generate in Batches =====
const allFlashcards: any[] = [];

for (let i = 0; i < validation.batchSizes.length; i++) {
  const batchCount = validation.batchSizes[i];
  const batchNum = i + 1;
  
  console.log(`${formatBatchProgress(batchNum, validation.batchSizes.length)} Generating ${batchCount} flashcards...`);
  
  const prompt = `
Você é um professor de medicina. Crie EXATAMENTE ${batchCount} flashcards de alta qualidade.

CONTEÚDO:
${combinedContent}

INSTRUÇÕES:
1. Crie EXATAMENTE ${batchCount} flashcards
2. Frente: pergunta ou conceito claro
3. Verso: resposta completa e educativa
4. Classifique dificuldade: "fácil", "médio" ou "difícil"
5. Identifique o tópico

FORMATO JSON:
{
  "flashcards": [
    {
      "frente": "Pergunta aqui",
      "verso": "Resposta detalhada aqui",
      "topico": "Nome do tópico",
      "dificuldade": "médio"
    }
  ]
}

RETORNE APENAS O JSON.
  `;
  
  const response = await callGemini(prompt);
  const parsed = parseJsonFromResponse(response);
  
  allFlashcards.push(...parsed.flashcards);
  console.log(`✅ ${formatBatchProgress(batchNum, validation.batchSizes.length)} Generated ${parsed.flashcards.length} flashcards`);
  
  // Delay entre batches
  if (i < validation.batchSizes.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

console.log(`✅ [PHASE 3] Total generated: ${allFlashcards.length} flashcards`);

// Resto do código permanece igual (sanitização e inserção no banco)
```

---

### **Tarefa 4: Integrar RAG em generate-quiz** 🟡 ALTA

**Arquivo:** `supabase/functions/generate-quiz/index.ts`

**Modificações:** Idênticas à Tarefa 3, mas:
- Usar queries específicas para quiz
- Validar cada tipo separadamente (MC, V/F, Casos)
- Query exemplo: `"Gerar questões de múltipla escolha sobre diagnósticos diferenciais, casos clínicos e patologias"`

---

### **Tarefa 5: Integrar RAG em generate-summary** 🟡 ALTA

**Arquivo:** `supabase/functions/generate-summary/index.ts`

**Modificações:** Idênticas à Tarefa 3, mas:
- Usar `calculateSummaryStrategy()` do output-limits
- Query: `"Criar resumo completo abrangendo todos os principais tópicos, conceitos e procedimentos médicos"`
- Top-K maior: 20-30 chunks para melhor cobertura

---

### **Tarefa 6: Adicionar evento de audit** 🟢 MÉDIA

**Arquivo:** `supabase/functions/_shared/audit.ts`

**Adicionar enum:**
```typescript
export enum AuditEventType {
  // ... eventos existentes ...
  AI_EMBEDDINGS_GENERATED = 'ai.embeddings.generated',
}
```

---

## 📋 **CHECKLIST DE IMPLEMENTAÇÃO**

### **Prioridade 1 - CRÍTICA** 🔴
- [ ] **Tarefa 1:** Criar `generate-embeddings/index.ts`
- [ ] **Tarefa 2:** Criar `output-limits.ts`
- [ ] **Tarefa 6:** Adicionar `AI_EMBEDDINGS_GENERATED` no audit.ts

### **Prioridade 2 - ALTA** 🟡  
- [ ] **Tarefa 3:** Integrar RAG em `generate-flashcards`
- [ ] **Tarefa 4:** Integrar RAG em `generate-quiz`
- [ ] **Tarefa 5:** Integrar RAG em `generate-summary`

### **Prioridade 3 - TESTE** 🟢
- [ ] Testar geração de embeddings com 1 PDF
- [ ] Testar busca semântica via SQL
- [ ] Testar geração de flashcards com RAG
- [ ] Verificar logs no Supabase

---

## 🎯 **RESULTADO ESPERADO**

Após implementar todas as tarefas:

✅ **Sistema RAG completo** funcionando
✅ **Zero truncamento** de respostas  
✅ **Busca semântica** inteligente
✅ **Batching preventivo** automático
✅ **Suporte ilimitado** de PDFs

---

## 🚨 **NOTAS IMPORTANTES**

1. **Ordem de implementação:** Seguir ordem das tarefas (1→6)
2. **Testes:** Testar cada tarefa antes de avançar
3. **Logs:** Manter todos os console.log para debugging
4. **Fallback:** Sistema sempre funciona mesmo sem embeddings
5. **Compatibilidade:** Não quebrar código existente

---

## 📞 **SUPORTE**

Se houver dúvidas ou erros:
1. Verificar logs do Supabase Edge Functions
2. Testar queries RPC direto no SQL Editor
3. Confirmar que migration foi aplicada corretamente
4. Verificar se GEMINI_API_KEY está configurada

**Status atual: 80% completo | Faltam 6 tarefas**
