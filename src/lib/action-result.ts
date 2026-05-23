export type ActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
  /** success = green, warning = amber (e.g. Twilio accepted but not delivered), error = red */
  tone?: 'success' | 'warning' | 'error';
};

export const actionOk = (message: string): ActionResult => ({ ok: true, message, tone: 'success' });
export const actionWarn = (message: string): ActionResult => ({ ok: true, message, tone: 'warning' });
export const actionErr = (error: string): ActionResult => ({ ok: false, error, tone: 'error' });
