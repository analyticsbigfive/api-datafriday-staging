// Supabase Edge Function for heavy data processing
// Deploy with: supabase functions deploy heavy-processing

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessingRequest {
  tenantId: string;
  operation: 'sync' | 'analytics' | 'export' | 'report' | 'aggregation';
  estimatedItems?: number;
  params?: Record<string, any>;
}

interface ProcessingResult {
  success: boolean;
  tenantId: string;
  operation: string;
  processedItems: number;
  duration: number;
  data?: any;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = performance.now();

  try {
    // Validate authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: ProcessingRequest = await req.json();
    const { tenantId, operation, estimatedItems = 0, params = {} } = body;

    if (!tenantId || !operation) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tenantId and operation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Edge] Processing ${operation} for tenant ${tenantId} (${estimatedItems} items)`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let result: ProcessingResult;

    switch (operation) {
      case 'aggregation':
        result = await processAggregation(supabase, tenantId, params);
        break;
      case 'analytics':
        result = await processAnalytics(supabase, tenantId, params);
        break;
      case 'export':
        result = await processExport(supabase, tenantId, params);
        break;
      case 'sync':
        result = await processSync(supabase, tenantId, params);
        break;
      default:
        result = {
          success: false,
          tenantId,
          operation,
          processedItems: 0,
          duration: performance.now() - startTime,
          error: `Unknown operation: ${operation}`,
        };
    }

    result.duration = performance.now() - startTime;

    console.log(`[Edge] Completed ${operation} in ${result.duration.toFixed(2)}ms`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Edge] Error:', error.message);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        duration: performance.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Heavy aggregation processing
 * Used for large dataset analytics that would block the API
 */
async function processAggregation(
  supabase: any,
  tenantId: string,
  params: Record<string, any>
): Promise<ProcessingResult> {
  const { startDate, endDate, groupBy = 'day' } = params;

  // Example: Aggregate sales data
  const { data, error, count } = await supabase
    .from('fnb_sales')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .gte('sale_date', startDate || '2020-01-01')
    .lte('sale_date', endDate || new Date().toISOString());

  if (error) {
    return {
      success: false,
      tenantId,
      operation: 'aggregation',
      processedItems: 0,
      duration: 0,
      error: error.message,
    };
  }

  // Perform CPU-intensive aggregation
  const aggregated = aggregateData(data || [], groupBy);

  return {
    success: true,
    tenantId,
    operation: 'aggregation',
    processedItems: count || 0,
    duration: 0,
    data: aggregated,
  };
}

/**
 * Analytics computation
 */
async function processAnalytics(
  supabase: any,
  tenantId: string,
  params: Record<string, any>
): Promise<ProcessingResult> {
  const { metrics = ['revenue', 'transactions'] } = params;

  const results: Record<string, any> = {};

  for (const metric of metrics) {
    switch (metric) {
      case 'revenue':
        const { data: revenueData } = await supabase
          .rpc('calculate_total_revenue', { p_tenant_id: tenantId });
        results.revenue = revenueData;
        break;
      case 'transactions':
        const { count } = await supabase
          .from('fnb_sales')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId);
        results.transactions = count;
        break;
    }
  }

  return {
    success: true,
    tenantId,
    operation: 'analytics',
    processedItems: Object.keys(results).length,
    duration: 0,
    data: results,
  };
}

/**
 * Export processing
 */
async function processExport(
  supabase: any,
  tenantId: string,
  params: Record<string, any>
): Promise<ProcessingResult> {
  const { format = 'json', table = 'fnb_sales' } = params;

  const { data, error, count } = await supabase
    .from(table)
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .limit(100000); // Max 100k records per export

  if (error) {
    return {
      success: false,
      tenantId,
      operation: 'export',
      processedItems: 0,
      duration: 0,
      error: error.message,
    };
  }

  return {
    success: true,
    tenantId,
    operation: 'export',
    processedItems: count || 0,
    duration: 0,
    data: { format, recordCount: data?.length || 0 },
  };
}

/**
 * Data sync processing
 */
async function processSync(
  supabase: any,
  tenantId: string,
  params: Record<string, any>
): Promise<ProcessingResult> {
  // This would integrate with external APIs like Weezevent
  // For now, return a placeholder
  return {
    success: true,
    tenantId,
    operation: 'sync',
    processedItems: 0,
    duration: 0,
    data: { status: 'sync_completed' },
  };
}

/**
 * CPU-intensive aggregation helper
 */
function aggregateData(data: any[], groupBy: string): Record<string, any> {
  const grouped: Record<string, { total: number; count: number; items: any[] }> = {};

  for (const item of data) {
    const key = getGroupKey(item, groupBy);
    
    if (!grouped[key]) {
      grouped[key] = { total: 0, count: 0, items: [] };
    }

    grouped[key].total += item.amount || 0;
    grouped[key].count += 1;
    // Don't store items for large datasets
    if (grouped[key].items.length < 10) {
      grouped[key].items.push(item);
    }
  }

  // Calculate averages
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(grouped)) {
    result[key] = {
      total: value.total,
      count: value.count,
      average: value.count > 0 ? value.total / value.count : 0,
    };
  }

  return result;
}

function getGroupKey(item: any, groupBy: string): string {
  const date = new Date(item.sale_date || item.created_at);
  
  switch (groupBy) {
    case 'day':
      return date.toISOString().split('T')[0];
    case 'week':
      const week = Math.ceil(date.getDate() / 7);
      return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
    case 'month':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    case 'year':
      return String(date.getFullYear());
    default:
      return 'all';
  }
}
