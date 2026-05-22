export type ActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
};

export const actionOk = (message: string): ActionResult => ({ ok: true, message });
export const actionErr = (error: string): ActionResult => ({ ok: false, error });
