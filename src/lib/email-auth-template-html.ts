import { GLOSS_BOSS_LOGO_URL, GLOSS_BOSS_SUPPORT_EMAIL, GLOSS_BOSS_SUPPORT_MAILTO } from '@/lib/branding';

/** Shared black/gold Supabase Auth email shell (paste output into Dashboard templates). */
export function supabaseAuthEmailHtml(params: {
  headline: string;
  intro: string;
  ctaLabel: string;
  ctaUrlVar?: string;
}): string {
  const linkVar = params.ctaUrlVar ?? '{{ .ConfirmationURL }}';
  return `<!doctype html>
<html>
  <body style="margin:0;background:#050505;font-family:Inter,Segoe UI,Arial,sans-serif;color:#ffffff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050505;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid rgba(212,175,55,.35);border-radius:24px;background:#0b0b0b;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 18px;text-align:center;background:linear-gradient(135deg,#000,#16110a);">
                <img src="${GLOSS_BOSS_LOGO_URL}" alt="Gloss Boss ATX" width="220" style="display:block;margin:0 auto 16px;max-width:220px;height:auto;border:0;" />
                <div style="font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:#d4af37;font-weight:800;">Gloss Boss ATX</div>
                <h1 style="margin:14px 0 0;font-size:26px;line-height:1.15;color:#fff;">${params.headline}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;color:#d7d7d7;font-size:15px;line-height:1.7;">
                <p style="margin:0 0 18px;">${params.intro}</p>
                <p style="text-align:center;margin:30px 0;">
                  <a href="${linkVar}" style="display:inline-block;background:#d4af37;color:#000;text-decoration:none;font-weight:900;text-transform:uppercase;letter-spacing:.08em;border-radius:999px;padding:14px 26px;">${params.ctaLabel}</a>
                </p>
                <p style="margin:0;color:#9ca3af;font-size:13px;">If the button does not work, copy and paste this link into your browser:<br><span style="color:#f1d28a;word-break:break-all;">${linkVar}</span></p>
                <p style="margin:24px 0 0;color:#9ca3af;font-size:13px;">Questions? <a href="${GLOSS_BOSS_SUPPORT_MAILTO}" style="color:#f1d28a;">${GLOSS_BOSS_SUPPORT_EMAIL}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 26px;border-top:1px solid rgba(255,255,255,.08);color:#777;font-size:12px;text-align:center;">
                Gloss Boss ATX · Luxury mobile detailing · Austin, TX<br />
                <a href="${GLOSS_BOSS_SUPPORT_MAILTO}" style="color:#9ca3af;text-decoration:none;">${GLOSS_BOSS_SUPPORT_EMAIL}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
