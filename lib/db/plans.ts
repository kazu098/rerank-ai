import { createSupabaseClient } from '@/lib/supabase';

import { Currency, StripePriceIds, ExchangeRates, convertPrice, getStripePriceId } from '@/lib/billing/currency';

export interface Plan {
  id: string;
  name: string;
  display_name: string;
  price_monthly: number; // 既存スキーマとの互換性のため残す（使用しない）
  base_currency: string | null; // 基準通貨（デフォルト: USD）
  base_price_usd: number | null; // USD基準の価格（セント単位）
  max_articles: number | null; // NULLは無制限
  max_analyses_per_month: number | null; // NULLは無制限
  max_sites: number | null; // NULLは無制限
  max_concurrent_analyses: number;
  max_article_suggestions_per_month: number | null; // NULLは無制限
  analysis_history_days: number | null; // NULLは無制限
  features: Record<string, any> | null;
  stripe_price_ids: StripePriceIds | null; // 各通貨ごとのStripe Price ID
  exchange_rates: ExchangeRates | null; // 固定為替レート
  created_at: string;
}

/**
 * プランの価格を指定通貨で取得
 */
export function getPlanPrice(plan: Plan, currency: Currency): number {
  if (plan.base_price_usd === null || plan.base_price_usd === undefined) {
    throw new Error(`Plan ${plan.name} does not have base_price_usd set`);
  }

  const exchangeRates = plan.exchange_rates || undefined;
  return convertPrice(plan.base_price_usd, currency, exchangeRates);
}

/**
 * プランのStripe Price IDを取得（通貨指定）
 */
export function getPlanStripePriceId(plan: Plan, currency: Currency): string | null {
  if (!plan.stripe_price_ids) {
    return null;
  }

  return getStripePriceId(plan.stripe_price_ids, currency);
}

/**
 * プラン名からプランを取得
 */
export async function getPlanByName(planName: string): Promise<Plan | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('name', planName)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get plan: ${error.message}`);
  }

  return data as Plan;
}

/**
 * プランIDからプランを取得
 */
export async function getPlanById(planId: string): Promise<Plan | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get plan: ${error.message}`);
  }

  return data as Plan;
}

/**
 * 全プランを取得
 */
export async function getAllPlans(): Promise<Plan[]> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .order('price_monthly', { ascending: true });

  if (error) {
    throw new Error(`Failed to get plans: ${error.message}`);
  }

  return (data || []) as Plan[];
}

/**
 * プランの制限をチェック
 */
export function checkPlanLimit(
  plan: Plan,
  limitType: 'articles' | 'analyses' | 'sites' | 'concurrent_analyses' | 'article_suggestions'
): number | null {
  switch (limitType) {
    case 'articles':
      return plan.max_articles;
    case 'analyses':
      return plan.max_analyses_per_month;
    case 'sites':
      return plan.max_sites;
    case 'concurrent_analyses':
      return plan.max_concurrent_analyses;
    case 'article_suggestions':
      return plan.max_article_suggestions_per_month;
    default:
      return null;
  }
}

/**
 * プランが制限を超えているかチェック
 */
export function isPlanLimitExceeded(
  plan: Plan,
  limitType: 'articles' | 'analyses' | 'sites' | 'concurrent_analyses' | 'article_suggestions',
  currentUsage: number
): boolean {
  const limit = checkPlanLimit(plan, limitType);
  
  // NULL（無制限）の場合はfalse
  if (limit === null) {
    return false;
  }

  return currentUsage >= limit;
}

