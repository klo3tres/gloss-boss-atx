/**
 * Branded email HTML shells + notification hooks.
 * Replace with Resend/Twilio integrations when API keys are configured.
 */

import { GLOSS_BOSS_LOGO_URL, GLOSS_BOSS_SUPPORT_EMAIL, GLOSS_BOSS_SUPPORT_MAILTO } from '@/lib/branding';

export function glossBossEmailShell(params: {
  title: string;
  preview?: string;
  bodyHtml: string;
}): string {
  const { title, preview = 'Gloss Boss ATX', bodyHtml } = params;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;background:#0a0a0a;color:#e4e4e7;font-family:Georgia,serif;">
  <span style="display:none;color:transparent">${preview}</span>
  <table role="presentation" width="100%" style="background:#0a0a0a;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" style="max-width:600px;border:1px solid #c9a962;background:#111;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 28px;background:linear-gradient(90deg,#0a0a0a,#14110a);border-bottom:1px solid #c9a96244;text-align:center;">
          <img src="${GLOSS_BOSS_LOGO_URL}" alt="Gloss Boss ATX" width="200" style="display:block;margin:0 auto 14px;max-width:200px;height:auto;border:0;" />
          <p style="margin:0;font-size:11px;letter-spacing:0.35em;text-transform:uppercase;color:#d4a64d;">Gloss Boss ATX</p>
          <p style="margin:8px 0 0;font-size:20px;font-weight:800;color:#fafafa;text-transform:uppercase;">Premium Auto Care</p>
        </td></tr>
        <tr><td style="padding:28px;">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #27272a;font-size:12px;color:#a1a1aa;text-align:center;">Austin mobile detailing · <a href="${GLOSS_BOSS_SUPPORT_MAILTO}" style="color:#d4a64d;">${GLOSS_BOSS_SUPPORT_EMAIL}</a></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function bookingConfirmationEmailHtml(details: {
  guestName: string;
  whenLabel: string;
  total: string;
  deposit: string;
  vehicles: string;
}): string {
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#fafafa;">Hi ${details.guestName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d4d4d8;">Your Gloss Boss ATX booking is received.</p>
    <div style="border:1px solid #3f3f46;border-radius:10px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 8px;font-size:13px;color:#d4a64d;">Appointment</p>
      <p style="margin:0;font-size:15px;color:#fafafa;">${details.whenLabel}</p>
      <p style="margin:12px 0 0;font-size:13px;color:#a1a1aa;">${details.vehicles}</p>
      <p style="margin:12px 0 0;font-size:14px;color:#fafafa;">Estimated total <strong style="color:#fefce8;">${details.total}</strong></p>
      <p style="margin:8px 0 0;font-size:14px;color:#fcd34d;">Deposit due <strong>${details.deposit}</strong></p>
    </div>
    <p style="margin:16px 0 0;font-size:13px;color:#a1a1aa;">You&apos;ll complete liability acknowledgment after checkout when prompted.</p>`;
  return glossBossEmailShell({ title: 'Booking confirmation', bodyHtml: body });
}
