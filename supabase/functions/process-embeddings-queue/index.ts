import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import {
  createSuccessResponse,
  createErrorResponse,
  getSecurityHeaders
} from '../_shared/security.ts';
import {
  chunkText,
  generateEmbeddings,
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

/**
 * Process Embeddings Queue
 *
 * Automatically processes sources that have status='pending' for embeddings generation.
 * Can be triggered by:
 * - Database webhook (when source.extracted_content is added)
 * - Cron job (periodic processing)
 * - Manual API call
 *
 * Process:
 * 1. Get pending sources from queue
 * 2. For each source: chunk → embed → store
 * 3. Update status (completed/failed)
 */

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

    // Parse request (optional parameters)
    const body = await req.json().catch(() => ({}));
    const {
      max_items = 10,        // How many sources to process in one run
      source_id = null,      // Process specific source (for webhook trigger)
    } = body;

    console.log(`🚀 [Queue] Starting embeddings queue processor`);
    console.log(`📋 [Queue] Max items: ${max_items}, Specific source: ${source_id || 'none'}`);

    // Initialize Supabase client with SERVICE_ROLE key for admin access
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let sourcesToProcess: any[] = [];

    if (source_id) {
      // Process specific source (triggered by webhook)
      const { data, error } = await supabaseClient
        .from('sources')
        .select('id, name, project_id, extracted_content, embeddings_status')
        .eq('id', source_id)
        .eq('embeddings_status', 'pending')
        .single();

      if (error) {
        console.warn(`⚠️ [Queue] Source ${source_id} not found or not pending`);
      } else {
        sourcesToProcess = [data];
      }
    } else {
      // Get pending queue
      const { data, error } = await supabaseClient.rpc('get_pending_embeddings_queue', {
        max_items
      });

      if (error) {
        throw new Error(`Failed to get queue: ${error.message}`);
      }

      sourcesToProcess = data || [];
    }

    if (sourcesToProcess.length === 0) {
      console.log('✅ [Queue] No sources pending embeddings generation');
      return createSuccessResponse({
        success: true,
        message: 'Queue is empty',
        processed: 0,
        failed: 0
      }, 200, req);
    }

    console.log(`📊 [Queue] Found ${sourcesToProcess.length} sources to process`);

    // Process each source
    const results = {
      processed: 0,
      failed: 0,
      details: [] as any[]
    };

    for (const source of sourcesToProcess) {
      const sourceStartTime = Date.now();
      console.log(`\n📄 [Queue] Processing source: ${source.source_name} (${source.source_id})`);

      try {
        // 1. Mark as processing
        await supabaseClient.rpc('mark_embeddings_processing', {
          source_uuid: source.source_id
        });

        // 2. Get full source data
        const { data: fullSource, error: sourceError } = await supabaseClient
          .from('sources')
          .select('*')
          .eq('id', source.source_id)
          .single();

        if (sourceError || !fullSource) {
          throw new Error('Source not found');
        }

        if (!fullSource.extracted_content) {
          throw new Error('No content to embed');
        }

        // 3. Check if embeddings already exist
        const { data: existingChunks } = await supabaseClient
          .from('source_chunks')
          .select('id')
          .eq('source_id', source.source_id)
          .limit(1);

        if (existingChunks && existingChunks.length > 0) {
          console.log(`⚠️ [Queue] Embeddings already exist, marking as completed`);
          await supabaseClient.rpc('mark_embeddings_completed', {
            source_uuid: source.source_id,
            chunks_created: 0
          });
          results.processed++;
          continue;
        }

        // 4. Chunk the text
        console.log(`📦 [Queue] Chunking text (${fullSource.extracted_content.length} chars)...`);
        const chunks = chunkText(fullSource.extracted_content);
        console.log(`✅ [Queue] Created ${chunks.length} chunks`);

        if (chunks.length === 0) {
          throw new Error('No chunks created. Content may be too short.');
        }

        // 5. Generate embeddings
        console.log(`🎯 [Queue] Generating embeddings...`);
        const chunksWithEmbeddings = await generateEmbeddings(chunks);

        // 6. Store in database
        console.log(`💾 [Queue] Storing ${chunksWithEmbeddings.length} chunks...`);
        const chunksToInsert = chunksWithEmbeddings.map(chunk => ({
          source_id: source.source_id,
          chunk_index: chunk.index,
          content: chunk.content,
          embedding: chunk.embedding,
          token_count: chunk.tokenCount
        }));

        const { error: insertError } = await supabaseClient
          .from('source_chunks')
          .insert(chunksToInsert);

        if (insertError) {
          throw new Error(`Failed to store embeddings: ${insertError.message}`);
        }

        // 7. Mark as completed
        await supabaseClient.rpc('mark_embeddings_completed', {
          source_uuid: source.source_id,
          chunks_created: chunksWithEmbeddings.length
        });

        const duration = Date.now() - sourceStartTime;
        const avgTokens = Math.round(
          chunksWithEmbeddings.reduce((sum, c) => sum + c.tokenCount, 0) / chunksWithEmbeddings.length
        );

        console.log(`✅ [Queue] Successfully processed "${source.source_name}"`);
        console.log(`   └─ Chunks: ${chunksWithEmbeddings.length}, Avg tokens: ${avgTokens}, Duration: ${duration}ms`);

        // 8. Audit log
        try {
          await getAuditLogger().logAIGeneration(
            AuditEventType.AI_EMBEDDINGS_GENERATED,
            'system', // System user for auto-processing
            fullSource.project_id,
            req,
            {
              source_id: source.source_id,
              chunks_created: chunksWithEmbeddings.length,
              total_tokens: chunksWithEmbeddings.reduce((sum, c) => sum + c.tokenCount, 0),
              duration_ms: duration,
              auto_processed: true
            }
          );
        } catch (auditError) {
          console.warn('⚠️ [Queue] Audit logging failed:', auditError);
          // Don't fail the whole process for audit errors
        }

        results.processed++;
        results.details.push({
          source_id: source.source_id,
          source_name: source.source_name,
          status: 'success',
          chunks_created: chunksWithEmbeddings.length,
          duration_ms: duration
        });

      } catch (error) {
        console.error(`❌ [Queue] Failed to process source ${source.source_id}:`, error);

        // Mark as failed
        await supabaseClient.rpc('mark_embeddings_failed', {
          source_uuid: source.source_id,
          error_message: error.message
        });

        results.failed++;
        results.details.push({
          source_id: source.source_id,
          source_name: source.source_name,
          status: 'failed',
          error: error.message
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`\n🏁 [Queue] Processing complete`);
    console.log(`   └─ Processed: ${results.processed}, Failed: ${results.failed}, Duration: ${totalDuration}ms`);

    return createSuccessResponse({
      success: true,
      processed: results.processed,
      failed: results.failed,
      total_duration_ms: totalDuration,
      details: results.details
    }, 200, req);

  } catch (error) {
    console.error('❌ [Queue] Error:', error);
    return createErrorResponse(error as Error, 500, req);
  }
});
