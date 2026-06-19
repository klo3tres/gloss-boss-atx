export const APPLE_ADVANCED_API_MESSAGE = 'Apple advanced weather/maps API not configured. Basic Apple Maps links still work.';

const APPLE_ADVANCED_ENV_KEYS = [
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_SERVICE_ID',
  'APPLE_PRIVATE_KEY',
  'APPLE_MAPS_KEY_ID',
  'APPLE_MAPS_PRIVATE_KEY',
] as const;

export type AppleAdvancedApiStatus = {
  configured: boolean;
  message: string;
  missing: string[];
};

export function openWeatherConfigured() {
  return Boolean(process.env.OPENWEATHER_API_KEY?.trim());
}

export function businessHomeBaseConfigured() {
  return Boolean(process.env.BUSINESS_HOME_BASE_ADDRESS?.trim());
}

export function googleMapsConfigured() {
  return Boolean(
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
      process.env.MAPS_API_KEY?.trim() ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim()
  );
}

export function businessCoordinates() {
  const latRaw = process.env.BUSINESS_LAT?.trim();
  const lngRaw = process.env.BUSINESS_LNG?.trim();
  const lat = latRaw ? Number(latRaw) : undefined;
  const lng = lngRaw ? Number(lngRaw) : undefined;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat: lat as number, lng: lng as number };
}

export function appleAdvancedApiStatus(): AppleAdvancedApiStatus {
  const missing = APPLE_ADVANCED_ENV_KEYS.filter((key) => !process.env[key]?.trim());
  return {
    configured: missing.length === 0,
    message: missing.length === 0 ? 'Apple Maps/Weather advanced API configured.' : APPLE_ADVANCED_API_MESSAGE,
    missing,
  };
}
