'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Gift, Award } from 'lucide-react';

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
  const currentStep = currentStamps % (loyaltyTarget + 1);
  const isRewardReady = forceRewardReady || (currentStamps > 0 && currentStamps % (loyaltyTarget + 1) === 0);

  // We have 6 slots total: 5 standard stamps + 1 free reward slot.
  const slots = Array.from({ length: loyaltyTarget + 1 }, (_, i) => {
    const isRewardSlot = i === loyaltyTarget;
    let isPunched = false;
    if (isRewardSlot) {
      isPunched = isRewardReady;
    } else {
      isPunched = isRewardReady || (currentStep > i);
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
        className="relative overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-zinc-900 via-neutral-950 to-zinc-900 p-6 shadow-[0_0_40px_rgba(212,175,55,0.12)] hover:shadow-[0_0_50px_rgba(212,175,55,0.22)] select-none cursor-pointer aspect-[3.5/2] min-h-[250px] flex flex-col justify-between"
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
          className="absolute inset-0 p-6 flex flex-col justify-between w-full h-full"
          style={{ 
            backfaceVisibility: 'hidden',
            display: isFlipped ? 'none' : 'flex'
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
          className="absolute inset-0 p-6 flex flex-col justify-between w-full h-full"
          style={{ 
            transform: lockedPreview ? 'none' : 'rotateY(180deg)',
            backfaceVisibility: 'hidden',
            display: isFlipped ? 'flex' : 'none'
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

          {/* Overlay Punch Grid */}
          <div className="relative z-10 grid grid-cols-6 gap-2 my-auto px-2">
            {slots.map((slot, idx) => {
              return (
                <div
                  key={idx}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-xl border transition-all duration-300 ${
                    slot.isPunched
                      ? 'border-gold bg-black/85 shadow-[0_0_15px_rgba(212,175,55,0.45)]'
                      : slot.isRewardSlot
                      ? isRewardReady || currentStep === loyaltyTarget
                        ? 'border-emerald-500/50 bg-emerald-500/25 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                        : 'border-white/10 bg-black/80 hover:border-gold/20'
                      : 'border-white/10 bg-black/80 hover:border-gold/20'
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
                          // Fallback if brand logo is missing
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                        className="h-6 w-6 object-contain filter drop-shadow-[0_0_2px_rgba(212,175,55,0.8)]"
                      />
                      {/* Sub gold star fallback/overlay */}
                      <Sparkles className="absolute h-4 w-4 text-gold fill-gold/20 animate-pulse" />
                    </motion.div>
                  ) : slot.isRewardSlot ? (
                    <div className="flex flex-col items-center justify-center">
                      <Gift className={`h-4 w-4 ${isRewardReady || currentStep === loyaltyTarget ? 'text-emerald-400' : 'text-zinc-600'}`} />
                      <span className={`text-[6px] font-black uppercase mt-0.5 tracking-tighter ${isRewardReady || currentStep === loyaltyTarget ? 'text-emerald-300' : 'text-zinc-500'}`}>
                        FREE
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-zinc-500 text-xs font-black font-mono">{idx + 1}</span>
                    </div>
                  )}

                  {/* Little physical hole shadow if punched */}
                  {slot.isPunched && (
                    <div className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-zinc-950 border border-gold/30 shadow-inner" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Status Text */}
          <div className="relative z-10 flex items-center justify-between border-t border-gold/10 pt-2">
            <p className="text-[8px] font-medium text-zinc-400 bg-black/75 px-2 py-0.5 rounded border border-white/5">
              {isRewardReady
                ? '🎉 DETAILED REWARD ACTIVE!'
                : `${(loyaltyTarget + 1) - (currentStamps % (loyaltyTarget + 1))} VISITS UNTIL REWARD`}
            </p>
            <p className="text-[8px] font-black uppercase tracking-widest text-gold bg-black/75 px-2 py-0.5 rounded border border-gold/25">
              {isRewardReady ? 'REDEEM NOW' : 'GLOSS BOSS'}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
