/** Client-side resize/compress before upload — avoids HTTP 413 on large iPhone library photos. */

const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.82;
const MAX_BYTES_TARGET = 4 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image file.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not compress image.'));
        else resolve(blob);
      },
      type,
      quality,
    );
  });
}

/**
 * Compress image files for field upload. Returns original file if already small or not an image.
 */
export async function compressImageForUpload(file: File): Promise<{ file: File; beforeBytes: number; afterBytes: number; compressed: boolean }> {
  const beforeBytes = file.size;
  if (!file.type.startsWith('image/')) {
    return { file, beforeBytes, afterBytes: beforeBytes, compressed: false };
  }
  if (beforeBytes <= 1.5 * 1024 * 1024 && !file.type.includes('heic') && !file.type.includes('heif')) {
    return { file, beforeBytes, afterBytes: beforeBytes, compressed: false };
  }

  const img = await loadImage(file);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { file, beforeBytes, afterBytes: beforeBytes, compressed: false };
  ctx.drawImage(img, 0, 0, w, h);

  let quality = JPEG_QUALITY;
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  while (blob.size > MAX_BYTES_TARGET && quality > 0.45) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
  const out = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  return { file: out, beforeBytes, afterBytes: out.size, compressed: true };
}
