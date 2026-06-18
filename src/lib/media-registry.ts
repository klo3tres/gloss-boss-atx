export type MediaRegistryItem = {
  key: string;
  group: string;
  label: string;
  description: string;
  fallbackUrl: string;
};

export const MEDIA_REGISTRY_ITEMS: MediaRegistryItem[] = [
  { key: 'homepage.hero', group: 'Homepage', label: 'Homepage hero', description: 'Primary first-screen brand image.', fallbackUrl: '/assets/black_detailer_driveway_1780873080456.png' },
  { key: 'homepage.logo', group: 'Homepage', label: 'Hero logo', description: 'Large logo shown in the homepage hero.', fallbackUrl: '/brand/glossboss-official-atx.png' },
  { key: 'homepage.ctaBand', group: 'Homepage', label: 'CTA band image', description: 'Conversion band supporting visual.', fallbackUrl: '/assets/ceramic_coating_driveway_1780872997033.png' },
  { key: 'homepage.process.1', group: 'Homepage', label: 'Process image 1', description: 'First process/steps visual.', fallbackUrl: '/assets/exterior_wash_driveway_1780872964011.png' },
  { key: 'homepage.process.2', group: 'Homepage', label: 'Process image 2', description: 'Second process/steps visual.', fallbackUrl: '/assets/interior_detail_driveway_1780872974449.png' },
  { key: 'homepage.membershipCover', group: 'Homepage', label: 'Membership cover', description: 'Homepage membership showcase visual.', fallbackUrl: '/assets/full_detail_driveway_no_people_1780873155626.png' },
  { key: 'homepage.fleetCover', group: 'Homepage', label: 'Fleet cover', description: 'Homepage commercial fleet showcase visual.', fallbackUrl: '/assets/black_detailer_driveway_1780873080456.png' },
  { key: 'homepage.finalCta', group: 'Homepage', label: 'Final CTA image', description: 'Final public conversion image.', fallbackUrl: '/assets/ceramic_coating_driveway_1780872997033.png' },
  { key: 'services.exterior', group: 'Services', label: 'Exterior service image', description: 'Exterior wash/detail catalog card.', fallbackUrl: '/assets/exterior_wash_driveway_1780872964011.png' },
  { key: 'services.exteriorWash', group: 'Services', label: 'Exterior Wash image', description: 'Exterior Wash package card.', fallbackUrl: '/assets/exterior_wash_driveway_1780872964011.png' },
  { key: 'services.exteriorDetail', group: 'Services', label: 'Exterior Detail image', description: 'Exterior Detail package card.', fallbackUrl: '/assets/black_detailer_driveway_1780873080456.png' },
  { key: 'services.interior', group: 'Services', label: 'Interior service image', description: 'Interior detail catalog card.', fallbackUrl: '/assets/interior_detail_driveway_1780872974449.png' },
  { key: 'services.full', group: 'Services', label: 'Full detail image', description: 'Full detail catalog card.', fallbackUrl: '/assets/full_detail_driveway_no_people_1780873155626.png' },
  { key: 'services.ceramic', group: 'Services', label: 'Ceramic coating image', description: 'Ceramic coating catalog card.', fallbackUrl: '/assets/ceramic_coating_driveway_1780872997033.png' },
  { key: 'services.addons', group: 'Services', label: 'Add-on preview image', description: 'Add-on and upgrade preview artwork.', fallbackUrl: '/assets/interior_detail_driveway_1780872974449.png' },
  { key: 'fleet.hero', group: 'Fleet', label: 'Fleet hero image', description: 'Commercial fleet page hero.', fallbackUrl: '/assets/black_detailer_driveway_1780873080456.png' },
  { key: 'fleet.industries', group: 'Fleet', label: 'Fleet industries image', description: 'Industries served visual.', fallbackUrl: '/assets/full_detail_driveway_no_people_1780873155626.png' },
  { key: 'fleet.property', group: 'Fleet', label: 'Property management image', description: 'Property management industry card.', fallbackUrl: '/assets/full_detail_driveway_no_people_1780873155626.png' },
  { key: 'fleet.dealership', group: 'Fleet', label: 'Dealership image', description: 'Dealership industry card.', fallbackUrl: '/assets/ceramic_coating_driveway_1780872997033.png' },
  { key: 'fleet.medical', group: 'Fleet', label: 'Medical office image', description: 'Medical office industry card.', fallbackUrl: '/assets/exterior_wash_driveway_1780872964011.png' },
  { key: 'fleet.construction', group: 'Fleet', label: 'Construction company image', description: 'Construction/work truck industry card.', fallbackUrl: '/assets/black_detailer_driveway_1780873080456.png' },
  { key: 'fleet.corporate', group: 'Fleet', label: 'Corporate fleet image', description: 'Corporate and executive fleets.', fallbackUrl: '/assets/ceramic_coating_driveway_1780872997033.png' },
  { key: 'fleet.testimonial', group: 'Fleet', label: 'Fleet testimonial image', description: 'Fleet success story visual.', fallbackUrl: '/assets/full_detail_driveway_no_people_1780873155626.png' },
  { key: 'booking.vehicle.sedan', group: 'Booking Wizard', label: 'Sedan card image', description: 'Booking vehicle selection card.', fallbackUrl: '/assets/exterior_wash_driveway_1780872964011.png' },
  { key: 'booking.vehicle.suv', group: 'Booking Wizard', label: 'SUV card image', description: 'Booking vehicle selection card.', fallbackUrl: '/assets/ceramic_coating_driveway_1780872997033.png' },
  { key: 'booking.vehicle.truck', group: 'Booking Wizard', label: 'Truck card image', description: 'Booking vehicle selection card.', fallbackUrl: '/assets/black_detailer_driveway_1780873080456.png' },
  { key: 'booking.vehicle.fleet', group: 'Booking Wizard', label: 'Fleet card image', description: 'Oversized and fleet booking card.', fallbackUrl: '/assets/full_detail_driveway_no_people_1780873155626.png' },
  { key: 'booking.trustAccess', group: 'Booking Wizard', label: 'Booking trust/access panel', description: 'Access checklist supporting image.', fallbackUrl: '/assets/black_detailer_driveway_1780873080456.png' },
  { key: 'giftcards.hero', group: 'Gift Cards', label: 'Gift card hero', description: 'Gift card page hero background.', fallbackUrl: '/assets/ceramic_coating_driveway_1780872997033.png' },
  { key: 'giftcards.default', group: 'Gift Cards', label: 'Default gift card artwork', description: 'Fallback gift card artwork.', fallbackUrl: '/assets/ceramic_coating_driveway_1780872997033.png' },
  { key: 'giftcards.birthday', group: 'Gift Cards', label: 'Birthday gift artwork', description: 'Occasion card design.', fallbackUrl: '/assets/exterior_wash_driveway_1780872964011.png' },
  { key: 'giftcards.graduation', group: 'Gift Cards', label: 'Graduation gift artwork', description: 'Occasion card design.', fallbackUrl: '/assets/full_detail_driveway_no_people_1780873155626.png' },
  { key: 'giftcards.fathersDay', group: 'Gift Cards', label: "Father's Day artwork", description: 'Occasion card design.', fallbackUrl: '/assets/black_detailer_driveway_1780873080456.png' },
  { key: 'giftcards.mothersDay', group: 'Gift Cards', label: "Mother's Day artwork", description: 'Occasion card design.', fallbackUrl: '/assets/interior_detail_driveway_1780872974449.png' },
  { key: 'giftcards.thankYou', group: 'Gift Cards', label: 'Thank You artwork', description: 'Occasion card design.', fallbackUrl: '/assets/exterior_wash_driveway_1780872964011.png' },
  { key: 'giftcards.corporate', group: 'Gift Cards', label: 'Corporate reward artwork', description: 'Occasion card design.', fallbackUrl: '/assets/black_detailer_driveway_1780873080456.png' },
  { key: 'giftcards.holiday', group: 'Gift Cards', label: 'Holiday artwork', description: 'Occasion card design.', fallbackUrl: '/assets/ceramic_coating_driveway_1780872997033.png' },
  { key: 'giftcards.newCar', group: 'Gift Cards', label: 'New Car Gift artwork', description: 'Occasion card design.', fallbackUrl: '/assets/full_detail_driveway_no_people_1780873155626.png' },
  { key: 'gallery.featuredFallback', group: 'Gallery', label: 'Featured transformation fallback', description: 'Fallback thumbnail when gallery content is empty.', fallbackUrl: '/assets/full_detail_driveway_no_people_1780873155626.png' },
  { key: 'gallery.beforeAfterFallback', group: 'Gallery', label: 'Before/after fallback', description: 'Before/after preview fallback image.', fallbackUrl: '/assets/exterior_wash_driveway_1780872964011.png' },
  { key: 'memberships.hero', group: 'Memberships', label: 'Membership hero', description: 'Membership sales page visual.', fallbackUrl: '/assets/full_detail_driveway_no_people_1780873155626.png' },
  { key: 'memberships.bronze', group: 'Memberships', label: 'Bronze visual accent', description: 'Bronze membership artwork/accent.', fallbackUrl: '/assets/exterior_wash_driveway_1780872964011.png' },
  { key: 'memberships.silver', group: 'Memberships', label: 'Silver visual accent', description: 'Silver membership artwork/accent.', fallbackUrl: '/assets/interior_detail_driveway_1780872974449.png' },
  { key: 'memberships.gold', group: 'Memberships', label: 'Gold visual accent', description: 'Gold membership artwork/accent.', fallbackUrl: '/assets/ceramic_coating_driveway_1780872997033.png' },
  { key: 'technician.shell', group: 'Technician Pages', label: 'Technician app visual', description: 'Technician dashboard/supporting visual.', fallbackUrl: '/assets/interior_detail_driveway_1780872974449.png' },
  { key: 'loyalty.hero', group: 'Loyalty Pages', label: 'Loyalty hero', description: 'Loyalty and rewards visual.', fallbackUrl: '/assets/ceramic_coating_driveway_1780872997033.png' },
  { key: 'promo.seasonal', group: 'Seasonal Promotions', label: 'Seasonal promotion banner', description: 'Promotional banner artwork.', fallbackUrl: '/assets/black_detailer_driveway_1780873080456.png' },
];

export type MediaRegistry = Record<string, string>;

export function normalizeMediaRegistry(value: unknown): MediaRegistry {
  if (!value) return {};
  const raw = typeof value === 'string' ? safeParse(value) : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: MediaRegistry = {};
  for (const [key, url] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof url === 'string' && url.trim()) out[key] = url.trim();
  }
  return out;
}

export function mediaUrl(registry: MediaRegistry | null | undefined, key: string) {
  return registry?.[key] || MEDIA_REGISTRY_ITEMS.find((item) => item.key === key)?.fallbackUrl || '';
}

function safeParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
