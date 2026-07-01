import type { ServicePackage } from '@/lib/site-config';

export type ServicePresentation = {
  imageKey: string;
  ideal: string;
  expectedResults: string[];
  category: 'exterior' | 'interior' | 'full' | 'ceramic' | 'other';
};

export const SERVICE_PRESENTATION: Array<ServicePresentation & { match: string[] }> = [
  {
    match: ['exterior wash', 'exterior-wash'],
    imageKey: 'services.exteriorWash',
    ideal: 'Weekly upkeep, pollen resets, and driveway maintenance visits.',
    expectedResults: ['Swirl-free gloss', 'Clean wheels & tires', 'Pollen and dust removed'],
    category: 'exterior',
  },
  {
    match: ['exterior detail', 'exterior-detail'],
    imageKey: 'services.exteriorDetail',
    ideal: 'Paint-safe gloss recovery before events, sales, or seasonal resets.',
    expectedResults: ['Deeper paint clarity', 'Contaminants lifted', 'Protection-ready finish'],
    category: 'exterior',
  },
  {
    match: ['interior detail', 'interior-detail', 'interior'],
    imageKey: 'services.interior',
    ideal: 'Daily drivers, family vehicles, pet hair, spills, and cabin refreshes.',
    expectedResults: ['Fresh cabin scent', 'Vacuumed & wiped surfaces', 'Stains and hair reduced'],
    category: 'interior',
  },
  {
    match: ['full detail', 'full-detail', 'full'],
    imageKey: 'services.full',
    ideal: 'Complete interior and exterior reset for vehicles that need everything.',
    expectedResults: ['Inside-out reset', 'Showroom presentation', 'Best value for neglected vehicles'],
    category: 'full',
  },
  {
    match: ['ceramic', 'coating'],
    imageKey: 'services.ceramic',
    ideal: 'Longer-term protection, deeper gloss, easier washing, and premium finish care.',
    expectedResults: ['Hydrophobic beading', 'UV & contaminant barrier', 'Easier maintenance washes'],
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
  return found ?? { ...SERVICE_PRESENTATION[0]!, expectedResults: SERVICE_PRESENTATION[0]!.expectedResults };
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
