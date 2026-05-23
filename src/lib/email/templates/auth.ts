import { EMAIL_LOGO_URL, emailSupportLine, escapeEmailHtml, glossBossEmailLayout } from '@/lib/email/templates/layout';
import { GLOSS_BOSS_BRAND_NAME } from '@/lib/branding';

/** Supabase Auth email shell — paste output into Dashboard → Authentication → Email Templates */
export function supabaseAuthEmailHtml(params: {
  headline: string;
  intro: string;
  ctaLabel: string;
  ctaUrlVar?: string;
}): string {
  const linkVar = params.ctaUrlVar ?? '{{ .ConfirmationURL }}';
  const bodyHtml = `
    <p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#d4d4d8;">${params.intro}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0;">
      <tr><td align="center">
        <a href="${linkVar}" style="display:inline-block;background:linear-gradient(90deg,#c9a962,#d4af37);color:#0a0a0a;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:900;text-decoration:none;text-transform:uppercase;letter-spacing:0.14em;border-radius:999px;padding:14px 28px;">${escapeEmailHtml(params.ctaLabel)}</a>
      </td></tr>
    </table>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#9ca3af;">If the button does not work, copy and paste this link into your browser:<br><span style="color:#d4af37;word-break:break-all;">${linkVar}</span></p>
    ${emailSupportLine()}`;

  return glossBossEmailLayout({
    title: params.headline,
    preview: `${params.headline} — ${GLOSS_BOSS_BRAND_NAME}`,
    headline: params.headline,
    bodyHtml,
  });
}

/** Static HTML for Supabase dashboard (logo URL inlined for copy-paste files). */
export function supabaseAuthEmailHtmlStatic(params: {
  headline: string;
  intro: string;
  ctaLabel: string;
  ctaUrlVar?: string;
}): string {
  return supabaseAuthEmailHtml(params).replaceAll(EMAIL_LOGO_URL, 'https://glossbossatx.com/branding/gloss-boss-atx-logo.png');
}

export const AUTH_EMAIL_EXPORTS = {
  confirmSignup: () =>
    supabaseAuthEmailHtmlStatic({
      headline: 'Confirm your email',
      intro: 'Welcome to Gloss Boss ATX. Confirm your email to access your customer dashboard, bookings, and service history.',
      ctaLabel: 'Confirm email',
    }),
  magicLink: () =>
    supabaseAuthEmailHtmlStatic({
      headline: 'Secure sign in',
      intro: 'Use the secure link below to sign in to your Gloss Boss ATX account. This link expires shortly.',
      ctaLabel: 'Sign in',
    }),
  resetPassword: () =>
    supabaseAuthEmailHtmlStatic({
      headline: 'Reset your password',
      intro: 'Use the secure link below to reset your Gloss Boss ATX password. If you did not request this, you can ignore this email.',
      ctaLabel: 'Reset password',
    }),
  changeEmail: () =>
    supabaseAuthEmailHtmlStatic({
      headline: 'Confirm email change',
      intro: 'Confirm your new email address for your Gloss Boss ATX account.',
      ctaLabel: 'Confirm new email',
    }),
  inviteUser: () =>
    supabaseAuthEmailHtmlStatic({
      headline: "You're invited",
      intro: 'You have been invited to join Gloss Boss ATX. Accept the invitation to set up your account.',
      ctaLabel: 'Accept invitation',
    }),
  reauthentication: () =>
    supabaseAuthEmailHtmlStatic({
      headline: 'Verify your identity',
      intro: 'For your security, confirm this action on your Gloss Boss ATX account.',
      ctaLabel: 'Verify',
    }),
} as const;
