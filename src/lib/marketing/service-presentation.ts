import type { ServicePackage } from '@/lib/site-config';

export type ServicePresentation = {
  imageKey: string;
  ideal: string;
  bestFor: string;
  whatYouGet: string[];
  expectedResults: string[];
  recommendedAddons: string[];
  category: 'exterior' | 'interior' | 'full' | 'ceramic' | 'other';
};

export const SERVICE_PRESENTATION: Array<ServicePresentation & { match: string[] }> = [
  {
    match: ['exterior wash', 'exterior-wash'],
    imageKey: 'services.exteriorWash',
    ideal: 'A refreshed gloss and clean wheels without a full detail.',
    bestFor: 'Weekly upkeep, pollen resets, and maintenance between full details.',
    whatYouGet: ['Hand wash & rinse', 'Wheel & tire cleaning', 'Door jambs', 'Windows', 'Tire shine'],
    expectedResults: ['Swirl-free gloss', 'Clean wheels & tires', 'Pollen and dust removed'],
    recommendedAddons: ['Clay bar', 'Engine bay', 'Pet hair'],
    category: 'exterior',
  },
  {
    match: ['exterior detail', 'exterior-detail'],
    imageKey: 'services.exteriorDetail',
    ideal: 'Deeper paint clarity and protection-ready gloss recovery.',
    bestFor: 'Pre-event shine, seasonal paint reset, or sale prep.',
    whatYouGet: ['Hand wash', 'Wheel detail', 'Bug removal', 'Clay bar prep', 'Spray wax finish'],
    expectedResults: ['Deeper paint clarity', 'Contaminants lifted', 'Protection-ready finish'],
    recommendedAddons: ['Clay bar', 'Ceramic maintenance', 'Engine bay'],
    category: 'exterior',
  },
  {
    match: ['interior detail', 'interior-detail', 'interior'],
    imageKey: 'services.interior',
    ideal: 'A cabin reset that feels new again — vacuumed, wiped, and refreshed.',
    bestFor: 'Daily drivers, family vehicles, pet hair, spills, and cabin refreshes.',
    whatYouGet: ['Full vacuum', 'Surface wipe-down', 'Cup holders & console', 'Door panels', 'Interior windows', 'Leather conditioning where applicable'],
    expectedResults: ['Fresh cabin scent', 'Vacuumed & wiped surfaces', 'Stains and hair reduced'],
    recommendedAddons: ['Upholstery shampoo', 'Pet hair', 'Odor treatment', 'Heavy condition'],
    category: 'interior',
  },
  {
    match: ['full detail', 'full-detail', 'full'],
    imageKey: 'services.full',
    ideal: 'Our signature inside-and-out reset — the most complete mobile detail we offer.',
    bestFor: 'Vehicles that need everything: interior reset, exterior gloss, and show-ready presentation.',
    whatYouGet: [
      'Full interior vacuum',
      'Wipe-down of all interior surfaces',
      'Cracks, crevices, cup holders & door panels',
      'Dashboard & center console',
      'Door jambs & interior windows',
      'Leather conditioning where applicable',
      'Exterior hand wash',
      'Bug removal on front end / impacted areas',
      'Wheel detail & tire cleaning with shine',
      'Spray wax finish for gloss and paint protection',
    ],
    expectedResults: ['Inside-out reset', 'Showroom presentation', 'Best value for neglected vehicles'],
    recommendedAddons: ['Clay bar', 'Upholstery shampoo', 'Pet hair', 'Engine bay'],
    category: 'full',
  },
  {
    match: ['ceramic', 'coating'],
    imageKey: 'services.ceramic',
    ideal: 'Longer-term gloss, hydrophobic protection, and easier maintenance washes.',
    bestFor: 'Owners who want premium paint protection and a lasting showroom finish.',
    whatYouGet: ['Paint decontamination', 'Surface prep', 'Ceramic application', 'Cure & inspection'],
    expectedResults: ['Hydrophobic beading', 'UV & contaminant barrier', 'Easier maintenance washes'],
    recommendedAddons: ['Paint correction', 'Interior protection', 'Maintenance plan'],
    category: 'ceramic',
  },
];

const FALLBACK_IMAGES: Record<string, string> = {
  'full-detail': 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=800&q=80',
  'exterior-wash': 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=800&q=80',
  'exterior-detail': 'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=800&q=80',
  'interior-detail': 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=800&q=80',
  'ceramic-coating': 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=800&q=80',
};

export function servicePresentation(service: ServicePackage): ServicePresentation {
  const text = `${service.id} ${service.title} ${service.subtitle ?? ''}`.toLowerCase();
  const found = SERVICE_PRESENTATION.find((item) => item.match.some((m) => text.includes(m)));
  return found ?? {
    ...SERVICE_PRESENTATION[0]!,
    bestFor: SERVICE_PRESENTATION[0]!.bestFor,
    whatYouGet: SERVICE_PRESENTATION[0]!.whatYouGet,
    recommendedAddons: SERVICE_PRESENTATION[0]!.recommendedAddons,
    expectedResults: SERVICE_PRESENTATION[0]!.expectedResults,
  };
}

export function serviceDurationLabel(service: ServicePackage): string {
  const min = service.estimatedMinMinutes;
  const max = service.estimatedMaxMinutes;
  if (min && max && max !== min) return `${min}–${max} min`;
  if (min) return `~${min} min`;
  if (max) return `~${max} min`;
  return 'Varies by vehicle';
}

export function serviceFallbackImage(serviceId: string): string {
  return FALLBACK_IMAGES[serviceId] ?? FALLBACK_IMAGES['full-detail']!;
}

export function serviceCategoryFilter(
  service: ServicePackage,
  tab: 'all' | 'exterior' | 'interior' | 'full' | 'ceramic',
): boolean {
  if (tab === 'all') return true;
  const pres = servicePresentation(service);
  return pres.category === tab;
}

export function isPopularService(service: ServicePackage): boolean {
  return /full/i.test(service.title) && !/exterior|interior/i.test(service.title);
}
