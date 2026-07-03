'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Monitor, Smartphone, Plus, Trash, Upload, Image as ImageIcon } from 'lucide-react';
import { saveHomepageVisualsAction } from '@/app/(dashboard)/admin/gallery-messages-actions';

// Types for visuals editor
type CropConfig = {
  fit: 'cover' | 'contain';
  position: string; // 'center' | 'top' | 'bottom' | 'left' | 'right' | '50% 50%' etc.
};

type VisualSection = {
  published: boolean;
  title: string;
  image?: string;
  fit?: 'cover' | 'contain';
  position?: string;
  subtitle?: string;
  desc?: string;
  ctaText?: string;
  ctaLink?: string;
};

type ImageAlign = { x: number; y: number; zoom: number };

type Transformation = {
  id: string;
  before: string;
  after: string;
  title: string;
  caption: string;
  tags: string;
  layoutSize: 'normal' | 'wide' | 'tall';
  published: boolean;
  beforeAlign?: ImageAlign;
  afterAlign?: ImageAlign;
  previewDevice?: 'desktop' | 'tablet' | 'mobile';
};

type ProcessStep = {
  title: string;
  desc: string;
  image: string;
  fit: 'cover' | 'contain';
  position: string;
};

type HomepageVisualsConfig = {
  hero: VisualSection;
  services: VisualSection & { covers: Record<string, { image: string; fit: 'cover' | 'contain'; position: string }> };
  featuredTransformations: { published: boolean; title: string; items: Transformation[] };
  membership: VisualSection;
  fleet: VisualSection;
  process: { published: boolean; title: string; steps: ProcessStep[] };
  finalCta: VisualSection;
};

// Initial default config (fallbacks)
const defaultConfig: HomepageVisualsConfig = {
  hero: {
    published: true,
    title: 'Luxury Mobile Detailing In Austin, Texas',
    subtitle: 'Premium mobile auto care delivered to your driveway with online booking, professional service records, and showroom-level results.',
    image: 'https://images.unsplash.com/photo-1617531653520-4893f7bbf978?auto=format&fit=crop&w=1900&q=80',
    fit: 'cover',
    position: 'center',
    ctaText: 'Book Now',
    ctaLink: '/book'
  },
  services: {
    published: true,
    title: 'Premium Service Packages',
    covers: {
      'full-detail': { image: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=800&q=80', fit: 'cover', position: 'center' },
      'exterior-wash': { image: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=800&q=80', fit: 'cover', position: 'center' },
      'exterior-detail': { image: 'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=800&q=80', fit: 'cover', position: 'center' },
      'interior-detail': { image: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=800&q=80', fit: 'cover', position: 'center' },
      'ceramic-coating': { image: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=800&q=80', fit: 'cover', position: 'center' }
    }
  },
  featuredTransformations: {
    published: true,
    title: 'Featured Transformations',
    items: []
  },
  membership: {
    published: true,
    title: 'Save with recurring shine.',
    desc: 'Bronze, Silver, and Gold plans keep your vehicle protected with priority scheduling, member pricing, and a digital punch-card reward built for repeat clients.',
    image: 'https://images.unsplash.com/photo-1494976388531-dad849ce67e7?auto=format&fit=crop&w=1200&q=80',
    fit: 'cover',
    position: 'center',
    ctaText: 'View Memberships',
    ctaLink: '/memberships'
  },
  fleet: {
    published: true,
    title: 'Fleet & Corporate Vehicle Programs',
    desc: 'We offer customized mobile auto detailing for commercial fleets, dealership inventories, corporate parks, and luxury shuttle companies with volume discount tiers.',
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692761b13?auto=format&fit=crop&w=1200&q=80',
    fit: 'cover',
    position: 'center',
    ctaText: 'Fleet Inquiries',
    ctaLink: '/fleet'
  },
  process: {
    published: true,
    title: 'The Gloss Boss Professional Process',
    steps: [
      { title: 'Decontamination & Prep', desc: 'Thorough snow foam hand wash, iron removal, and clay bar treatment to create a perfectly clean slate.', image: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=600&q=80', fit: 'cover', position: 'center' },
      { title: 'Correction & Enhancement', desc: 'Precision machine compounding and polishing to eliminate swirls, oxidation, light scratches and bring out maximum depth.', image: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=600&q=80', fit: 'cover', position: 'center' },
      { title: 'Showroom Lock-In Protection', desc: 'Carnauba waxing, paint sealants, or state of the art ceramic coatings applied to lock in deep reflection and chemical resistance.', image: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=600&q=80', fit: 'cover', position: 'center' }
    ]
  },
  finalCta: {
    published: true,
    title: 'Ready for Showroom Gloss?',
    subtitle: 'Book your premium mobile service in seconds. Pay a 30% secure Stripe deposit, sign on-site, and enjoy ultimate convenience.',
    image: 'https://images.unsplash.com/photo-1617531653520-4893f7bbf978?auto=format&fit=crop&w=1900&q=80',
    fit: 'cover',
    position: 'center',
    ctaText: 'Schedule Now',
    ctaLink: '/book'
  }
};

function isDefaultTransformationPlaceholder(item: any) {
  const id = String(item?.id ?? '').trim().toLowerCase();
  const title = String(item?.title ?? '').trim().toLowerCase();
  const before = String(item?.before ?? '');
  const after = String(item?.after ?? '');
  return (
    id === 'tf-1' ||
    title === 'paint correction & ceramic coat' ||
    (before.includes('images.unsplash.com/photo-1503376780353') && after.includes('images.unsplash.com/photo-1549317336'))
  );
}

export function HomepageVisualsManager({ initialJson }: { initialJson?: any }) {
  const router = useRouter();
  const [config, setConfig] = useState<HomepageVisualsConfig>(defaultConfig);
  const [activeTab, setActiveTab] = useState<'hero' | 'services' | 'featured' | 'membership' | 'fleet' | 'process' | 'finalCta'>('hero');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isBusy, setIsBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (initialJson) {
      try {
        const parsed = typeof initialJson === 'string' ? JSON.parse(initialJson) : initialJson;
        // Merge with defaults to ensure all properties exist
        const merged: HomepageVisualsConfig = {
          hero: { ...defaultConfig.hero, ...parsed.hero },
          services: {
            ...defaultConfig.services,
            ...parsed.services,
            covers: { ...defaultConfig.services.covers, ...(parsed.services?.covers ?? {}) }
          },
          featuredTransformations: {
            ...defaultConfig.featuredTransformations,
            ...parsed.featuredTransformations,
            items: Array.isArray(parsed.featuredTransformations?.items)
              ? parsed.featuredTransformations.items.filter((item: any) => !isDefaultTransformationPlaceholder(item))
              : []
          },
          membership: { ...defaultConfig.membership, ...parsed.membership },
          fleet: { ...defaultConfig.fleet, ...parsed.fleet },
          process: {
            ...defaultConfig.process,
            ...parsed.process,
            steps: parsed.process?.steps ?? defaultConfig.process.steps
          },
          finalCta: { ...defaultConfig.finalCta, ...parsed.finalCta }
        };
        setConfig(merged);
      } catch (e) {
        console.error('Failed to parse visuals configuration', e);
      }
    }
  }, [initialJson]);

  const updateSectionField = (section: keyof HomepageVisualsConfig, field: string, value: any) => {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const updateServiceCover = (serviceSlug: string, field: 'image' | 'fit' | 'position', value: string) => {
    setConfig((prev) => {
      const covers = { ...prev.services.covers };
      covers[serviceSlug] = {
        ...covers[serviceSlug],
        [field]: value
      };
      return {
        ...prev,
        services: {
          ...prev.services,
          covers
        }
      };
    });
  };

  const updateTransformation = (index: number, field: keyof Transformation, value: any) => {
    setConfig((prev) => {
      const items = [...prev.featuredTransformations.items];
      items[index] = {
        ...items[index],
        [field]: value
      };
      return {
        ...prev,
        featuredTransformations: {
          ...prev.featuredTransformations,
          items
        }
      };
    });
  };

  const removeTransformation = (index: number) => {
    setConfig((prev) => {
      const items = prev.featuredTransformations.items.filter((_, i) => i !== index);
      return {
        ...prev,
        featuredTransformations: {
          ...prev.featuredTransformations,
          items
        }
      };
    });
  };

  const addTransformation = () => {
    const newItem: Transformation = {
      id: `tf-${Date.now()}`,
      before: 'https://images.unsplash.com/photo-1503376780353-7e6692761b13?auto=format&fit=crop&w=1200&q=80',
      after: 'https://images.unsplash.com/photo-1549317336-206569e8475c?auto=format&fit=crop&w=1200&q=80',
      title: 'New Transformation Paint Enhancement',
      caption: 'Professional wash, polish and sealant restoration.',
      tags: 'Polishing, Paint Sealant',
      layoutSize: 'normal',
      published: true
    };
    setConfig((prev) => ({
      ...prev,
      featuredTransformations: {
        ...prev.featuredTransformations,
        items: [...prev.featuredTransformations.items, newItem]
      }
    }));
  };

  const updateProcessStep = (index: number, field: keyof ProcessStep, value: any) => {
    setConfig((prev) => {
      const steps = [...prev.process.steps];
      steps[index] = {
        ...steps[index],
        [field]: value
      };
      return {
        ...prev,
        process: {
          ...prev.process,
          steps
        }
      };
    });
  };

  const handleSave = async () => {
    setIsBusy(true);
    setSaveStatus(null);
    try {
      const formData = new FormData();
      formData.set('json', JSON.stringify(config));
      
      await saveHomepageVisualsAction(formData);
      
      setSaveStatus({
        kind: 'ok',
        text: 'Homepage visuals configured and saved successfully. The changes will be visible on the homepage.'
      });
      router.refresh();
    } catch (err) {
      setSaveStatus({
        kind: 'err',
        text: 'Failed to save visuals settings. Please verify you have admin permissions.'
      });
    } finally {
      setIsBusy(false);
    }
  };

  const uploadVisualFile = async (file: File, slot: string, onUploaded: (url: string) => void) => {
    setUploadStatus(null);
    const fd = new FormData();
    fd.set('file', file);
    fd.set('slot', slot);
    try {
      const res = await fetch('/api/admin/homepage-visual-upload', { method: 'POST', body: fd });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data.ok || !data.url) {
        setUploadStatus({ kind: 'err', text: data.error || `Upload failed (${res.status}).` });
        return;
      }
      onUploaded(data.url);
      setUploadStatus({ kind: 'ok', text: 'Image uploaded. Save Visuals to publish it on the homepage.' });
    } catch (err) {
      setUploadStatus({ kind: 'err', text: err instanceof Error ? err.message : 'Upload failed.' });
    }
  };

  const UploadControl = ({ slot, onUploaded }: { slot: string; onUploaded: (url: string) => void }) => (
    <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gold-soft hover:bg-gold/10">
      <Upload className="h-3.5 w-3.5" />
      Upload from device
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) void uploadVisualFile(file, slot, onUploaded);
        }}
      />
    </label>
  );

  const configKeyMap: Record<'hero' | 'services' | 'featured' | 'membership' | 'fleet' | 'process' | 'finalCta', keyof HomepageVisualsConfig> = {
    hero: 'hero',
    services: 'services',
    featured: 'featuredTransformations',
    membership: 'membership',
    fleet: 'fleet',
    process: 'process',
    finalCta: 'finalCta'
  };

  const activeSection = config[configKeyMap[activeTab]] as any;
  const currentImageUrl = activeSection?.image || activeSection?.bgImage || '';
  const currentFit = activeSection?.fit || 'cover';
  const currentPosition = activeSection?.position || 'center';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-gold-soft" /> Homepage Visuals Manager
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Replaces placeholder assets. Control background alignments, aspect crops, and publish states.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPreviewMode('desktop')}
            className={`p-2 rounded-lg border transition ${previewMode === 'desktop' ? 'border-gold bg-gold/10 text-gold-soft' : 'border-white/10 text-zinc-400'}`}
            title="Desktop Preview Aspect"
          >
            <Monitor className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode('mobile')}
            className={`p-2 rounded-lg border transition ${previewMode === 'mobile' ? 'border-gold bg-gold/10 text-gold-soft' : 'border-white/10 text-zinc-400'}`}
            title="Mobile Preview Aspect"
          >
            <Smartphone className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleSave}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black hover:brightness-110 disabled:opacity-50 transition"
          >
            <Save className="h-4 w-4" /> {isBusy ? 'Saving...' : 'Save Visuals'}
          </button>
        </div>
      </div>

      {saveStatus && (
        <div className={`p-4 rounded-xl border ${saveStatus.kind === 'ok' ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' : 'border-rose-500/30 bg-rose-500/5 text-rose-300'}`}>
          <p className="text-sm font-bold">{saveStatus.text}</p>
        </div>
      )}

      {uploadStatus && (
        <div className={`p-4 rounded-xl border ${uploadStatus.kind === 'ok' ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' : 'border-rose-500/30 bg-rose-500/5 text-rose-300'}`}>
          <p className="text-sm font-bold">{uploadStatus.text}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
        {/* Navigation Sidebar */}
        <div className="flex flex-col gap-1 border-r border-white/5 pr-4">
          {[
            { id: 'hero', label: '1. Hero Section' },
            { id: 'services', label: '2. Services Images' },
            { id: 'featured', label: '3. Transformations' },
            { id: 'membership', label: '4. Memberships Cover' },
            { id: 'fleet', label: '5. Fleet Cover' },
            { id: 'process', label: '6. Process Steps' },
            { id: 'finalCta', label: '7. Final CTA Section' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id as any)}
              className={`text-left px-4 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition ${
                activeTab === item.id
                  ? 'bg-gold text-black shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Content & Previews Editor */}
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-base font-bold uppercase tracking-wide text-zinc-300">
              Editing: {activeTab.toUpperCase()} settings
            </h3>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={activeSection?.published !== false}
                onChange={(e) => updateSectionField(configKeyMap[activeTab], 'published', e.target.checked)}
                className="rounded border-zinc-700 bg-black text-gold focus:ring-gold"
              />
              Publish this section on homepage
            </label>
          </div>

          {/* TAB EDITORS */}
          {activeTab === 'hero' && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Hero Main Title</label>
                  <input
                    type="text"
                    value={config.hero.title}
                    onChange={(e) => updateSectionField('hero', 'title', e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white focus:border-gold focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Hero Subtitle</label>
                  <textarea
                    value={config.hero.subtitle}
                    onChange={(e) => updateSectionField('hero', 'subtitle', e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white focus:border-gold focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">CTA Button Text</label>
                    <input
                      type="text"
                      value={config.hero.ctaText}
                      onChange={(e) => updateSectionField('hero', 'ctaText', e.target.value)}
                      className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">CTA Link</label>
                    <input
                      type="text"
                      value={config.hero.ctaLink}
                      onChange={(e) => updateSectionField('hero', 'ctaLink', e.target.value)}
                      className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Background Image URL</label>
                  <input
                    type="text"
                    value={config.hero.image}
                    onChange={(e) => updateSectionField('hero', 'image', e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                  />
                  <UploadControl slot="hero" onUploaded={(url) => updateSectionField('hero', 'image', url)} />
                </div>
                {/* Crop alignment tools */}
                <div className="grid grid-cols-2 gap-3 bg-zinc-950 p-4 rounded-2xl border border-white/5">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-zinc-500 mb-1">Image Sizing</label>
                    <select
                      value={config.hero.fit || 'cover'}
                      onChange={(e) => updateSectionField('hero', 'fit', e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                    >
                      <option value="cover">Cover (Fill aspect)</option>
                      <option value="contain">Contain (Full image)</option>
                    </select>
                    <p className="mt-1 text-[9px] leading-snug text-zinc-500">Cover fills the card and crops edges. Contain shows the full image with possible empty space.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-zinc-500 mb-1">Align Position</label>
                    <select
                      value={config.hero.position || 'center'}
                      onChange={(e) => updateSectionField('hero', 'position', e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                    >
                      <option value="center">Center</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                    <p className="mt-1 text-[9px] leading-snug text-zinc-500">Center/top/bottom choose the focal point when Cover crops the photo.</p>
                  </div>
                </div>
              </div>

              {/* Crop Preview Panel */}
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Cropped Alignment Preview</p>
                <div className="relative border border-gold/20 rounded-3xl overflow-hidden bg-black/60 shadow-inner flex items-center justify-center p-4 min-h-[300px]">
                  <div
                    className={`transition-all duration-300 relative rounded-2xl border border-white/10 overflow-hidden shadow-2xl ${
                      previewMode === 'desktop' ? 'w-full aspect-[16/9]' : 'h-[280px] aspect-[9/16]'
                    }`}
                  >
                    <img
                      src={config.hero.image}
                      alt="Crop Align Preview"
                      style={{
                        objectFit: config.hero.fit as any,
                        objectPosition: config.hero.position || 'center'
                      }}
                      className="w-full h-full"
                    />
                    <div className="absolute inset-0 bg-black/45 flex flex-col justify-end p-4 text-left">
                      <p className="text-[8px] font-black uppercase tracking-widest text-gold-soft">PREVIEW MODE</p>
                      <h4 className="text-sm font-black text-white uppercase tracking-tight line-clamp-1">{config.hero.title}</h4>
                      <p className="text-[10px] text-zinc-300 line-clamp-2 mt-0.5">{config.hero.subtitle}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'services' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase text-zinc-400">Services Title</label>
                <input
                  type="text"
                  value={config.services.title}
                  onChange={(e) => updateSectionField('services', 'title', e.target.value)}
                  className="w-full max-w-md rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { slug: 'exterior-wash', label: 'Exterior Wash' },
                  { slug: 'exterior-detail', label: 'Exterior Detail' },
                  { slug: 'interior-detail', label: 'Interior Detail' },
                  { slug: 'full-detail', label: 'Full Detail Package' },
                  { slug: 'ceramic-coating', label: 'Ceramic Coating' },
                ].map((svc) => {
                  const cover = config.services.covers[svc.slug] || { image: '', fit: 'cover', position: 'center' };
                  return (
                    <div key={svc.slug} className="rounded-2xl border border-white/5 bg-zinc-950 p-4 grid gap-4 sm:grid-cols-[120px_1fr]">
                      <div className="relative rounded-xl overflow-hidden aspect-square border border-white/10">
                        <img
                          src={cover.image}
                          alt={svc.label}
                          style={{
                            objectFit: cover.fit as any,
                            objectPosition: cover.position
                          }}
                          className="w-full h-full"
                        />
                      </div>
                      <div className="space-y-3">
                        <p className="text-xs font-black uppercase tracking-wider text-gold-soft">{svc.label}</p>
                        <input
                          type="text"
                          value={cover.image}
                          onChange={(e) => updateServiceCover(svc.slug, 'image', e.target.value)}
                          placeholder="Image URL"
                          className="w-full rounded-lg border border-zinc-850 bg-black px-3 py-1.5 text-xs text-white"
                        />
                        <UploadControl slot={`service-${svc.slug}`} onUploaded={(url) => updateServiceCover(svc.slug, 'image', url)} />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={cover.fit}
                            onChange={(e) => updateServiceCover(svc.slug, 'fit', e.target.value as any)}
                            className="rounded-lg border border-zinc-850 bg-black px-2 py-1 text-[10px] text-white"
                          >
                            <option value="cover">Cover</option>
                            <option value="contain">Contain</option>
                          </select>
                          <select
                            value={cover.position}
                            onChange={(e) => updateServiceCover(svc.slug, 'position', e.target.value)}
                            className="rounded-lg border border-zinc-850 bg-black px-2 py-1 text-[10px] text-white"
                          >
                            <option value="center">Center</option>
                            <option value="top">Top</option>
                            <option value="bottom">Bottom</option>
                          </select>
                        </div>
                        <p className="text-[9px] leading-snug text-zinc-500">Preview uses the exact same fit and position the homepage service card uses.</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'featured' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase text-zinc-400">Featured Transformations Title</label>
                  <input
                    type="text"
                    value={config.featuredTransformations.title}
                    onChange={(e) => updateSectionField('featuredTransformations', 'title', e.target.value)}
                    className="w-full max-w-sm rounded-xl border border-zinc-800 bg-black px-4 py-2 text-sm text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={addTransformation}
                  className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-gold-soft border border-gold/30 rounded-lg px-3 py-2 bg-gold/5"
                >
                  <Plus className="h-3 w-3" /> Add Transformation Card
                </button>
              </div>

              <div className="space-y-4">
                {config.featuredTransformations.items.map((item, idx) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-zinc-950 p-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-[10px] font-black text-zinc-400">CARD #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeTransformation(idx)}
                        className="text-[10px] font-bold text-rose-300 hover:text-rose-100 flex items-center gap-1"
                      >
                        <Trash className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Card Title</label>
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => updateTransformation(idx, 'title', e.target.value)}
                            className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Caption / Description</label>
                          <textarea
                            value={item.caption}
                            onChange={(e) => updateTransformation(idx, 'caption', e.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Tags (Comma-separated)</label>
                          <input
                            type="text"
                            value={item.tags}
                            onChange={(e) => updateTransformation(idx, 'tags', e.target.value)}
                            className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Layout Size</label>
                            <select
                              value={item.layoutSize}
                              onChange={(e) => updateTransformation(idx, 'layoutSize', e.target.value as any)}
                              className="w-full rounded-lg border border-zinc-850 bg-black px-2 py-1 text-xs text-white"
                            >
                              <option value="normal">Normal (Square)</option>
                              <option value="wide">Wide (2 Columns)</option>
                              <option value="tall">Tall (2 Rows)</option>
                            </select>
                          </div>
                          <div className="flex items-end pb-1">
                            <label className="flex items-center gap-2 text-[10px] text-zinc-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.published}
                                onChange={(e) => updateTransformation(idx, 'published', e.target.checked)}
                                className="rounded border-zinc-700 bg-black text-gold"
                              />
                              Show card
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Before Image URL</label>
                          <input
                            type="text"
                            value={item.before}
                            onChange={(e) => updateTransformation(idx, 'before', e.target.value)}
                            className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                          />
                          <UploadControl slot={`featured-${item.id}-before`} onUploaded={(url) => updateTransformation(idx, 'before', url)} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">After Image URL</label>
                          <input
                            type="text"
                            value={item.after}
                            onChange={(e) => updateTransformation(idx, 'after', e.target.value)}
                            className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                          />
                          <UploadControl slot={`featured-${item.id}-after`} onUploaded={(url) => updateTransformation(idx, 'after', url)} />
                        </div>

                        {/* Alignment editor + device preview */}
                        <div className="space-y-3 border border-gold/15 p-3 bg-black/40 rounded-xl">
                          <div className="flex gap-2">
                            {(['desktop', 'tablet', 'mobile'] as const).map((device) => (
                              <button
                                key={device}
                                type="button"
                                onClick={() => updateTransformation(idx, 'previewDevice', device)}
                                className={`rounded-lg px-2 py-1 text-[9px] font-black uppercase ${item.previewDevice === device || (!item.previewDevice && device === 'desktop') ? 'bg-gold/20 text-gold-soft' : 'text-zinc-500'}`}
                              >
                                {device}
                              </button>
                            ))}
                          </div>
                          {(['before', 'after'] as const).map((side) => {
                            const align = (side === 'before' ? item.beforeAlign : item.afterAlign) ?? { x: 50, y: 50, zoom: 1 };
                            const url = side === 'before' ? item.before : item.after;
                            const previewWidth = item.previewDevice === 'mobile' ? 'max-w-[140px]' : item.previewDevice === 'tablet' ? 'max-w-[200px]' : 'max-w-full';
                            return (
                              <div key={side}>
                                <p className="text-[8px] font-bold text-zinc-500 uppercase mb-1">{side} alignment</p>
                                <div className={`grid gap-2 ${previewWidth}`}>
                                  <div className="relative rounded overflow-hidden aspect-[4/3] border border-white/10">
                                    <img
                                      src={url}
                                      alt={side}
                                      className="w-full h-full object-cover"
                                      style={{ objectPosition: `${align.x}% ${align.y}%`, transform: `scale(${align.zoom})` }}
                                    />
                                  </div>
                                  <input type="range" min={0} max={100} value={align.x} onChange={(e) => updateTransformation(idx, side === 'before' ? 'beforeAlign' : 'afterAlign', { ...align, x: Number(e.target.value) })} className="w-full accent-gold" />
                                  <input type="range" min={0} max={100} value={align.y} onChange={(e) => updateTransformation(idx, side === 'before' ? 'beforeAlign' : 'afterAlign', { ...align, y: Number(e.target.value) })} className="w-full accent-gold" />
                                  <input type="range" min={1} max={2} step={0.1} value={align.zoom} onChange={(e) => updateTransformation(idx, side === 'before' ? 'beforeAlign' : 'afterAlign', { ...align, zoom: Number(e.target.value) })} className="w-full accent-gold" />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Staggered aspect ratio tester */}
                        <div className="grid grid-cols-2 gap-2 border border-white/5 p-2 bg-black/40 rounded-xl">
                          <div>
                            <p className="text-[8px] font-bold text-zinc-500 uppercase">Before</p>
                            <div className="relative rounded overflow-hidden aspect-[4/3] border border-white/10 mt-1">
                              <img src={item.before} alt="Before" className="w-full h-full object-cover" />
                            </div>
                          </div>
                          <div>
                            <p className="text-[8px] font-bold text-zinc-500 uppercase">After</p>
                            <div className="relative rounded overflow-hidden aspect-[4/3] border border-white/10 mt-1">
                              <img src={item.after} alt="After" className="w-full h-full object-cover" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'membership' && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Memberships Banner Title</label>
                  <input
                    type="text"
                    value={config.membership.title}
                    onChange={(e) => updateSectionField('membership', 'title', e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Description / Blurb</label>
                  <textarea
                    value={config.membership.desc}
                    onChange={(e) => updateSectionField('membership', 'desc', e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Cover Image URL</label>
                  <input
                    type="text"
                    value={config.membership.image}
                    onChange={(e) => updateSectionField('membership', 'image', e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                  />
                  <UploadControl slot="membership-cover" onUploaded={(url) => updateSectionField('membership', 'image', url)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-zinc-500 mb-1">Image Sizing</label>
                    <select
                      value={config.membership.fit || 'cover'}
                      onChange={(e) => updateSectionField('membership', 'fit', e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                    >
                      <option value="cover">Cover</option>
                      <option value="contain">Contain</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-zinc-500 mb-1">Align Position</label>
                    <select
                      value={config.membership.position || 'center'}
                      onChange={(e) => updateSectionField('membership', 'position', e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                    >
                      <option value="center">Center</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Crop Preview */}
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Cropped Alignment Preview</p>
                <div className="relative border border-gold/20 rounded-3xl overflow-hidden bg-black/60 shadow-inner flex items-center justify-center p-4 min-h-[300px]">
                  <div
                    className={`transition-all duration-300 relative rounded-2xl border border-white/10 overflow-hidden shadow-2xl ${
                      previewMode === 'desktop' ? 'w-full aspect-[16/9]' : 'h-[280px] aspect-[9/16]'
                    }`}
                  >
                    <img
                      src={config.membership.image}
                      alt="Crop Align Preview"
                      style={{
                        objectFit: config.membership.fit as any,
                        objectPosition: config.membership.position || 'center'
                      }}
                      className="w-full h-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'fleet' && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Fleet Banner Title</label>
                  <input
                    type="text"
                    value={config.fleet.title}
                    onChange={(e) => updateSectionField('fleet', 'title', e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Fleet Description</label>
                  <textarea
                    value={config.fleet.desc}
                    onChange={(e) => updateSectionField('fleet', 'desc', e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Fleet Cover Image URL</label>
                  <input
                    type="text"
                    value={config.fleet.image}
                    onChange={(e) => updateSectionField('fleet', 'image', e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                  />
                  <UploadControl slot="fleet-cover" onUploaded={(url) => updateSectionField('fleet', 'image', url)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-zinc-500 mb-1">Image Sizing</label>
                    <select
                      value={config.fleet.fit || 'cover'}
                      onChange={(e) => updateSectionField('fleet', 'fit', e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                    >
                      <option value="cover">Cover</option>
                      <option value="contain">Contain</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-zinc-500 mb-1">Align Position</label>
                    <select
                      value={config.fleet.position || 'center'}
                      onChange={(e) => updateSectionField('fleet', 'position', e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                    >
                      <option value="center">Center</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Crop Preview */}
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Cropped Alignment Preview</p>
                <div className="relative border border-gold/20 rounded-3xl overflow-hidden bg-black/60 shadow-inner flex items-center justify-center p-4 min-h-[300px]">
                  <div
                    className={`transition-all duration-300 relative rounded-2xl border border-white/10 overflow-hidden shadow-2xl ${
                      previewMode === 'desktop' ? 'w-full aspect-[16/9]' : 'h-[280px] aspect-[9/16]'
                    }`}
                  >
                    <img
                      src={config.fleet.image}
                      alt="Crop Align Preview"
                      style={{
                        objectFit: config.fleet.fit as any,
                        objectPosition: config.fleet.position || 'center'
                      }}
                      className="w-full h-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'process' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase text-zinc-400">Process Section Main Title</label>
                <input
                  type="text"
                  value={config.process.title}
                  onChange={(e) => updateSectionField('process', 'title', e.target.value)}
                  className="w-full max-w-md rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                />
              </div>

              <div className="space-y-6">
                {config.process.steps.map((step, idx) => (
                  <div key={idx} className="rounded-2xl border border-white/10 bg-zinc-950 p-4 space-y-4">
                    <p className="text-xs font-black uppercase text-gold-soft border-b border-white/5 pb-2">
                      STEP {idx + 1}: {step.title || 'Untitled'}
                    </p>
                    <div className="grid gap-4 sm:grid-cols-[130px_1fr]">
                      <div className="relative rounded-xl overflow-hidden aspect-[4/3] border border-white/10 self-start">
                        <img
                          src={step.image}
                          alt={step.title}
                          style={{
                            objectFit: step.fit,
                            objectPosition: step.position
                          }}
                          className="w-full h-full"
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Step Title</label>
                            <input
                              type="text"
                              value={step.title}
                              onChange={(e) => updateProcessStep(idx, 'title', e.target.value)}
                              className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Step Details</label>
                            <textarea
                              value={step.desc}
                              onChange={(e) => updateProcessStep(idx, 'desc', e.target.value)}
                              rows={3}
                              className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Image URL</label>
                            <input
                              type="text"
                              value={step.image}
                              onChange={(e) => updateProcessStep(idx, 'image', e.target.value)}
                              className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                            />
                            <UploadControl slot={`process-step-${idx + 1}`} onUploaded={(url) => updateProcessStep(idx, 'image', url)} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[9px] font-bold text-zinc-500 uppercase">Fit</label>
                              <select
                                value={step.fit}
                                onChange={(e) => updateProcessStep(idx, 'fit', e.target.value as any)}
                                className="w-full rounded-lg border border-zinc-850 bg-black px-2 py-1 text-[10px] text-white"
                              >
                                <option value="cover">Cover</option>
                                <option value="contain">Contain</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-zinc-500 uppercase">Position</label>
                              <select
                                value={step.position}
                                onChange={(e) => updateProcessStep(idx, 'position', e.target.value)}
                                className="w-full rounded-lg border border-zinc-850 bg-black px-2 py-1 text-[10px] text-white"
                              >
                                <option value="center">Center</option>
                                <option value="top">Top</option>
                                <option value="bottom">Bottom</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'finalCta' && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Final CTA Heading</label>
                  <input
                    type="text"
                    value={config.finalCta.title}
                    onChange={(e) => updateSectionField('finalCta', 'title', e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Subtitle / Supporting Copy</label>
                  <textarea
                    value={config.finalCta.subtitle}
                    onChange={(e) => updateSectionField('finalCta', 'subtitle', e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Button Text</label>
                    <input
                      type="text"
                      value={config.finalCta.ctaText}
                      onChange={(e) => updateSectionField('finalCta', 'ctaText', e.target.value)}
                      className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Button Link</label>
                    <input
                      type="text"
                      value={config.finalCta.ctaLink}
                      onChange={(e) => updateSectionField('finalCta', 'ctaLink', e.target.value)}
                      className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Background Image URL</label>
                  <input
                    type="text"
                    value={config.finalCta.image}
                    onChange={(e) => updateSectionField('finalCta', 'image', e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white"
                  />
                  <UploadControl slot="final-cta" onUploaded={(url) => updateSectionField('finalCta', 'image', url)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-zinc-500 mb-1">Image Sizing</label>
                    <select
                      value={config.finalCta.fit || 'cover'}
                      onChange={(e) => updateSectionField('finalCta', 'fit', e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                    >
                      <option value="cover">Cover</option>
                      <option value="contain">Contain</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-zinc-500 mb-1">Align Position</label>
                    <select
                      value={config.finalCta.position || 'center'}
                      onChange={(e) => updateSectionField('finalCta', 'position', e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white"
                    >
                      <option value="center">Center</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Crop Preview */}
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Cropped Alignment Preview</p>
                <div className="relative border border-gold/20 rounded-3xl overflow-hidden bg-black/60 shadow-inner flex items-center justify-center p-4 min-h-[300px]">
                  <div
                    className={`transition-all duration-300 relative rounded-2xl border border-white/10 overflow-hidden shadow-2xl ${
                      previewMode === 'desktop' ? 'w-full aspect-[16/9]' : 'h-[280px] aspect-[9/16]'
                    }`}
                  >
                    <img
                      src={config.finalCta.image}
                      alt="Crop Align Preview"
                      style={{
                        objectFit: config.finalCta.fit as any,
                        objectPosition: config.finalCta.position || 'center'
                      }}
                      className="w-full h-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
