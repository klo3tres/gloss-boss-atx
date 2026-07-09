'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Gift, Award } from 'lucide-react';
import { calculateLoyaltyStatus } from '@/lib/loyalty-ledger';

interface LoyaltyCard3DProps {
  activeCardDesign?: {
    front_image_url?: string | null;
    back_image_url?: string | null;
    name?: string;
    tier?: string;
  } | null;
  stampsCount: number;
  loyaltyTarget?: number;
  customerEmail?: string;
  className?: string;
  forceState?: 'front' | 'back';
  forceStamps?: number; // Override stamps count for admin preview mode
  forceRewardReady?: boolean; // Force reward slot glow for admin preview mode
}

export function LoyaltyCard3D({
  activeCardDesign,
  stampsCount,
  loyaltyTarget = 5,
  customerEmail = 'VIP MEMBER',
  className = '',
  forceState,
  forceStamps,
  forceRewardReady,
}: LoyaltyCard3DProps) {
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFlipped, setIsFlipped] = useState(forceState === 'back');
  const [frontImageFailed, setFrontImageFailed] = useState(false);
  const [backImageFailed, setBackImageFailed] = useState(false);

  useEffect(() => {
    if (forceState === 'front') setIsFlipped(false);
    if (forceState === 'back') setIsFlipped(true);
  }, [forceState]);

  useEffect(() => {
    setFrontImageFailed(false);
    setBackImageFailed(false);
  }, [activeCardDesign?.front_image_url, activeCardDesign?.back_image_url]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (forceState) return; // Disable tilt if it's static preview
    const card = e.currentTarget;
    const box = card.getBoundingClientRect();
    const x = e.clientX - box.left - box.width / 2;
    const y = e.clientY - box.top - box.height / 2;
    setRotateX(-y / 12);
    setRotateY(x / 12);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
    setIsHovered(false);
  };

  const currentStamps = forceStamps !== undefined ? forceStamps : stampsCount;
  const loyalty = calculateLoyaltyStatus([{ stamp_count: currentStamps }], { rewardThreshold: loyaltyTarget });
  const currentStep = loyalty.progressStamps;
  const isRewardReady = forceRewardReady || loyalty.rewardReady;

  // Slot positions align with standard Gloss Boss loyalty card artwork (5 punches + reward).
  const PUNCH_SLOTS = [
    { left: '7.5%', top: '46%', width: '11%' },
    { left: '22%', top: '46%', width: '11%' },
    { left: '36.5%', top: '46%', width: '11%' },
    { left: '51%', top: '46%', width: '11%' },
    { left: '65.5%', top: '46%', width: '11%' },
    { left: '80%', top: '46%', width: '11%' },
  ] as const;

  const slots = Array.from({ length: loyaltyTarget + 1 }, (_, i) => {
    const isRewardSlot = i === loyaltyTarget;
    let isPunched = false;
    if (isRewardSlot) {
      isPunched = false;
    } else {
      isPunched = isRewardReady || currentStep > i;
    }
    return { index: i, isRewardSlot, isPunched };
  });

  const frontImg = activeCardDesign?.front_image_url || '';
  const backImg = activeCardDesign?.back_image_url || '';
  const showFrontImage = Boolean(frontImg && !frontImageFailed);
  const showBackImage = Boolean(backImg && !backImageFailed);
  const lockedPreview = Boolean(forceState);

  return (
    <div className={`perspective-[1000px] w-full ${className}`}>
      <motion.div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={() => !forceState && setIsHovered(true)}
        onClick={() => !forceState && setIsFlipped(!isFlipped)}
        animate={{
          rotateX: lockedPreview ? 0 : rotateX,
          rotateY: lockedPreview ? 0 : (isFlipped ? 180 : 0) + rotateY,
          scale: isHovered ? 1.02 : 1,
        }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        style={{ transformStyle: 'preserve-3d' }}
        className="relative rounded-3xl border border-gold/30 bg-gradient-to-br from-zinc-900 via-neutral-950 to-zinc-900 p-6 shadow-[0_0_40px_rgba(212,175,55,0.12)] hover:shadow-[0_0_50px_rgba(212,175,55,0.22)] select-none cursor-pointer aspect-[3.5/2] min-h-[250px] flex flex-col justify-between"
      >
        {/* Carbon fiber style subtle pattern overlay */}
        <div 
          className="pointer-events-none absolute inset-0 opacity-[0.035] bg-[radial-gradient(circle_at_center,white_1px,transparent_1px)] bg-[size:10px_10px]" 
          aria-hidden 
        />
        
        {/* Shine overlay that moves with rotation */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent transition-transform duration-200"
          style={{
            transform: `translateX(${rotateY * 4}px) translateY(${rotateX * 4}px)`,
            mixBlendMode: 'overlay',
          }}
          aria-hidden
        />

        {/* --- FRONT SIDE --- */}
        <div 
          className="absolute inset-0 p-6 flex flex-col justify-between w-full h-full rounded-3xl overflow-hidden"
          style={{ 
            backfaceVisibility: 'hidden',
          }}
        >
          {showFrontImage ? (
            <img 
              src={frontImg} 
              alt="Card Front" 
              onError={() => setFrontImageFailed(true)}
              className="absolute inset-0 w-full h-full object-contain rounded-2xl pointer-events-none z-0" 
            />
          ) : (
            // Fallback CSS Design
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-zinc-950 via-neutral-900 to-zinc-950 border border-white/5 pointer-events-none z-0 opacity-80" />
          )}

          {/* Overlay branding content for front */}
          <div className="relative z-10 flex justify-between items-center border-b border-gold/15 pb-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft">GLOSS BOSS ATX</p>
              <p className="text-[8px] uppercase tracking-widest text-zinc-500 mt-0.5">VIP Loyalty Card</p>
            </div>
            <Award className="h-5 w-5 text-gold animate-pulse" />
          </div>

          <div className="relative z-10 mt-auto flex items-end justify-between border-t border-gold/10 pt-2">
            <p className="text-[8px] font-mono font-bold text-zinc-400 bg-black/75 px-2 py-0.5 rounded border border-white/5">
              {customerEmail}
            </p>
            {activeCardDesign?.tier && (
              <span className="text-[8px] font-black uppercase tracking-wider text-gold bg-black/75 px-2 py-0.5 rounded border border-gold/25">
                {activeCardDesign.tier} Tier
              </span>
            )}
          </div>
        </div>

        {/* --- BACK SIDE --- */}
        <div 
          className="absolute inset-0 p-6 flex flex-col justify-between w-full h-full rounded-3xl overflow-hidden"
          style={{ 
            transform: lockedPreview ? 'none' : 'rotateY(180deg)',
            backfaceVisibility: 'hidden',
          }}
        >
          {showBackImage ? (
            <img 
              src={backImg} 
              alt="Card Back" 
              onError={() => setBackImageFailed(true)}
              className="absolute inset-0 w-full h-full object-contain rounded-2xl pointer-events-none z-0" 
            />
          ) : (
            // Fallback CSS Design
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-zinc-950 via-neutral-900 to-zinc-950 border border-white/5 pointer-events-none z-0 opacity-80" />
          )}

          {/* Overlay content for back */}
          <div className="relative z-10 flex justify-between items-center border-b border-gold/15 pb-2">
            <span className="text-[8px] font-black uppercase tracking-widest text-gold-soft/90 bg-black/75 px-2 py-0.5 rounded border border-white/5">
              STAMP CARD PROGRESS
            </span>
            <span className="text-[8px] font-mono font-bold text-zinc-400 bg-black/75 px-2 py-0.5 rounded border border-white/5">
              PUNCHES: {currentStamps}
            </span>
          </div>

          {/* Overlay Punch Grid — absolute positions align with card artwork */}
          <div className="relative z-10 my-auto h-[28%] min-h-[52px] w-full">
            {slots.map((slot, idx) => {
              const pos = PUNCH_SLOTS[idx] ?? PUNCH_SLOTS[PUNCH_SLOTS.length - 1];
              return (
                <div
                  key={idx}
                  style={{
                    left: pos.left,
                    top: pos.top,
                    width: pos.width,
                    aspectRatio: '1',
                  }}
                  className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border transition-all duration-300 ${
                    slot.isPunched
                      ? 'border-gold bg-black/90 shadow-[0_0_12px_rgba(212,175,55,0.45)]'
                      : slot.isRewardSlot
                      ? isRewardReady || currentStep === loyaltyTarget
                        ? 'border-emerald-500/50 bg-emerald-500/30 animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                        : 'border-white/15 bg-black/75'
                      : 'border-white/15 bg-black/75'
                  }`}
                >
                  {slot.isPunched ? (
                    <motion.div
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ 
                        type: 'spring', 
                        stiffness: 260, 
                        damping: 20,
                        delay: idx * 0.15 // Sequential load animation
                      }}
                      className="flex flex-col items-center justify-center"
                    >
                      {/* Stamp: Gold Gloss Boss logo look or custom overlay */}
                      <img 
                        src="/brand/glossboss-clean-logo.png" 
                        alt="Stamp"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                        className="h-[55%] w-[55%] object-contain filter drop-shadow-[0_0_2px_rgba(212,175,55,0.8)]"
                      />
                      <Sparkles className="absolute h-[35%] w-[35%] text-gold fill-gold/20 animate-pulse" />
                    </motion.div>
                  ) : slot.isRewardSlot ? (
                    <div className="flex flex-col items-center justify-center">
                      <Gift className={`h-[40%] w-[40%] max-h-4 ${isRewardReady || currentStep === loyaltyTarget ? 'text-emerald-400' : 'text-zinc-600'}`} />
                      <span className={`text-[6px] font-black uppercase mt-0.5 tracking-tighter ${isRewardReady || currentStep === loyaltyTarget ? 'text-emerald-300' : 'text-zinc-500'}`}>
                        FREE
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] font-black font-mono text-zinc-400">{idx + 1}</span>
                  )}

                  {slot.isPunched ? (
                    <div className="absolute top-0.5 right-0.5 h-1 w-1 rounded-full bg-zinc-950 border border-gold/30 shadow-inner" />
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Bottom Status Text */}
          <div className="relative z-10 flex items-center justify-between border-t border-gold/10 pt-2">
            <p className="text-[8px] font-medium text-zinc-400 bg-black/75 px-2 py-0.5 rounded border border-white/5">
              {isRewardReady
                ? '🎉 DETAILED REWARD ACTIVE!'
                : `${loyalty.stampsUntilReward} VISITS UNTIL REWARD`}
            </p>
            <p className="text-[8px] font-black uppercase tracking-widest text-gold bg-black/75 px-2 py-0.5 rounded border border-gold/25">
              {isRewardReady ? 'REDEEM NOW' : 'GLOSS BOSS'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Card Artwork Diagnostics */}
      {(!frontImg || !backImg || frontImageFailed || backImageFailed) && (
        <div className="mt-2.5 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-[10px] text-rose-200">
          <p className="font-bold flex items-center gap-1">⚠️ Loyalty Card Diagnostic Alert</p>
          <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-400 font-medium">
            {!frontImg && <li>Front artwork upload is missing in membership plan.</li>}
            {frontImg && frontImageFailed && <li>Front artwork failed to load (check URL/permissions).</li>}
            {!backImg && <li>Back artwork upload is missing in membership plan.</li>}
            {backImg && backImageFailed && <li>Back artwork failed to load (check URL/permissions).</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
