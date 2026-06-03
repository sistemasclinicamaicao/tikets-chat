export const GTH_PHOTO_UPLOAD_MAX_BYTES = 6 * 1024 * 1024;

const MAX_DIMENSION = 1600;
const OUTPUT_TYPE = 'image/jpeg';

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
      reject(new Error('No se pudo leer la imagen. Prueba con JPG o PNG.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('No se pudo comprimir la imagen.'));
      },
      OUTPUT_TYPE,
      quality,
    );
  });
}

function scaledDimensions(width: number, height: number, maxDim: number) {
  const longest = Math.max(width, height);
  if (longest <= maxDim) return { width, height };
  const scale = maxDim / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function renderToBlob(img: HTMLImageElement, maxDim: number, quality: number): Promise<Blob> {
  const { width, height } = scaledDimensions(img.naturalWidth, img.naturalHeight, maxDim);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.drawImage(img, 0, 0, width, height);
  return canvasToBlob(canvas, quality);
}

/** Reduce dimensiones y calidad para evitar HTTP 413 en el proxy de producción. */
export async function prepareGthPhotoForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Solo se permiten imágenes.');
  }

  const img = await loadImage(file);
  let maxDim = MAX_DIMENSION;
  let quality = 0.9;
  let blob = await renderToBlob(img, maxDim, quality);

  while (blob.size > GTH_PHOTO_UPLOAD_MAX_BYTES && (quality > 0.45 || maxDim > 640)) {
    if (quality > 0.45) {
      quality = Math.max(0.45, quality - 0.08);
    } else {
      maxDim = Math.round(maxDim * 0.85);
      quality = 0.82;
    }
    blob = await renderToBlob(img, maxDim, quality);
  }

  if (blob.size > GTH_PHOTO_UPLOAD_MAX_BYTES) {
    throw new Error(
      'La imagen sigue siendo demasiado grande tras comprimirla. Usa una foto más pequeña.',
    );
  }

  const baseName = file.name.replace(/\.[^.]+$/u, '').trim() || 'foto-gth';
  return new File([blob], `${baseName}.jpg`, { type: OUTPUT_TYPE, lastModified: Date.now() });
}
