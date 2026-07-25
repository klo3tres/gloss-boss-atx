import { createHmac, timingSafeEqual } from 'node:crypto';

type PreviewPayload = {
  appointmentId: string;
  ownerUserId: string;
  expiresAt: number;
};

function secret() {
  return (
    process.env.OWNER_PREVIEW_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  );
}

function signature(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createOwnerPreviewToken(input: {
  appointmentId: string;
  ownerUserId: string;
  ttlSeconds?: number;
}) {
  if (!secret()) throw new Error('Owner preview signing is unavailable.');
  const payload: PreviewPayload = {
    appointmentId: input.appointmentId,
    ownerUserId: input.ownerUserId,
    expiresAt: Math.floor(Date.now() / 1000) + Math.max(60, input.ttlSeconds ?? 300),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature(encoded)}`;
}

export function verifyOwnerPreviewToken(
  token: string,
  expectedOwnerUserId: string,
): PreviewPayload | null {
  try {
    const [encoded, suppliedSignature] = token.split('.');
    if (!encoded || !suppliedSignature || !secret()) return null;
    const expectedSignature = signature(encoded);
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as PreviewPayload;
    if (
      !payload.appointmentId ||
      payload.ownerUserId !== expectedOwnerUserId ||
      payload.expiresAt < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
