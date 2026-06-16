/** Default home base for mileage, routing, and service-area estimates. */

export function getBusinessHomeBaseAddress(): string {
  return process.env.BUSINESS_HOME_BASE_ADDRESS?.trim() || 'Austin, TX, USA';
}

export function businessHomeBaseConfigured(): boolean {
  return Boolean(process.env.BUSINESS_HOME_BASE_ADDRESS?.trim());
}
