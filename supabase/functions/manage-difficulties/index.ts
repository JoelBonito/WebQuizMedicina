import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  authenticateRequest,
  checkRateLimit,
  createSuccessResponse,
  RATE_LIMITS,
} from "../_shared/security.ts";
import { sanitizeString } from "../_shared/validation.ts";
import {
  getDifficultyProgress,
  getDifficultyStatistics,
  manuallyResolveDifficulty,
  checkAutoResolveDifficulty,
  normalizeDifficultyTopic
} from "../_shared/difficulty-helpers.ts";

// Configuração CORS
const ALLOWED_ORIGINS = [
  "https://web-quiz-medicina.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "*"
];

function getCorsHeadersForPreflight(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-requested-with",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: getCorsHeadersForPreflight(req) });
  }

  try {
    // Rate Limit
    const rateLimitResult = await checkRateLimit(req, RATE_LIMITS.API_CALL);
    if (!rateLimitResult.allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
        status: 429,
        headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
      });
    }

    // Auth
    const authResult = await authenticateRequest(req);
    if (!authResult.authenticated || !authResult.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
      });
    }
    const user = authResult.user;

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    // Parse request body
    const body = await req.json();
    const { action, project_id, difficulty_id, topic, correct } = body;

    console.log(`📊 [Manage Difficulties] Action: ${action}, User: ${user.id}`);

    // Route based on action
    switch (action) {
      case "list": {
        // List all difficulties for a project
        if (!project_id) {
          return new Response(JSON.stringify({ error: "project_id required" }), {
            status: 400,
            headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
          });
        }

        const difficulties = await getDifficultyProgress(supabaseClient, user.id, project_id);

        return createSuccessResponse(
          {
            difficulties,
            total: difficulties.length,
            resolved: difficulties.filter((d: any) => d.resolvido).length,
            unresolved: difficulties.filter((d: any) => !d.resolvido).length
          },
          getCorsHeadersForPreflight(req)
        );
      }

      case "statistics": {
        // Get difficulty statistics
        const stats = await getDifficultyStatistics(supabaseClient, user.id, project_id);

        return createSuccessResponse(stats, getCorsHeadersForPreflight(req));
      }

      case "resolve": {
        // Manually resolve a difficulty
        if (!difficulty_id) {
          return new Response(JSON.stringify({ error: "difficulty_id required" }), {
            status: 400,
            headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
          });
        }

        // Verify ownership
        const { data: difficulty } = await supabaseClient
          .from('difficulties')
          .select('user_id')
          .eq('id', difficulty_id)
          .single();

        if (!difficulty || difficulty.user_id !== user.id) {
          return new Response(JSON.stringify({ error: "Difficulty not found or unauthorized" }), {
            status: 404,
            headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
          });
        }

        const success = await manuallyResolveDifficulty(supabaseClient, difficulty_id);

        return createSuccessResponse(
          { success, message: success ? "Difficulty resolved" : "Failed to resolve" },
          getCorsHeadersForPreflight(req)
        );
      }

      case "check_auto_resolve": {
        // Check and potentially auto-resolve a difficulty
        if (!project_id || !topic || correct === undefined) {
          return new Response(
            JSON.stringify({ error: "project_id, topic, and correct required" }),
            {
              status: 400,
              headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
            }
          );
        }

        // Normalize topic first
        const normalizedTopic = await normalizeDifficultyTopic(supabaseClient, topic);

        const result = await checkAutoResolveDifficulty(
          supabaseClient,
          user.id,
          project_id,
          normalizedTopic,
          correct
        );

        return createSuccessResponse(result, getCorsHeadersForPreflight(req));
      }

      case "normalize_topic": {
        // Normalize a topic using taxonomy
        if (!topic) {
          return new Response(JSON.stringify({ error: "topic required" }), {
            status: 400,
            headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
          });
        }

        const normalized = await normalizeDifficultyTopic(supabaseClient, topic);

        return createSuccessResponse(
          {
            original: topic,
            normalized,
            changed: normalized !== topic
          },
          getCorsHeadersForPreflight(req)
        );
      }

      default: {
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          {
            status: 400,
            headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
          }
        );
      }
    }

  } catch (error: any) {
    console.error("❌ [Manage Difficulties] Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
      }
    );
  }
});
