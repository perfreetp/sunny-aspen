import { makeCanvas } from '../canvas/textures';

export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`无法读取图片：${file.name}`));
    };
    image.src = url;
  });
}

export function drawCover(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  return canvas;
}

export function drawScaledContain(
  image: HTMLImageElement,
  maxWidth = 1280,
  maxHeight = 1280,
): HTMLCanvasElement {
  const naturalWidth = image.naturalWidth || maxWidth;
  const naturalHeight = image.naturalHeight || maxHeight;
  const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(image, 0, 0, width, height);
  return canvas;
}
