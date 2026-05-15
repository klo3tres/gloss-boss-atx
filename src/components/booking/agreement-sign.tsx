'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  title: string;
  body: string;
  legalName: string;
  onLegalNameChange: (v: string) => void;
  signatureMode: 'typed' | 'drawn';
  onSignatureModeChange: (m: 'typed' | 'drawn') => void;
  acknowledged: boolean;
  onAcknowledgedChange: (v: boolean) => void;
  onClearSignature: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
};

export function AgreementSign({
  title,
  body,
  legalName,
  onLegalNameChange,
  signatureMode,
  onSignatureModeChange,
  acknowledged,
  onAcknowledgedChange,
  onClearSignature,
  canvasRef,
}: Props) {
  const drawing = useRef(false);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = '#d4a64d';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas, canvasRef]);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    const me = e as React.MouseEvent;
    return { x: me.clientX - rect.left, y: me.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    drawing.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const endDraw = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resizeCanvas();
    onClearSignature();
  };

  return (
    <div className='space-y-4'>
      <h2 className='text-xl font-black uppercase text-gold-soft'>{title}</h2>
      <div className='max-h-64 overflow-y-auto rounded-xl border border-gold/20 bg-black/60 p-4 text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap'>
        {body}
      </div>

      <div className='grid gap-3 sm:grid-cols-2'>
        <label className='text-sm'>
          <span className='mb-1 block text-zinc-400'>Signature method</span>
          <select
            value={signatureMode}
            onChange={(e) => onSignatureModeChange(e.target.value as 'typed' | 'drawn')}
            className='w-full rounded-lg border border-zinc-700 bg-black px-3 py-2'
          >
            <option value='typed'>Type full legal name</option>
            <option value='drawn'>Draw signature</option>
          </select>
        </label>
        <label className='text-sm'>
          <span className='mb-1 block text-zinc-400'>Full legal name (must match ID)</span>
          <input
            value={legalName}
            onChange={(e) => onLegalNameChange(e.target.value)}
            className='w-full rounded-lg border border-zinc-700 bg-black px-3 py-2'
            placeholder='First Middle Last'
            required
          />
        </label>
      </div>

      {signatureMode === 'drawn' ? (
        <div>
          <p className='mb-2 text-xs text-zinc-400'>Sign in the box below (mouse or finger).</p>
          <canvas
            ref={canvasRef}
            className='h-40 w-full touch-none rounded-xl border border-gold/30 bg-black'
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
          <button type='button' onClick={clear} className='mt-2 text-xs uppercase tracking-wider text-gold-soft'>
            Clear signature
          </button>
        </div>
      ) : null}

      <label className='flex items-start gap-2 text-sm text-zinc-300'>
        <input
          type='checkbox'
          checked={acknowledged}
          onChange={(e) => onAcknowledgedChange(e.target.checked)}
          className='mt-1 h-4 w-4 rounded border-zinc-600 bg-black'
          required
        />
        I have read the agreement above and agree to its terms. I understand this electronic signature is legally binding.
      </label>
    </div>
  );
}

export function getCanvasSignatureDataUrl(canvas: HTMLCanvasElement | null): string | null {
  if (!canvas) return null;
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
