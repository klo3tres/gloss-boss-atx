import type { Metadata } from 'next';
import { LegalPageShell, LegalSectionBlock } from '@/components/marketing/legal-page-shell';
import { GLOSS_BOSS_BRAND_NAME, GLOSS_BOSS_SUPPORT_EMAIL } from '@/lib/branding';

const LAST_UPDATED = 'May 21, 2026';
const CANONICAL = 'https://glossbossatx.com/privacy';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `Privacy policy for ${GLOSS_BOSS_BRAND_NAME} — how we collect and use phone numbers, email, booking data, SMS, and payments.`,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: `Privacy Policy | ${GLOSS_BOSS_BRAND_NAME}`,
    url: CANONICAL,
    type: 'website',
  },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      title='Privacy Policy'
      subtitle={`How ${GLOSS_BOSS_BRAND_NAME} collects, uses, and protects your information when you book mobile detailing services in the Austin area.`}
      lastUpdated={LAST_UPDATED}
    >
      <LegalSectionBlock title='Overview'>
        <p>
          {GLOSS_BOSS_BRAND_NAME} (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) respects your privacy. This policy describes what
          personal information we collect through our website, booking flow, customer portal, and service communications, and how we
          use it to deliver mobile detailing appointments.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Information we collect'>
        <p>
          <strong className='text-zinc-100'>Phone numbers.</strong> We collect your mobile or contact phone number when you book,
          create an account, sign a service agreement, or contact us. We use your number for appointment confirmations, service
          updates, payment reminders, and—only with your consent—SMS notifications related to your booking.
        </p>
        <p>
          <strong className='text-zinc-100'>Email addresses.</strong> We collect your email for booking confirmations, receipts,
          deposit and payment notices, account access, and customer support. Transactional emails are sent through our application
          email provider (Resend), not through Supabase authentication templates except for login and account security messages.
        </p>
        <p>
          <strong className='text-zinc-100'>Booking information.</strong> This includes your name, service address, vehicle
          details (make, model, color, service type), appointment date and time, pricing selections, promo codes, access notes
          (gate codes, water/power availability), signed agreements, and photos taken before or after service for quality
          documentation.
        </p>
        <p>
          <strong className='text-zinc-100'>Payment information.</strong> Card payments are processed by Stripe. We do not store
          full card numbers on our servers. We retain payment amounts, receipt references, and Stripe transaction identifiers
          needed for accounting and customer support.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='How we use your information'>
        <p>We use collected information to:</p>
        <ul className='list-disc space-y-2 pl-5'>
          <li>Schedule, perform, and complete mobile detailing appointments</li>
          <li>Send booking confirmations, deposit receipts, and service-related email notifications</li>
          <li>Deliver appointment reminders and status updates you have agreed to receive</li>
          <li>Provide customer support and respond to inquiries</li>
          <li>Maintain service records, agreements, and quality documentation</li>
          <li>Improve our website, booking experience, and internal operations</li>
        </ul>
      </LegalSectionBlock>

      <LegalSectionBlock title='Appointment notifications'>
        <p>
          We may contact you by email or SMS about your appointment—including confirmations, reminders, arrival updates, and
          payment-related messages. Message frequency varies based on your booking and service status. Message and data rates may
          apply depending on your carrier plan.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='SMS consent & opt-out'>
        <p>
          When you provide your phone number and consent during booking or agreement signing, you agree to receive SMS messages
          from {GLOSS_BOSS_BRAND_NAME} related to your appointment and account. We do not send unrelated marketing texts without
          separate consent.
        </p>
        <p>
          <strong className='text-zinc-100'>You can opt out at any time by replying STOP</strong> to any message we send. After
          you opt out, we will send a final confirmation and will not send further SMS except where required for one-time
          transactional notices permitted by law. Reply HELP for assistance or contact {GLOSS_BOSS_SUPPORT_EMAIL}.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Payment processing (Stripe)'>
        <p>
          Payments—including deposits and balances—are processed securely through Stripe, Inc. Stripe&apos;s use of your
          information is governed by Stripe&apos;s privacy policy. We receive limited payment data from Stripe (such as payment
          status and amount) to update your booking and issue receipts.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='We do not sell your data'>
        <p>
          We do not sell, rent, or trade your personal information to third parties for their marketing purposes. We share
          information only with service providers that help us operate our business (for example: Stripe for payments, Twilio for
          SMS when enabled, Resend for email, and cloud hosting)—and only as needed to perform those services under appropriate
          safeguards.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Data retention & security'>
        <p>
          We retain booking, agreement, and payment records for as long as needed to provide services, meet legal obligations,
          and resolve disputes. We use reasonable administrative and technical measures to protect your information; no method of
          transmission over the internet is 100% secure.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Your choices'>
        <p>
          You may request access to or correction of your information by contacting {GLOSS_BOSS_SUPPORT_EMAIL}. You may delete or
          manage certain account data through your customer dashboard where available. California and other state privacy rights
          may apply—contact us for applicable requests.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Changes to this policy'>
        <p>
          We may update this Privacy Policy from time to time. The &quot;Last updated&quot; date at the top of this page reflects
          the most recent revision. Continued use of our services after changes constitutes acceptance of the updated policy.
        </p>
      </LegalSectionBlock>
    </LegalPageShell>
  );
}
