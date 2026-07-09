'use client';

import { useState } from 'react';
import type { PublicBrandPayload } from '@/lib/brand/public-brand-types';

export function HomepageHeroBackground({
  imageUrl,
  brand,
  objectStyle,
}: {
  imageUrl: string;
  brand?: PublicBrandPayload | null;
  objectStyle?: React.CSSProperties;
}) {
  const videoUrl = brand?.heroVideoEnabled ? brand.heroVideoUrl : null;
  const poster = brand?.heroVideoPosterUrl || imageUrl;
  const [mediaReady, setMediaReady] = useState(false);

  return (
    <div className="gb-marketing-hero-bg absolute inset-0 z-0 overflow-hidden bg-black">
      <div
        className="gb-hero-scrim-dark absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(212,175,55,0.12),transparent_45%),linear-gradient(to_bottom,rgba(9,9,11,0.4),rgba(0,0,0,0.95))] transition-opacity duration-500"
        style={{ opacity: mediaReady ? 0.4 : 1 }}
        aria-hidden
      />
      <div
        className="gb-hero-scrim-light absolute inset-0 bg-[linear-gradient(to_bottom,rgba(247,246,243,0.55),rgba(255,255,255,0.88))] transition-opacity duration-500"
        aria-hidden
      />
      {videoUrl ? (
        <video
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 motion-safe:animate-[heroKenBurns_28s_ease-in-out_infinite_alternate] ${
            mediaReady ? 'opacity-45' : 'opacity-0'
          }`}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={poster}
          onLoadedData={() => setMediaReady(true)}
        >
          <source src={videoUrl} />
        </video>
      ) : imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          style={objectStyle}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          onLoad={() => setMediaReady(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 motion-safe:animate-[heroKenBurns_32s_ease-in-out_infinite_alternate] ${
            mediaReady ? 'opacity-35' : 'opacity-0'
          }`}
        />
      ) : null}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(212,175,55,0.22),transparent_38%),radial-gradient(circle_at_80%_60%,rgba(212,175,55,0.1),transparent_40%),linear-gradient(to_bottom,rgba(0,0,0,0.55),rgba(0,0,0,0.98))]" />
    </div>
  );
}
