/** Standard server action result — never void, never silent failure. */
export type ActionOk<T> = { ok: true; data: T };
export type ActionFail = { ok: false; error: string; debug?: Record<string, unknown> };
export type ActionResponse<T> = ActionOk<T> | ActionFail;

export function actionSuccess<T>(data: T, debug?: Record<string, unknown>): ActionOk<T> {
  if (debug) console.info('[action:ok]', debug);
  return { ok: true, data };
}

export function actionFailure(error: string, debug?: Record<string, unknown>): ActionFail {
  console.error('[action:fail]', error, debug ?? '');
  return { ok: false, error, debug };
}
