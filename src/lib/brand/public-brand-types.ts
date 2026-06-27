export type PublicBrandPayload = {
  businessDisplayName: string;
  brandShortName: string;
  brandCityLabel: string;
  logoUrl: string | null;
  iconUrl: string | null;
  heroVideoUrl: string | null;
  heroVideoPosterUrl: string | null;
  heroVideoEnabled: boolean;
  primaryColor: string;
  accentColor: string;
  supportEmail: string | null;
  supportPhone: string | null;
  websiteUrl: string;
  publicBookingUrl: string;
};
