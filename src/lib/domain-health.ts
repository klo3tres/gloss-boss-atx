import tls from 'node:tls';
import { APEX_HOST, CANONICAL_ORIGIN, EXPECTED_APP_URL, WWW_HOST } from '@/lib/env/canonical-domain';

export type TlsProbeResult = {
  host: string;
  ok: boolean;
  error: string | null;
  subject: string | null;
  altNames: string[];
};

export type DomainHealthReport = {
  checkedAt: string;
  canonicalOrigin: string;
  apex: TlsProbeResult;
  www: TlsProbeResult;
  apexRedirectsToWww: boolean | null;
  httpApexRedirectsToHttps: boolean | null;
  criticalIssue: string | null;
  fixSteps: string[];
};

function probeTls(hostname: string): Promise<TlsProbeResult> {
  return new Promise((resolve) => {
    const result: TlsProbeResult = {
      host: hostname,
      ok: false,
      error: null,
      subject: null,
      altNames: [],
    };

    const socket = tls.connect(
      443,
      hostname,
      { servername: hostname, rejectUnauthorized: true },
      () => {
        const cert = socket.getPeerCertificate();
        result.ok = true;
        result.subject = (cert.subject as { CN?: string } | undefined)?.CN ?? null;
        const alt = cert.subjectaltname;
        if (typeof alt === 'string') {
          result.altNames = alt
            .split(',')
            .map((s) => s.trim().replace(/^DNS:/i, ''))
            .filter(Boolean);
        }
        socket.end();
        resolve(result);
      },
    );

    socket.setTimeout(10_000, () => {
      result.error = 'TLS connection timed out';
      socket.destroy();
      resolve(result);
    });

    socket.on('error', (e) => {
      result.error = e instanceof Error ? e.message : String(e);
      resolve(result);
    });
  });
}

async function probeRedirect(fromUrl: string): Promise<{ status: number; location: string | null } | null> {
  try {
    const res = await fetch(fromUrl, { method: 'HEAD', redirect: 'manual', cache: 'no-store' });
    return { status: res.status, location: res.headers.get('location') };
  } catch {
    return null;
  }
}

export async function loadDomainHealthReport(): Promise<DomainHealthReport> {
  const [apex, www, apexHead, httpApex] = await Promise.all([
    probeTls(APEX_HOST),
    probeTls(WWW_HOST),
    probeRedirect(`https://${APEX_HOST}/`),
    probeRedirect(`http://${APEX_HOST}/`),
  ]);

  const apexLocation = apexHead?.location?.toLowerCase() ?? '';
  const apexRedirectsToWww =
    apexHead != null ? apexLocation.includes(WWW_HOST) || apexLocation.includes('www.glossbossatx.com') : null;

  const httpLocation = httpApex?.location?.toLowerCase() ?? '';
  const httpApexRedirectsToHttps =
    httpApex != null ? httpApex.status >= 300 && httpApex.status < 400 && httpLocation.startsWith('https://') : null;

  const fixSteps: string[] = [];
  let criticalIssue: string | null = null;

  if (!www.ok) {
    criticalIssue = `HTTPS certificate invalid for ${WWW_HOST} — production site may show security warnings. ${www.error ?? ''}`;
    fixSteps.push('Vercel → Domains: www.glossbossatx.com must show Valid Configuration (CNAME www → cname.vercel-dns.com).');
  }

  if (!apex.ok) {
    fixSteps.push(`Apex ${APEX_HOST} TLS: ${apex.error ?? 'invalid'}. Apex should redirect to www in Vercel — both domains need valid SSL.`);
  }

  if (apexRedirectsToWww === false) {
    fixSteps.push(
      'Configure glossbossatx.com → redirect to www.glossbossatx.com in Vercel Domains only. Remove any app-level or vercel.json host redirects.',
    );
    if (!criticalIssue) {
      criticalIssue = 'Apex is not redirecting to www — visitors may hit redirect loops or wrong host.';
    }
  }

  if (httpApexRedirectsToHttps === false) {
    fixSteps.push('Ensure HTTP → HTTPS redirect is enabled in Vercel.');
  }

  return {
    checkedAt: new Date().toISOString(),
    canonicalOrigin: CANONICAL_ORIGIN,
    apex,
    www,
    apexRedirectsToWww,
    httpApexRedirectsToHttps,
    criticalIssue,
    fixSteps,
  };
}

export { EXPECTED_APP_URL };
