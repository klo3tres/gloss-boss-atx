import tls from 'node:tls';
import { CANONICAL_HOST, CANONICAL_ORIGIN, WWW_HOST } from '@/lib/env/canonical-domain';

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
  wwwRedirectsToApex: boolean | null;
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
  const [apex, www, wwwHead, httpApex] = await Promise.all([
    probeTls(CANONICAL_HOST),
    probeTls(WWW_HOST),
    probeRedirect(`https://${WWW_HOST}/`),
    probeRedirect(`http://${CANONICAL_HOST}/`),
  ]);

  const wwwLocation = wwwHead?.location?.toLowerCase() ?? '';
  const wwwRedirectsToApex =
    wwwHead != null ? wwwLocation.includes(CANONICAL_HOST) && !wwwLocation.includes(WWW_HOST) : null;

  const httpLocation = httpApex?.location?.toLowerCase() ?? '';
  const httpApexRedirectsToHttps =
    httpApex != null ? httpApex.status >= 300 && httpApex.status < 400 && httpLocation.startsWith('https://') : null;

  const fixSteps: string[] = [];
  let criticalIssue: string | null = null;

  if (!apex.ok) {
    criticalIssue =
      `HTTPS certificate invalid for ${CANONICAL_HOST} — browsers show security warnings. ${apex.error ?? 'Certificate mismatch.'}`;
    fixSteps.push(
      'Vercel → Project → Settings → Domains: add glossbossatx.com with a green Valid Configuration badge.',
      'DNS apex A record @ → 76.76.21.21 (Vercel) OR use Vercel nameservers.',
      'Wait for SSL provisioning (usually under 30 minutes). Do not redirect www → apex until apex cert is valid.',
    );
  }

  if (!www.ok) {
    fixSteps.push(`Fix www SSL: add www.glossbossatx.com in Vercel with CNAME www → cname.vercel-dns.com.`);
    if (!criticalIssue) {
      criticalIssue = `HTTPS certificate invalid for ${WWW_HOST}.`;
    }
  }

  if (wwwRedirectsToApex && !apex.ok && www.ok) {
    criticalIssue =
      'www has valid SSL but redirects to apex where the certificate fails — this is the likely cause of coworker browser warnings.';
    fixSteps.unshift(
      'URGENT: In Vercel Domains, ensure glossbossatx.com shows Valid Configuration before www redirects to it.',
    );
  }

  if (httpApexRedirectsToHttps === false) {
    fixSteps.push('Ensure HTTP → HTTPS redirect is enabled (Vercel does this automatically when SSL is valid).');
  }

  return {
    checkedAt: new Date().toISOString(),
    canonicalOrigin: CANONICAL_ORIGIN,
    apex,
    www,
    wwwRedirectsToApex,
    httpApexRedirectsToHttps,
    criticalIssue,
    fixSteps,
  };
}
