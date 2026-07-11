export type AgreementMessageTone = 'quick' | 'professional' | 'warm';

export type AgreementMessageContext = {
  firstName: string;
  vehicle: string;
  appointmentWhen: string;
  agreementLink: string;
};

export function buildAgreementMessages(ctx: AgreementMessageContext): Record<AgreementMessageTone, string> {
  const name = ctx.firstName || 'there';
  const vehicle = ctx.vehicle || 'your vehicle';
  const when = ctx.appointmentWhen || 'your upcoming appointment';
  const link = ctx.agreementLink;

  return {
    quick: `Hi ${name}, before ${when}, please review and sign your Gloss Boss ATX service acknowledgment here: ${link}. It only takes a minute.`,
    professional: `Hi ${name}, your Gloss Boss ATX appointment for the ${vehicle} is scheduled for ${when}. Please review and sign the service acknowledgment before we begin: ${link}.`,
    warm: `Hey ${name}! We're looking forward to getting your ${vehicle} cleaned ${when}. Before we get started, please take a minute to review and sign your service acknowledgment here: ${link}. You can also choose whether you're comfortable with us using before-and-after photos.`,
  };
}
