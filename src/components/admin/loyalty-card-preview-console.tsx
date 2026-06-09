'use client';

import { useState } from 'react';
import { LoyaltyCard3D } from '@/components/dashboard/loyalty-card-3d';

interface LoyaltyCardPreviewConsoleProps {
  design: {
    id: string;
    name: string;
    tier: string;
    front_image_url?: string | null;
    back_image_url?: string | null;
  };
}

export function LoyaltyCardPreviewConsole({ design }: LoyaltyCardPreviewConsoleProps) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [previewStamps, setPreviewStamps] = useState<number>(0);
  const [rewardReady, setRewardReady] = useState<boolean>(false);

  const handleSelectPunches = (punches: number) => {
    setPreviewStamps(punches);
    setRewardReady(punches === 6); // 6th slot is free reward
    setSide('back');
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/45 p-4 space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-black uppercase tracking-wider text-gold-soft">
          Artwork Tester Console
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setSide('front')}
            className={`rounded px-2 py-0.5 text-[9px] font-black uppercase transition-colors ${
              side === 'front' ? 'bg-gold text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            Front
          </button>
          <button
            type="button"
            onClick={() => setSide('back')}
            className={`rounded px-2 py-0.5 text-[9px] font-black uppercase transition-colors ${
              side === 'back' ? 'bg-gold text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            Back
          </button>
        </div>
      </div>

      {/* Interactive Card Render */}
      <div className="flex justify-center py-2">
        <LoyaltyCard3D
          activeCardDesign={design}
          stampsCount={0}
          forceState={side}
          forceStamps={previewStamps}
          forceRewardReady={rewardReady}
          className="max-w-[320px] aspect-[3.5/2]"
        />
      </div>

      {/* Interactive Controls */}
      <div className="border-t border-white/5 pt-3">
        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide mb-1.5">Test punch overlays:</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => handleSelectPunches(0)}
            className={`rounded px-2 py-1 text-[9px] font-bold transition ${
              previewStamps === 0 && !rewardReady ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            0 Punches
          </button>
          <button
            type="button"
            onClick={() => handleSelectPunches(3)}
            className={`rounded px-2 py-1 text-[9px] font-bold transition ${
              previewStamps === 3 ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            3 Punches
          </button>
          <button
            type="button"
            onClick={() => handleSelectPunches(6)}
            className={`rounded px-2 py-1 text-[9px] font-bold transition ${
              rewardReady ? 'bg-emerald-600 text-white animate-pulse' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            Reward Ready
          </button>
        </div>
      </div>
    </div>
  );
}
