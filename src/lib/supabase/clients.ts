/**
 * @see ./safeClient (browser-safe) and ./server (cookie server client).
 */
export * from './safeClient';
export { createSupabaseServerClient, tryCreateServerSupabase } from './server';
