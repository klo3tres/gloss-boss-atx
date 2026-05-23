import Image from 'next/image';
import { GLOSS_BOSS_BRAND_NAME, GLOSS_BOSS_SUPPORT_EMAIL } from '@/lib/branding';
import { resolveAgreementBody } from '@/lib/agreement-legal';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v);
}

export type AgreementDocumentProps = {
  title: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceAddress: string;
  vehicles: Array<{ label: string; service: string; color: string }>;
  snapshot: unknown;
  signerLegalName: string;
  signatureType?: string;
  signatureData?: string;
  smsConsent: string;
  witnessName?: string;
  signedAt: string;
};

export function AgreementDocument(props: AgreementDocumentProps) {
  const { body, legacyTermsWarning } = resolveAgreementBody(props.snapshot);
  const signatureImage =
    props.signatureType === 'drawn' && typeof props.signatureData === 'string' && props.signatureData.startsWith('data:image')
      ? props.signatureData
      : null;

  return (
    <article className='gb-print-document mx-auto max-w-4xl rounded-3xl border border-gold/30 bg-zinc-950 p-8 text-white print:max-w-none print:rounded-none print:border-zinc-300 print:bg-white print:text-black print:shadow-none'>
      <header className='border-b border-white/10 pb-6 print:border-zinc-300'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
          <div className='flex items-start gap-4'>
            <Image src='/branding/gloss-boss-atx-logo.png' alt={GLOSS_BOSS_BRAND_NAME} width={160} height={80} className='h-auto w-36' unoptimized />
            <div>
              <p className='text-xs font-black uppercase tracking-[0.35em] text-gold-soft print:text-black'>{GLOSS_BOSS_BRAND_NAME}</p>
              <h1 className='mt-2 text-2xl font-black uppercase text-white print:text-black'>{props.title}</h1>
              <p className='mt-1 text-xs text-zinc-500 print:text-zinc-600'>{GLOSS_BOSS_SUPPORT_EMAIL}</p>
            </div>
          </div>
          <div className='text-right'>
            <span className='inline-block rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200 print:border-zinc-400 print:bg-zinc-100 print:text-zinc-800'>
              Immutable legal snapshot
            </span>
            <p className='mt-3 text-sm text-zinc-400 print:text-zinc-700'>Signed {props.signedAt}</p>
          </div>
        </div>
      </header>

      <section className='mt-5 grid gap-4 md:grid-cols-2'>
        <div className='rounded-2xl border border-white/10 bg-black/30 p-4 print:border-zinc-300 print:bg-white'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft print:text-black'>Customer</p>
          <p className='mt-2 text-lg font-bold text-white print:text-black'>{props.customerName}</p>
          <p className='text-sm text-zinc-400 print:text-zinc-700'>{props.customerEmail}</p>
          <p className='text-sm text-zinc-400 print:text-zinc-700'>{props.customerPhone}</p>
          <p className='mt-2 text-sm text-zinc-300 print:text-zinc-700'>{props.serviceAddress}</p>
        </div>
        <div className='rounded-2xl border border-white/10 bg-black/30 p-4 print:border-zinc-300 print:bg-white'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft print:text-black'>Vehicle(s) & service</p>
          <ul className='mt-3 space-y-2 text-sm text-zinc-300 print:text-zinc-800'>
            {props.vehicles.map((v, i) => (
              <li key={i}>
                {v.label} · {v.color} · {v.service}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className='mt-6 rounded-2xl border border-white/10 bg-black/30 p-5 print:border-zinc-300 print:bg-white'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft print:text-black'>Legal terms (full text as signed)</p>
        {legacyTermsWarning ? (
          <p className='mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 print:border-zinc-400 print:bg-zinc-100 print:text-zinc-900'>
            Legacy agreement snapshot lacked terms; current legal text shown.
          </p>
        ) : null}
        <div className='mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200 print:text-zinc-900'>
          {body || 'Agreement text not available in snapshot.'}
        </div>
      </section>

      <section className='gb-page-break mt-6 grid gap-4 md:grid-cols-2'>
        <div className='rounded-2xl border border-white/10 bg-black/30 p-4 print:border-zinc-300 print:bg-white'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft print:text-black'>Signature</p>
          <p className='mt-2 font-serif text-2xl text-white print:text-black'>{props.signerLegalName}</p>
          {signatureImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signatureImage} alt='Drawn signature' className='mt-3 max-h-24 rounded border border-zinc-300 bg-white p-2' />
          ) : props.signatureType === 'typed' ? (
            <p className='mt-2 text-xs text-zinc-500 print:text-zinc-600'>Typed electronic signature</p>
          ) : null}
          <p className='mt-3 text-xs text-zinc-500 print:text-zinc-600'>SMS consent: {props.smsConsent}</p>
        </div>
        <div className='rounded-2xl border border-white/10 bg-black/30 p-4 print:border-zinc-300 print:bg-white'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft print:text-black'>Technician / witness</p>
          <p className='mt-2 text-sm text-zinc-300 print:text-zinc-800'>{props.witnessName || 'On file with Gloss Boss ATX'}</p>
          <p className='mt-3 text-xs text-zinc-500 print:text-zinc-600'>Timestamp (America/Chicago): {props.signedAt}</p>
        </div>
      </section>
    </article>
  );
}

export function parseAgreementSnapshotFields(snapshot: unknown, row: Row, appt: Row, customer: Row) {
  const snap = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? (snapshot as Row) : {};
  return {
    title: str(snap.title || row.agreement_title || 'Gloss Boss ATX — Service Acknowledgement'),
    customerName: str(row.signer_legal_name || snap.customerName || customer.full_name || appt.guest_name) || 'Customer',
    customerEmail: str(customer.email || appt.guest_email || snap.customerEmail),
    customerPhone: str(customer.phone || appt.guest_phone || snap.customerPhone),
    serviceAddress: [row.service_address || appt.service_address, appt.service_city, appt.service_state, appt.service_zip].map(str).filter(Boolean).join(', '),
    signerLegalName: str(row.signer_legal_name || snap.signerLegalName),
    signatureType: str(row.signature_type || snap.signatureType),
    signatureData: str(row.signature_data || snap.signatureData),
    smsConsent: String(row.sms_consent ?? snap.sms_consent ?? 'not recorded'),
    witnessName: str(row.witness_name || snap.witnessName || snap.technicianName),
  };
}
