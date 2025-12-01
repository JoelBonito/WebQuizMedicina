import { useState, useEffect } from 'react';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// Define types based on expected return from Cloud Function
export interface TokenUsageByUser {
  user_id: string;
  display_name?: string;
  user_email?: string;
  total_tokens: number;
  total_cost: number;
  total_cost_brl?: number;
  operation_counts?: Record<string, number>;
  last_active?: string | null;
}

export interface TokenUsageByProject {
  project_id: string;
  project_name?: string;
  total_tokens: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cost: number;
  total_cost_brl?: number;
  operation_counts?: Record<string, number>;
}

export interface DailyUsage {
  date: string;
  total_tokens: number;
  total_cost: number;
  total_cost_brl?: number;
  unique_users?: number;
}

export interface TokenUsageSummary {
  total_tokens: number;
  total_cost: number;
  total_cost_brl?: number;
  total_requests: number;
  total_operations?: number;
  active_users?: number;
  avg_tokens_per_operation?: number;
  most_used_operation?: string;
}

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

  const callCloudFunction = async (action: string, params: any = {}) => {
    try {
      const getTokenUsageStatsFn = httpsCallable(functions, 'get_token_usage_stats');
      const result = await getTokenUsageStatsFn({
        action,
        start_date: (params.start || startDate).toISOString(),
        end_date: (params.end || endDate).toISOString(),
        ...params
      });
      return { data: result.data as any, error: null };
    } catch (err: any) {
      console.error(`Error calling get_token_usage_stats (${action}):`, err);
      return { data: null, error: err };
    }
  };

  // Fetch token usage by user
  const fetchUserUsage = async (start?: Date, end?: Date) => {
    setLoading(true);
    const { data, error } = await callCloudFunction('get_token_usage_by_user', { start, end });
    if (!error) setUserUsage(data || []);
    setError(error);
    setLoading(false);
    return { data, error };
  };

  // Fetch token usage by project for a specific user
  const fetchProjectUsage = async (targetUserId: string, start?: Date, end?: Date) => {
    setLoading(true);
    const { data, error } = await callCloudFunction('get_token_usage_by_project', { target_user_id: targetUserId, start, end });
    if (!error) setProjectUsage(data || []);
    setError(error);
    setLoading(false);
    return { data, error };
  };

  // Fetch daily usage for time series chart
  const fetchDailyUsage = async (start?: Date, end?: Date, targetUserId?: string) => {
    setLoading(true);
    const { data, error } = await callCloudFunction('get_daily_usage', { target_user_id: targetUserId, start, end });
    if (!error) setDailyUsage(data || []);
    setError(error);
    setLoading(false);
    return { data, error };
  };

  // Fetch summary statistics
  const fetchSummary = async (start?: Date, end?: Date) => {
    setLoading(true);
    const { data, error } = await callCloudFunction('get_token_usage_summary', { start, end });
    if (!error) setSummary(data || null);
    setError(error);
    setLoading(false);
    return { data, error };
  };

  // Fetch all data at once
  const fetchAll = async (start?: Date, end?: Date) => {
    setLoading(true);
    setError(null);
    try {
      const [userResult, dailyResult, summaryResult] = await Promise.all([
        callCloudFunction('get_token_usage_by_user', { start, end }),
        callCloudFunction('get_daily_usage', { start, end }),
        callCloudFunction('get_token_usage_summary', { start, end }),
      ]);

      setUserUsage(userResult.data || []);
      setDailyUsage(dailyResult.data || []);
      setSummary(summaryResult.data || null);

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
    userUsage,
    projectUsage,
    dailyUsage,
    summary,
    loading,
    error,
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
