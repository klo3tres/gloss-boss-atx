/** Google Maps + Apple Maps deep links for service addresses. */

export function googleMapsSearchUrl(address: string) {
  const q = address.trim();
  if (!q) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function googleMapsDirectionsUrl(address: string) {
  const q = address.trim();
  if (!q) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

export function appleMapsSearchUrl(address: string) {
  const q = address.trim();
  if (!q) return '';
  return `https://maps.apple.com/?q=${encodeURIComponent(q)}`;
}

export function appleMapsDirectionsUrl(address: string) {
  const q = address.trim();
  if (!q) return '';
  return `https://maps.apple.com/?daddr=${encodeURIComponent(q)}`;
}

export function formatServiceAddress(parts: {
  service_address?: string | null;
  service_city?: string | null;
  service_state?: string | null;
  service_zip?: string | null;
}) {
  return [parts.service_address, parts.service_city, parts.service_state, parts.service_zip]
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
    .join(', ');
}
