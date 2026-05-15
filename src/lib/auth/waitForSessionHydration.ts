import type { Session, SupabaseClient } from '@supabase/supabase-js';

/**
 * Waits for Supabase auth to finish restoring from storage (`INITIAL_SESSION`)
 * before treating `null` as “signed out”. Browser client only — never throws.
 */
export async function waitForSessionHydration(client: SupabaseClient): Promise<Session | null> {
  try {
    return await new Promise<Session | null>((resolve) => {
      let settled = false;
      let fallbackTimer: ReturnType<typeof setTimeout>;
      const holder: { sub?: { unsubscribe: () => void } } = {};

      const finish = (session: Session | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        holder.sub?.unsubscribe();
        resolve(session);
      };

      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') {
          finish(session);
        }
      });
      holder.sub = data.subscription;

      fallbackTimer = setTimeout(() => {
        void (async () => {
          if (settled) return;
          const { data: snap } = await client.auth.getSession();
          finish(snap.session ?? null);
        })();
      }, 2000);
    });
  } catch {
    try {
      const { data } = await client.auth.getSession();
      return data.session ?? null;
    } catch {
      return null;
    }
  }
}
