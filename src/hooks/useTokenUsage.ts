import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/database.types';

type TokenUsageByUser = Database['public']['Functions']['get_token_usage_by_user']['Returns'][0];
type TokenUsageByProject = Database['public']['Functions']['get_token_usage_by_project']['Returns'][0];
type DailyUsage = Database['public']['Functions']['get_daily_usage']['Returns'][0];
type TokenUsageSummary = Database['public']['Functions']['get_token_usage_summary']['Returns'][0];

interface UseTokenUsageOptions {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  autoFetch?: boolean;
}

export function useTokenUsage(options: UseTokenUsageOptions = {}) {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate = new Date(),
    userId,
    autoFetch = true,
  } = options;

  const [userUsage, setUserUsage] = useState<TokenUsageByUser[]>([]);
  const [projectUsage, setProjectUsage] = useState<TokenUsageByProject[]>([]);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [summary, setSummary] = useState<TokenUsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Fetch token usage by user
  const fetchUserUsage = async (start?: Date, end?: Date) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('get_token_usage_by_user', {
        start_date: (start || startDate).toISOString(),
        end_date: (end || endDate).toISOString(),
      });

      if (rpcError) throw rpcError;
      setUserUsage(data || []);
      return { data, error: null };
    } catch (err: any) {
      console.error('Error fetching user usage:', err);
      setError(err);
      return { data: null, error: err };
    } finally {
      setLoading(false);
    }
  };

  // Fetch token usage by project for a specific user
  const fetchProjectUsage = async (targetUserId: string, start?: Date, end?: Date) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('get_token_usage_by_project', {
        target_user_id: targetUserId,
        start_date: (start || startDate).toISOString(),
        end_date: (end || endDate).toISOString(),
      });

      if (rpcError) throw rpcError;
      setProjectUsage(data || []);
      return { data, error: null };
    } catch (err: any) {
      console.error('Error fetching project usage:', err);
      setError(err);
      return { data: null, error: err };
    } finally {
      setLoading(false);
    }
  };

  // Fetch daily usage for time series chart
  const fetchDailyUsage = async (start?: Date, end?: Date, targetUserId?: string) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('get_daily_usage', {
        start_date: (start || startDate).toISOString(),
        end_date: (end || endDate).toISOString(),
        target_user_id: targetUserId || null,
      });

      if (rpcError) throw rpcError;
      setDailyUsage(data || []);
      return { data, error: null };
    } catch (err: any) {
      console.error('Error fetching daily usage:', err);
      setError(err);
      return { data: null, error: err };
    } finally {
      setLoading(false);
    }
  };

  // Fetch summary statistics
  const fetchSummary = async (start?: Date, end?: Date) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('get_token_usage_summary', {
        start_date: (start || startDate).toISOString(),
        end_date: (end || endDate).toISOString(),
      });

      if (rpcError) throw rpcError;
      setSummary(data && data.length > 0 ? data[0] : null);
      return { data: data && data.length > 0 ? data[0] : null, error: null };
    } catch (err: any) {
      console.error('Error fetching summary:', err);
      setError(err);
      return { data: null, error: err };
    } finally {
      setLoading(false);
    }
  };

  // Fetch all data at once
  const fetchAll = async (start?: Date, end?: Date) => {
    try {
      setLoading(true);
      setError(null);

      const [userResult, dailyResult, summaryResult] = await Promise.all([
        fetchUserUsage(start, end),
        fetchDailyUsage(start, end),
        fetchSummary(start, end),
      ]);

      return {
        userUsage: userResult.data,
        dailyUsage: dailyResult.data,
        summary: summaryResult.data,
        error: userResult.error || dailyResult.error || summaryResult.error,
      };
    } catch (err: any) {
      console.error('Error fetching all token usage data:', err);
      setError(err);
      return { userUsage: null, dailyUsage: null, summary: null, error: err };
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (autoFetch) {
      fetchAll();
    }
  }, [startDate.toISOString(), endDate.toISOString(), userId]);

  return {
    // Data
    userUsage,
    projectUsage,
    dailyUsage,
    summary,

    // State
    loading,
    error,

    // Methods
    fetchUserUsage,
    fetchProjectUsage,
    fetchDailyUsage,
    fetchSummary,
    fetchAll,
  };
}

// Helper function to format cost in USD
export function formatCost(cost: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(cost);
}

// Helper function to format cost in BRL (Brazilian Real)
export function formatCostBRL(cost: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cost);
}

// Helper function to format tokens with thousands separator
export function formatTokens(tokens: number): string {
  return new Intl.NumberFormat('pt-BR').format(tokens);
}

// Helper function to get operation type label
export function getOperationLabel(operationType: string): string {
  const labels: Record<string, string> = {
    embedding: 'Embeddings',
    chat: 'Chat',
    quiz: 'Quiz',
    flashcard: 'Flashcards',
    summary: 'Resumos',
  };
  return labels[operationType] || operationType;
}
