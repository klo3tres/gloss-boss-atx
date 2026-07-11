'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Gift } from 'lucide-react';
import { calculateLoyaltyStatus } from '@/lib/loyalty-ledger';
import {
  LOYALTY_CARD_ASPECT,
  LOYALTY_STAMP_DEFAULT_SIZE,
  LOYALTY_STAMP_POSITIONS,
} from '@/lib/loyalty-stamp-positions';

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
  forceStamps?: number;
  forceRewardReady?: boolean;
  showRewardBanner?: boolean;
}

function BrandedCardFace({
  eyebrow,
  title,
  footer,
}: {
  eyebrow: string;
  title: string;
  footer: string;
}) {
  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1408] via-[#0c0a07] to-[#12100c] p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(circle at 20% 15%, rgba(212,175,55,0.28), transparent 42%), radial-gradient(circle at 85% 80%, rgba(212,166,77,0.12), transparent 40%)',
        }}
        aria-hidden
      />
      <div className="relative">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft">{eyebrow}</p>
        <p className="mt-1 text-[9px] uppercase tracking-widest text-zinc-400">{title}</p>
      </div>
      <div className="relative flex items-center gap-2">
        <img
          src="/brand/glossboss-clean-logo.png"
          alt=""
          className="h-8 w-auto object-contain opacity-90"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <p className="text-[9px] font-mono text-zinc-400">{footer}</p>
      </div>
    </div>
  );
}

function StampOverlay({
  loyaltyTarget,
  currentStep,
  isRewardReady,
}: {
  loyaltyTarget: number;
  currentStep: number;
  isRewardReady: boolean;
}) {
  const slots = Array.from({ length: loyaltyTarget + 1 }, (_, i) => {
    const isRewardSlot = i === loyaltyTarget;
    const isPunched = !isRewardSlot && (isRewardReady || currentStep > i);
    return { index: i, isRewardSlot, isPunched };
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {slots.map((slot, idx) => {
        const pos = LOYALTY_STAMP_POSITIONS[idx] ?? LOYALTY_STAMP_POSITIONS[LOYALTY_STAMP_POSITIONS.length - 1];
        const size = pos.size ?? LOYALTY_STAMP_DEFAULT_SIZE;
        const rewardLit = slot.isRewardSlot && (isRewardReady || currentStep >= loyaltyTarget);

        // Only render punch art for filled stamps; empty slots stay invisible (no black circles).
        if (!slot.isPunched && !slot.isRewardSlot) return null;

        return (
          <div
            key={slot.index}
            style={{
              left: pos.left,
              top: pos.top,
              width: size,
              aspectRatio: '1',
            }}
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border transition-all duration-300 ${
              slot.isPunched
                ? 'border-gold bg-black/85 shadow-[0_0_10px_rgba(212,175,55,0.45)]'
                : rewardLit
                  ? 'border-emerald-400/60 bg-emerald-500/25'
                  : 'border-white/15 bg-black/40'
            }`}
          >
            {slot.isPunched ? (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="relative flex h-full w-full items-center justify-center">
                <img
                  src="/brand/glossboss-clean-logo.png"
                  alt=""
                  className="h-[62%] w-[62%] object-contain drop-shadow-[0_0_2px_rgba(212,175,55,0.8)]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <Sparkles className="absolute h-[30%] w-[30%] text-gold" />
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <Gift className={`h-[42%] w-[42%] ${rewardLit ? 'text-emerald-300' : 'text-white/25'}`} />
                <span className={`text-[7px] font-black uppercase ${rewardLit ? 'text-emerald-200' : 'text-white/30'}`}>FREE</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
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
  showRewardBanner = true,
}: LoyaltyCard3DProps) {
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFlipped, setIsFlipped] = useState(forceState === 'back');
  const [frontImageFailed, setFrontImageFailed] = useState(false);
  const [backImageFailed, setBackImageFailed] = useState(false);
  const [frontLoaded, setFrontLoaded] = useState(false);
  const [backLoaded, setBackLoaded] = useState(false);

  useEffect(() => {
    if (forceState === 'front') setIsFlipped(false);
    if (forceState === 'back') setIsFlipped(true);
  }, [forceState]);

  useEffect(() => {
    setFrontImageFailed(false);
    setBackImageFailed(false);
    setFrontLoaded(false);
    setBackLoaded(false);
  }, [activeCardDesign?.front_image_url, activeCardDesign?.back_image_url]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (forceState) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left - box.width / 2;
    const y = e.clientY - box.top - box.height / 2;
    setRotateX(-y / 14);
    setRotateY(x / 14);
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

  const frontImg = activeCardDesign?.front_image_url || '';
  const backImg = activeCardDesign?.back_image_url || '';
  const showFrontImage = Boolean(frontImg && !frontImageFailed);
  const showBackImage = Boolean(backImg && !backImageFailed);
  const lockedPreview = Boolean(forceState);
  const flipRotation = isFlipped ? 180 : 0;
  const showFrontSkeleton = Boolean(frontImg && !frontImageFailed && !frontLoaded);
  const showBackSkeleton = Boolean(backImg && !backImageFailed && !backLoaded);

  return (
    <div className={`mx-auto w-full max-w-[min(100%,420px)] ${className}`}>
      {showRewardBanner && isRewardReady ? (
        <div className="mb-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-2 text-center">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Reward unlocked</p>
          <p className="mt-0.5 text-xs text-emerald-100/90">Claim your punch-card reward below — card stays visible.</p>
        </div>
      ) : null}

      <div className="perspective-[1200px]">
        <motion.div
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseEnter={() => !forceState && setIsHovered(true)}
          onClick={() => !forceState && setIsFlipped(!isFlipped)}
          animate={{
            rotateX: lockedPreview ? 0 : rotateX,
            rotateY: lockedPreview ? flipRotation : flipRotation + rotateY,
            scale: isHovered && !lockedPreview ? 1.02 : 1,
          }}
          transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          style={{ transformStyle: 'preserve-3d', aspectRatio: String(LOYALTY_CARD_ASPECT) }}
          className="relative w-full cursor-pointer select-none rounded-2xl border border-gold/25 bg-gradient-to-br from-[#1a1408] via-[#0c0a07] to-[#12100c] shadow-[0_0_32px_rgba(212,175,55,0.12)]"
        >
          {/* FRONT */}
          <div
            className="absolute inset-0 flex items-center justify-center rounded-2xl"
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
          >
            {showFrontSkeleton ? (
              <div className="h-full w-full animate-pulse rounded-2xl bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950" />
            ) : null}
            {showFrontImage ? (
              <img
                src={frontImg}
                alt="Loyalty card front"
                onLoad={() => setFrontLoaded(true)}
                onError={() => setFrontImageFailed(true)}
                className={`h-full w-full object-contain object-center ${showFrontSkeleton ? 'opacity-0' : 'opacity-100'}`}
                draggable={false}
              />
            ) : (
              <BrandedCardFace eyebrow="Gloss Boss ATX" title="VIP Loyalty Card" footer={customerEmail} />
            )}
          </div>

          {/* BACK */}
          <div
            className="absolute inset-0 flex items-center justify-center rounded-2xl"
            style={{
              transform: 'rotateY(180deg)',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            <div className="relative h-full w-full">
              {showBackSkeleton ? (
                <div className="absolute inset-0 z-10 animate-pulse rounded-2xl bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950" />
              ) : null}
              {showBackImage ? (
                <img
                  src={backImg}
                  alt="Loyalty card back"
                  onLoad={() => setBackLoaded(true)}
                  onError={() => setBackImageFailed(true)}
                  className={`h-full w-full object-contain object-center ${showBackSkeleton ? 'opacity-0' : 'opacity-100'}`}
                  draggable={false}
                />
              ) : (
                <BrandedCardFace eyebrow="Gloss Boss ATX" title="Stamp card" footer={`Punches: ${currentStamps}`} />
              )}
              <StampOverlay loyaltyTarget={loyaltyTarget} currentStep={currentStep} isRewardReady={isRewardReady} />
            </div>
          </div>
        </motion.div>
      </div>

      {!lockedPreview ? (
        <p className="mt-2 text-center text-[10px] text-zinc-500">Tap card to flip · {isFlipped ? 'Back' : 'Front'}</p>
      ) : null}

      {(!frontImg || !backImg || frontImageFailed || backImageFailed) && (
        <div className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-[10px] text-amber-100">
          <p className="font-bold">Card artwork</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-zinc-400">
            {!frontImg && <li>Front image missing — showing branded fallback.</li>}
            {frontImg && frontImageFailed && <li>Front image failed to load — branded fallback in use.</li>}
            {!backImg && <li>Back image missing — stamp alignment uses default positions.</li>}
            {backImg && backImageFailed && <li>Back image failed to load — branded fallback in use.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
