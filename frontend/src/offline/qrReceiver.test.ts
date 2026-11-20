import { describe, expect, it } from 'vitest';
import type { OutboxItem } from './db';
import { buildPacket, toChunks, unpack } from './qrExport';
import { QrAssembler, splitManual } from './qrReceiver';

const SECRET = Buffer.from(new Uint8Array(32).map((_, i) => (i * 13) % 251)).toString('base64');

function items(count: number): OutboxItem[] {
  const t0 = Date.UTC(2026, 10, 20, 8);
  return Array.from({ length: count }, (_, k) => ({
    id: crypto.randomUUID(), kind: 'event', status: 'pending', createdAt: t0 + k, tries: 0, userId: 'u1',
    payload: { type: 'material_interval', client_seq: k + 1, material_id: `m${k % 5}`, duration_ms: 31000 + k,
      started_at_client: new Date(t0 + k * 60000).toISOString(), ended_at_client: new Date(t0 + k * 60000 + 31000 + k).toISOString(),
      note: `запись ${k} — ${'x'.repeat(40)}` },
  }));
}

/** Перемешать и добавить «шум» как с реальной камеры: повторы, чужие QR, битый CRC. */
function noisy(chunks: string[]): string[] {
  const out = [...chunks, chunks[0], chunks[chunks.length - 1], 'https://example.com', 'DPQR1|zz|1|2|deadbeef|abc'];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('QrAssembler (приёмник на ПК мастера)', () => {
  it('собирает пакет из перемешанных чанков с повторами и мусором, подпись проходит', async () => {
    const { chunks, full, batchId, packet } = await buildPacket(items(40), 'dev1', 'u1', SECRET);
    expect(chunks.length).toBeGreaterThan(1);
    const a = new QrAssembler();
    let done: string | null = null;
    for (const c of noisy(chunks)) {
      const r = a.add(c);
      if (r.status === 'complete') {
        expect(r.batchId).toBe(batchId);
        done = r.full;
      }
    }
    expect(done).toBe(full);
    expect(a.got).toBe(chunks.length);
    const back = await unpack(done!, SECRET);
    expect(back.batch_id).toBe(batchId);
    expect(back.items).toEqual(packet.items);
  });

  it('повтор кода не меняет счётчик, чужой QR игнорируется', () => {
    const chunks = toChunks('b1', 'A'.repeat(1500));
    const a = new QrAssembler();
    expect(a.add(chunks[0]).status).toBe('added');
    expect(a.add(chunks[0])).toEqual({ status: 'duplicate', got: 1, n: chunks.length });
    expect(a.add('DPACK1|b1|3|xx').status).toBe('ignored');
    expect(a.got).toBe(1);
  });

  it('новый пакет сбрасывает незавершённую сборку', () => {
    const a = new QrAssembler();
    a.add(toChunks('old', 'B'.repeat(2000))[0]);
    const fresh = toChunks('new', 'C'.repeat(800));
    const r = a.add(fresh[0]);
    expect(r.status).toBe('added');
    expect(r.status === 'added' && r.droppedPrevious).toBe(true);
    expect(a.batchId).toBe('new');
    expect(a.add(fresh[1]).status).toBe('complete');
  });

  it('ручной ввод: коды через переносы и пробелы', () => {
    const chunks = toChunks('m1', 'D'.repeat(1600));
    const a = new QrAssembler();
    const statuses = splitManual(`  ${chunks.join('\n')} \n\n`).map((c) => a.add(c).status);
    expect(statuses.at(-1)).toBe('complete');
  });
});
