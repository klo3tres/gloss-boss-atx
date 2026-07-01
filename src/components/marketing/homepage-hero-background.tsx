'use client';

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

  return (
    <div className='absolute inset-0 z-0'>
      {videoUrl ? (
        <video
          className='absolute inset-0 h-full w-full object-cover opacity-45 motion-safe:animate-[heroKenBurns_28s_ease-in-out_infinite_alternate]'
          autoPlay
          muted
          loop
          playsInline
          preload='metadata'
          poster={poster}
        >
          <source src={videoUrl} />
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=''
          style={objectStyle}
          className='absolute inset-0 h-full w-full opacity-35 object-cover motion-safe:animate-[heroKenBurns_32s_ease-in-out_infinite_alternate]'
        />
      )}
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(212,175,55,0.22),transparent_38%),radial-gradient(circle_at_80%_60%,rgba(212,175,55,0.1),transparent_40%),linear-gradient(to_bottom,rgba(0,0,0,0.55),rgba(0,0,0,0.98))]' />
    </div>
  );
}
