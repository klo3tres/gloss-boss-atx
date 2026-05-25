import type { SupabaseClient } from '@supabase/supabase-js';

function isMissingColumn(msg: string, col: string) {
  return new RegExp(col, 'i').test(msg) && /does not exist|Could not find|column/i.test(msg);
}

export async function fetchBusinessExpenses(admin: SupabaseClient, limit = 80) {
  const attempts = [
    () => admin.from('business_expenses').select('*').order('incurred_at', { ascending: false }).limit(limit),
    () => admin.from('business_expenses').select('*').order('incurred_on', { ascending: false }).limit(limit),
    () => admin.from('business_expenses').select('*').order('created_at', { ascending: false }).limit(limit),
  ];
  for (const run of attempts) {
    const res = await run();
    if (!res.error) return res;
    if (!isMissingColumn(res.error.message, 'incurred')) continue;
  }
  return attempts[attempts.length - 1]();
}

export async function fetchJobMileageLogs(admin: SupabaseClient, limit = 80) {
  const attempts = [
    () => admin.from('job_mileage_logs').select('*').order('created_at', { ascending: false }).limit(limit),
    () => admin.from('job_mileage_logs').select('*').order('logged_on', { ascending: false }).limit(limit),
  ];
  for (const run of attempts) {
    const res = await run();
    if (!res.error) return res;
    if (!isMissingColumn(res.error.message, 'logged')) continue;
  }
  return attempts[attempts.length - 1]();
}
