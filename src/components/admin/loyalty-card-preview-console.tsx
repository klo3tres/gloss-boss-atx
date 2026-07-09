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

const PREVIEW_STATES = [
  { label: '0 stamps', stamps: 0, reward: false },
  { label: '1 stamp', stamps: 1, reward: false },
  { label: '2 stamps', stamps: 2, reward: false },
  { label: '3 stamps', stamps: 3, reward: false },
  { label: '4 stamps', stamps: 4, reward: false },
  { label: '5 stamps', stamps: 5, reward: false },
  { label: 'Reward unlocked', stamps: 5, reward: true },
] as const;

export function LoyaltyCardPreviewConsole({ design }: LoyaltyCardPreviewConsoleProps) {
  const [side, setSide] = useState<'front' | 'back'>('back');
  const [previewStamps, setPreviewStamps] = useState(0);
  const [rewardReady, setRewardReady] = useState(false);

  const handleSelect = (stamps: number, reward: boolean) => {
    setPreviewStamps(stamps);
    setRewardReady(reward);
    setSide('back');
  };

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-black/45 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Artwork tester (dev preview)</span>
        <div className="flex gap-1.5">
          {(['front', 'back'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`rounded px-2 py-0.5 text-[9px] font-black uppercase transition-colors ${
                side === s ? 'bg-gold text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center py-2">
        <LoyaltyCard3D
          activeCardDesign={design}
          stampsCount={0}
          forceState={side}
          forceStamps={previewStamps}
          forceRewardReady={rewardReady}
          showRewardBanner={rewardReady}
        />
      </div>

      <div className="border-t border-white/5 pt-3">
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-zinc-500">Test stamp overlays:</p>
        <div className="flex flex-wrap gap-1.5">
          {PREVIEW_STATES.map((state) => {
            const active = previewStamps === state.stamps && rewardReady === state.reward;
            return (
              <button
                key={state.label}
                type="button"
                onClick={() => handleSelect(state.stamps, state.reward)}
                className={`rounded px-2 py-1 text-[9px] font-bold transition ${
                  active
                    ? state.reward
                      ? 'animate-pulse bg-emerald-600 text-white'
                      : 'bg-zinc-700 text-white'
                    : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {state.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[9px] text-zinc-600">Calibrate positions in src/lib/loyalty-stamp-positions.ts</p>
      </div>
    </div>
  );
}
