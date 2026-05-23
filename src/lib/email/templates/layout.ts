import {
  GLOSS_BOSS_BRAND_NAME,
  GLOSS_BOSS_LOGO_URL,
  GLOSS_BOSS_SUPPORT_EMAIL,
  GLOSS_BOSS_SUPPORT_MAILTO,
} from '@/lib/branding';

/** Verified public logo — must exist at public/branding/gloss-boss-atx-logo.png */
export const EMAIL_LOGO_URL = GLOSS_BOSS_LOGO_URL;

export function escapeEmailHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Centered logo + always-visible text fallback (email clients often block images). */
export function emailLogoHeader(): string {
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
  <tr>
    <td align="center" style="padding:0 0 8px;">
      <img
        src="${EMAIL_LOGO_URL}"
        alt="${escapeEmailHtml(GLOSS_BOSS_BRAND_NAME)} — Premium Auto Care"
        width="200"
        height="auto"
        style="display:block;margin:0 auto;max-width:200px;height:auto;border:0;outline:none;text-decoration:none;"
      />
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:0;">
      <p style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:11px;font-weight:800;letter-spacing:0.35em;text-transform:uppercase;color:#d4af37;">${escapeEmailHtml(GLOSS_BOSS_BRAND_NAME)}</p>
      <p style="margin:6px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:800;color:#fafafa;text-transform:uppercase;line-height:1.2;">Premium Auto Care</p>
    </td>
  </tr>
</table>`;
}

export function emailSupportLine(): string {
  return `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#a1a1aa;text-align:center;">Questions? <a href="${GLOSS_BOSS_SUPPORT_MAILTO}" style="color:#d4af37;font-weight:700;text-decoration:none;">${GLOSS_BOSS_SUPPORT_EMAIL}</a></p>`;
}

export function emailCtaButton(href: string, label: string): string {
  const safeHref = escapeEmailHtml(href);
  const safeLabel = escapeEmailHtml(label);
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0;">
  <tr>
    <td align="center">
      <a href="${safeHref}" style="display:inline-block;background:linear-gradient(90deg,#c9a962,#d4af37);color:#0a0a0a;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:900;text-decoration:none;text-transform:uppercase;letter-spacing:0.14em;border-radius:999px;padding:14px 28px;">${safeLabel}</a>
    </td>
  </tr>
</table>`;
}

export function emailCard(innerHtml: string): string {
  return `<div style="border:1px solid #3f3f46;border-radius:14px;padding:20px;background:#0c0c0c;margin:20px 0;">${innerHtml}</div>`;
}

export function emailParagraph(html: string, muted = false): string {
  const color = muted ? '#d4d4d8' : '#fafafa';
  return `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:${color};">${html}</p>`;
}

export function emailMoneyTable(rows: Array<{ label: string; value?: string }>): string {
  const tr = rows
    .filter((r) => r.value)
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#a1a1aa;">${escapeEmailHtml(r.label)}</td>
          <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#fafafa;font-weight:700;text-align:right;">${escapeEmailHtml(r.value!)}</td>
        </tr>`,
    )
    .join('');
  if (!tr) return '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;border-top:1px solid #27272a;padding-top:8px;">${tr}</table>`;
}

export type GlossBossEmailLayoutParams = {
  title: string;
  preview?: string;
  bodyHtml: string;
  /** Optional headline under logo (e.g. "Payment Receipt") */
  headline?: string;
};

/** Premium black/gold wrapper for all customer-facing Resend emails. */
export function glossBossEmailLayout(params: GlossBossEmailLayoutParams): string {
  const { title, preview = GLOSS_BOSS_BRAND_NAME, bodyHtml, headline } = params;
  const safeTitle = escapeEmailHtml(title);
  const headlineBlock = headline
    ? `<h1 style="margin:20px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:800;color:#fafafa;text-align:center;line-height:1.25;">${escapeEmailHtml(headline)}</h1>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#050505;color:#e4e4e7;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeEmailHtml(preview)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050505;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;border:1px solid rgba(201,169,98,0.45);border-radius:16px;overflow:hidden;background:#0a0a0a;">
          <tr>
            <td style="padding:28px 28px 20px;background:linear-gradient(180deg,#12100a 0%,#0a0a0a 100%);border-bottom:1px solid rgba(201,169,98,0.25);">
              ${emailLogoHeader()}
              ${headlineBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;">
              ${bodyHtml}
              ${emailSupportLine()}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #27272a;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#71717a;text-align:center;line-height:1.6;">
              Austin mobile detailing · ${escapeEmailHtml(GLOSS_BOSS_BRAND_NAME)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** @deprecated Use glossBossEmailLayout — kept for existing imports */
export function glossBossEmailShell(params: { title: string; preview?: string; bodyHtml: string }): string {
  return glossBossEmailLayout(params);
}

export function portalButtonHtml(origin: string): string {
  const base = origin.replace(/\/$/, '') || 'https://glossbossatx.com';
  return emailCtaButton(`${base}/dashboard`, 'Open your dashboard');
}
