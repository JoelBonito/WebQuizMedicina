import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  authenticateRequest,
  createSuccessResponse,
  createErrorResponse,
  getSecurityHeaders
} from '../_shared/security.ts';
import {
  chunkText,
  generateEmbeddings,
  deleteEmbeddings,
  hasEmbeddings
} from '../_shared/embeddings.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';

// Lazy-initialize AuditLogger
let auditLogger: AuditLogger | null = null;
function getAuditLogger(): AuditLogger {
  if (!auditLogger) {
    auditLogger = new AuditLogger(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
  }
  return auditLogger;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: getSecurityHeaders(req)
    });
  }

  try {
    const startTime = Date.now();

    // 1. Authentication
    const authResult = await authenticateRequest(req);
    if (!authResult.authenticated || !authResult.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: {
            ...getSecurityHeaders(req),
            'Content-Type': 'application/json'
          }
        }
      );
    }

    const user = authResult.user;

    // 2. Parse request
    const { source_id, force_regenerate } = await req.json();

    if (!source_id) {
      throw new Error('source_id is required');
    }

    // 3. Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! }
        }
      }
    );

    // 4. Get source and verify ownership
    const { data: source, error: sourceError } = await supabaseClient
      .from('sources')
      .select('*')
      .eq('id', source_id)
      .eq('user_id', user.id)
      .single();

    if (sourceError || !source) {
      throw new Error('Source not found or unauthorized');
    }

    if (!source.extracted_content) {
      throw new Error('No content to embed. Please process the source first.');
    }

    console.log(`📄 [Embeddings] Processing source: "${source.name}" (${source.id})`);
    console.log(`📊 [Embeddings] Content length: ${source.extracted_content.length} characters`);

    // 5. Check if embeddings already exist
    const hasExisting = await hasEmbeddings(supabaseClient, source_id);

    if (hasExisting && !force_regenerate) {
      console.log(`⚠️ [Embeddings] Embeddings already exist. Use force_regenerate=true to regenerate.`);
      return createSuccessResponse({
        success: true,
        message: 'Embeddings already exist',
        source_id,
        force_regenerate: false
      }, 200, req);
    }

    // 6. Delete existing embeddings if regenerating
    if (hasExisting && force_regenerate) {
      console.log(`🗑️ [Embeddings] Deleting existing embeddings...`);
      await deleteEmbeddings(supabaseClient, source_id);
    }

    // 7. Chunk the text
    console.log(`📦 [Embeddings] Chunking text...`);
    const chunks = chunkText(source.extracted_content);
    console.log(`✅ [Embeddings] Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      throw new Error('No chunks created. Content may be too short.');
    }

    // 8. Generate embeddings for all chunks
    const chunksWithEmbeddings = await generateEmbeddings(chunks);

    // 9. Store chunks in database
    console.log(`💾 [Embeddings] Storing chunks in database...`);

    const chunksToInsert = chunksWithEmbeddings.map(chunk => ({
      source_id: source.id,
      chunk_index: chunk.index,
      content: chunk.content,
      embedding: chunk.embedding,
      token_count: chunk.tokenCount
    }));

    const { error: insertError, count } = await supabaseClient
      .from('source_chunks')
      .insert(chunksToInsert);

    if (insertError) {
      console.error('❌ [Embeddings] Error inserting chunks:', insertError);
      throw new Error(`Failed to store embeddings: ${insertError.message}`);
    }

    console.log(`✅ [Embeddings] Stored ${count} chunks successfully`);

    // 10. Calculate stats
    const duration = Date.now() - startTime;
    const avgTokensPerChunk = Math.round(
      chunksWithEmbeddings.reduce((sum, c) => sum + c.tokenCount, 0) / chunksWithEmbeddings.length
    );

    console.log(`⏱️ [Performance] Total duration: ${duration}ms`);
    console.log(`📊 [Stats] Chunks: ${chunksWithEmbeddings.length}`);
    console.log(`📊 [Stats] Avg tokens/chunk: ${avgTokensPerChunk}`);

    // 11. Audit log
    await getAuditLogger().logAIGeneration(
      AuditEventType.AI_EMBEDDINGS_GENERATED,
      user.id,
      source.project_id,
      req,
      {
        source_id,
        chunks_created: chunksWithEmbeddings.length,
        total_tokens: chunksWithEmbeddings.reduce((sum, c) => sum + c.tokenCount, 0),
        duration_ms: duration
      }
    );

    return createSuccessResponse({
      success: true,
      source_id,
      chunks_created: chunksWithEmbeddings.length,
      avg_tokens_per_chunk: avgTokensPerChunk,
      duration_ms: duration
    }, 200, req);

  } catch (error) {
    console.error('❌ [Embeddings] Error:', error);
    return createErrorResponse(error as Error, 400, req);
  }
});
