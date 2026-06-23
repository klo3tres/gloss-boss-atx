'use client';

import { useEffect, useRef, useState } from 'react';
import type { MapProviderId } from '@/lib/integrations/maps-discovery-status';
import type { TitanProspect } from '@/lib/titan/lead-radar';

type MapMarker = { id: string; name: string; lat: number; lng: number };

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.id = id;
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${id}`));
    document.head.appendChild(s);
  });
}

function LeadRadarGoogleMap({
  apiKey,
  center,
  markers,
}: {
  apiKey: string;
  center: { lat: number; lng: number };
  markers: MapMarker[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadScript(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`, 'google-maps-js');
      if (cancelled || !ref.current) return;
      const g = (window as unknown as { google?: { maps: { Map: new (el: HTMLElement, o: object) => unknown; Marker: new (o: object) => unknown } } }).google;
      if (!g?.maps) return;
      const map = new g.maps.Map(ref.current, {
        center,
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      for (const m of markers) {
        new g.maps.Marker({ map, position: { lat: m.lat, lng: m.lng }, title: m.name });
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiKey, center, markers]);

  return <div ref={ref} className="h-72 w-full rounded-2xl border border-white/10 bg-zinc-900" />;
}

function LeadRadarAppleMap({ token, center, markers }: { token: string; center: { lat: number; lng: number }; markers: MapMarker[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadScript('https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js', 'apple-mapkit-js');
      if (cancelled || !ref.current) return;
      const mk = (window as unknown as {
        mapkit?: {
          init: (o: { authorizationCallback: (done: (t: string) => void) => void }) => void;
          Map: new (el: HTMLElement, o: object) => { addAnnotation: (a: unknown) => void };
          Coordinate: new (lat: number, lng: number) => unknown;
          CoordinateRegion: new (c: unknown, s: unknown) => unknown;
          CoordinateSpan: new (lat: number, lng: number) => unknown;
          MarkerAnnotation: new (c: unknown, o: { title: string }) => unknown;
        };
      }).mapkit;
      if (!mk) return;
      mk.init({ authorizationCallback: (done) => done(token) });
      const map = new mk.Map(ref.current, {
        center: new mk.Coordinate(center.lat, center.lng),
        region: new mk.CoordinateRegion(
          new mk.Coordinate(center.lat, center.lng),
          new mk.CoordinateSpan(0.15, 0.15),
        ),
      });
      for (const m of markers) {
        map.addAnnotation(new mk.MarkerAnnotation(new mk.Coordinate(m.lat, m.lng), { title: m.name }));
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, center, markers]);

  return <div ref={ref} className="h-72 w-full rounded-2xl border border-white/10 bg-zinc-900" />;
}

export function LeadRadarMapView({
  prospects,
  mapProvider,
  googleMapsKey,
  appleMapKitToken,
  businessCenter,
}: {
  prospects: Array<TitanProspect & { lat?: number | null; lng?: number | null }>;
  mapProvider: MapProviderId;
  googleMapsKey: string | null;
  appleMapKitToken: string | null;
  businessCenter: { lat: number; lng: number } | null;
}) {
  const [view, setView] = useState<'list' | 'map'>('list');

  const markers: MapMarker[] = prospects
    .filter((p) => p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => ({ id: p.id, name: p.companyName, lat: p.lat as number, lng: p.lng as number }));

  const canMap =
    markers.length > 0 &&
    ((mapProvider === 'google_maps' && googleMapsKey) || (mapProvider === 'apple_mapkit' && appleMapKitToken));

  const center = businessCenter ?? (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : null);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setView('list')}
          className={`rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase ${view === 'list' ? 'border-blue-500/40 bg-blue-500/10 text-blue-200' : 'border-white/10 text-zinc-500'}`}
        >
          List
        </button>
        <button
          type="button"
          disabled={!canMap}
          onClick={() => setView('map')}
          title={canMap ? 'Show map view' : 'Connect Google Maps or Apple MapKit and ensure prospects have coordinates'}
          className={`rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase disabled:cursor-not-allowed disabled:opacity-40 ${view === 'map' ? 'border-blue-500/40 bg-blue-500/10 text-blue-200' : 'border-white/10 text-zinc-500'}`}
        >
          Map
        </button>
        {!canMap ? (
          <span className="text-[10px] text-zinc-600">
            {mapProvider === 'list_only'
              ? 'List-only mode — map view disabled in settings.'
              : 'Map view needs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY or APPLE_MAPKIT_JS_TOKEN.'}
          </span>
        ) : null}
      </div>

      {view === 'map' && center && canMap ? (
        mapProvider === 'apple_mapkit' && appleMapKitToken ? (
          <LeadRadarAppleMap token={appleMapKitToken} center={center} markers={markers} />
        ) : googleMapsKey ? (
          <LeadRadarGoogleMap apiKey={googleMapsKey} center={center} markers={markers} />
        ) : null
      ) : null}
    </div>
  );
}
