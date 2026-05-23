import type { Metadata } from 'next';
import { LegalPageShell, LegalSectionBlock } from '@/components/marketing/legal-page-shell';
import { GLOSS_BOSS_BRAND_NAME, GLOSS_BOSS_SUPPORT_EMAIL } from '@/lib/branding';

const LAST_UPDATED = 'May 21, 2026';
const CANONICAL = 'https://glossbossatx.com/terms';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: `Terms and conditions for ${GLOSS_BOSS_BRAND_NAME} mobile detailing — booking, cancellation, weather, payments, and service limitations.`,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: `Terms & Conditions | ${GLOSS_BOSS_BRAND_NAME}`,
    url: CANONICAL,
    type: 'website',
  },
};

export default function TermsPage() {
  return (
    <LegalPageShell
      title='Terms & Conditions'
      subtitle={`Service terms for ${GLOSS_BOSS_BRAND_NAME} mobile auto detailing in Austin, Texas and surrounding areas.`}
      lastUpdated={LAST_UPDATED}
    >
      <LegalSectionBlock title='Agreement to terms'>
        <p>
          By booking a service, paying a deposit, signing our on-site service agreement, or using our website, you agree to these
          Terms &amp; Conditions. If you do not agree, please do not book or use our services.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Services'>
        <p>
          {GLOSS_BOSS_BRAND_NAME} provides mobile automotive detailing and related services at your designated location. Specific
          services, pricing, and inclusions are described at booking and in your signed service agreement. We reserve the right to
          refuse service for unsafe conditions, inaccessible vehicles, or circumstances that prevent quality or safe completion.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Appointment cancellation'>
        <p>
          Deposits secure your appointment time and technician travel. If you cancel with reasonable notice (at least 24 hours
          before your scheduled start), we will work with you to reschedule or apply your deposit to a future appointment per our
          current policy. Late cancellations or no-shows may forfeit the deposit to cover scheduling and travel costs.
        </p>
        <p>Contact us as soon as possible at {GLOSS_BOSS_SUPPORT_EMAIL} or (512) 481-2319 if you need to cancel.</p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Rescheduling policy'>
        <p>
          Rescheduling is subject to availability. One complimentary reschedule may be offered when requested at least 24 hours
          in advance. Repeated reschedules or same-day changes may incur fees or require a new deposit. We will confirm your new
          appointment time by email or SMS when possible.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Weather policy'>
        <p>
          Mobile detailing requires suitable weather and site conditions. Rain, extreme heat, high winds, freezing temperatures, or
          unsafe surfaces may require postponement. If we reschedule due to weather, your deposit remains valid for the
          rescheduled date. If you decline a weather-related reschedule, standard cancellation terms may apply.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Mobile detailing disclaimers'>
        <p>
          Results depend on vehicle condition, age, paint health, prior damage, and environmental exposure. We do not guarantee
          removal of all stains, scratches, oxidation, etching, or odor in a single visit unless explicitly quoted. Hidden damage,
          failing clear coat, or pre-existing defects may limit outcomes. You are responsible for removing personal valuables before
          service.
        </p>
        <p>
          You must provide safe, legal access to the vehicle and a workable service area with adequate space, lighting, and—where
          required—water and power as disclosed at booking.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Service limitations'>
        <p>Unless specifically included in your package, services may not cover:</p>
        <ul className='list-disc space-y-2 pl-5'>
          <li>Engine bay cleaning requiring disassembly</li>
          <li>Headlight restoration beyond quoted scope</li>
          <li>Paint correction beyond the booked package level</li>
          <li>Biological hazards, mold remediation, or hazardous materials</li>
          <li>Repairs to mechanical, electrical, or structural components</li>
        </ul>
        <p>Additional time or services may be quoted on site with your approval before work continues.</p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Ceramic coating expectations'>
        <p>
          Ceramic coating and paint-protection services require proper surface preparation and cure time. Results and durability
          depend on maintenance, washing habits, and environmental exposure. Coatings are not a substitute for insurance against
          rock chips, scratches, or collision damage. Warranty terms—if offered—will be provided in writing for your specific
          package. Improper maintenance or automatic car washes with harsh chemicals may void stated warranty benefits.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Payment terms'>
        <p>
          A deposit is required to reserve most appointments and is processed through Stripe at booking. Remaining balance is due
          upon completion unless otherwise agreed in writing. Prices quoted online or by phone are estimates until vehicle
          inspection; material condition may affect final price with your consent. Tips are appreciated but never required.
        </p>
        <p>
          Failed or disputed card charges do not relieve obligation for services already performed per your signed agreement.
          Gift cards and promotions are subject to their stated terms and cannot be combined unless explicitly allowed.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Photo & media consent'>
        <p>
          We may photograph or record your vehicle before and after service for quality control, training, and marketing. By
          booking or signing our service agreement, you grant {GLOSS_BOSS_BRAND_NAME} permission to use anonymized or
          vehicle-focused images unless you opt out in writing before service or notify us at {GLOSS_BOSS_SUPPORT_EMAIL}. We will
          not publish your personal contact information with marketing images without separate consent.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Liability limitations'>
        <p>
          To the fullest extent permitted by Texas law, {GLOSS_BOSS_BRAND_NAME} is not liable for indirect, incidental, or
          consequential damages arising from our services. Our total liability for any claim related to a service visit is limited
          to the amount you paid for that visit. Nothing in these terms limits liability where prohibited by law (including gross
          negligence or willful misconduct).
        </p>
        <p>
          You agree that our on-site signed service agreement and liability acknowledgment govern in-person service and may
          contain additional terms you accept at the time of detailing.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Disputes & governing law'>
        <p>
          These terms are governed by the laws of the State of Texas. Disputes will be handled in Travis County, Texas, unless
          applicable law requires otherwise. Contact us first at {GLOSS_BOSS_SUPPORT_EMAIL} so we can attempt good-faith resolution.
        </p>
      </LegalSectionBlock>

      <LegalSectionBlock title='Changes'>
        <p>
          We may update these Terms &amp; Conditions periodically. The date at the top of this page indicates the latest version.
          Material changes will apply to future bookings; continued use after posting constitutes acceptance.
        </p>
      </LegalSectionBlock>
    </LegalPageShell>
  );
}
