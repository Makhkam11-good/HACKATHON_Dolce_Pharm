/**
 * Приёмник QR-пакета (ПК мастера): собирает чанки DPQR1|… в строку пакета.
 * Не зависит от камеры — одинаково принимает коды с веб-камеры, из фото/скриншотов и из ручного ввода,
 * поэтому покрывается автотестом без браузера.
 */
import jsQR from 'jsqr';
import { assemble, parseChunk } from './qrExport';

export type AddResult =
  | { status: 'ignored' } // не наш QR или битый CRC
  | { status: 'duplicate'; got: number; n: number }
  | { status: 'added'; got: number; n: number; newBatch: boolean; droppedPrevious: boolean }
  | { status: 'complete'; batchId: string; full: string; got: number; n: number; newBatch: boolean; droppedPrevious: boolean };

export class QrAssembler {
  batchId: string | null = null;
  n = 0;
  chunks = new Map<number, string>();
  full: string | null = null;

  reset() {
    this.batchId = null;
    this.n = 0;
    this.chunks = new Map();
    this.full = null;
  }

  has(i: number) {
    return this.chunks.has(i);
  }

  get got() {
    return this.chunks.size;
  }

  add(text: string): AddResult {
    const ch = parseChunk(text.trim());
    if (!ch) return { status: 'ignored' };
    let newBatch = false;
    let droppedPrevious = false;
    if (this.batchId !== ch.batchId || this.n !== ch.n) {
      // новый пакет (оператор пересобрал коды) — незаконченную сборку начинаем заново
      droppedPrevious = !!this.batchId && this.chunks.size > 0 && !this.full;
      this.batchId = ch.batchId;
      this.n = ch.n;
      this.chunks = new Map();
      this.full = null;
      newBatch = true;
    }
    if (this.chunks.has(ch.i)) return { status: 'duplicate', got: this.chunks.size, n: this.n };
    this.chunks.set(ch.i, ch.data);
    const full = assemble(this.chunks, this.n);
    if (full) {
      this.full = full;
      return { status: 'complete', batchId: ch.batchId, full, got: this.chunks.size, n: this.n, newBatch, droppedPrevious };
    }
    return { status: 'added', got: this.chunks.size, n: this.n, newBatch, droppedPrevious };
  }
}

/** Разбор вставленного текста: коды через пробел/перенос строки. */
export function splitManual(text: string): string[] {
  return text.split(/\s+/).map((s) => s.trim()).filter(Boolean);
}

/** Распознать QR на фото или скриншоте (запасной способ, если камера не работает). */
export async function decodeQrImage(file: Blob): Promise<string | null> {
  const bmp = await createImageBitmap(file);
  try {
    // сначала уменьшенная копия (быстро), затем — в полном размере (мелкий QR на большом фото)
    for (const max of [1400, 2600]) {
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
      if (code?.data) return code.data;
      if (scale === 1) break;
    }
    return null;
  } finally {
    bmp.close();
  }
}
