import { describe, expect, it } from 'vitest';
import type { OutboxItem } from './db';
import { assemble, b64urlDecode, b64urlEncode, buildPacket, compact, crc32, parseChunk, toChunks, unpack } from './qrExport';

const SECRET = Buffer.from(new Uint8Array(32).map((_, i) => i * 7)).toString('base64');

function interval(seq: number, start: number, dur: number, material = 'm1'): OutboxItem {
  return {
    id: `e${seq}`, kind: 'event', status: 'pending', createdAt: start, tries: 0, userId: 'u',
    payload: { type: 'material_interval', client_seq: seq, material_id: material, duration_ms: dur,
      started_at_client: new Date(start).toISOString(), ended_at_client: new Date(start + dur).toISOString() },
  };
}

describe('qrExport', () => {
  it('crc32 совпадает с zlib.crc32', () => {
    expect(crc32('DPQR тест')).toBe('32b69e8a');
  });

  it('base64url туда-обратно', () => {
    const b = new Uint8Array([0, 251, 255, 62, 63, 1, 2]);
    expect(Array.from(b64urlDecode(b64urlEncode(b)))).toEqual(Array.from(b));
  });

  it('компакция склеивает чекпойнты одного материала', () => {
    const t = Date.UTC(2026, 10, 20, 8);
    const items = [interval(1, t, 30000), interval(2, t + 30000, 30000), interval(3, t + 60000, 12000), interval(4, t + 200000, 5000), interval(5, t + 205000, 5000, 'm2')];
    const c = compact(items);
    expect(c).toHaveLength(3);
    expect(c[0].id).toBe('e1');
    expect(c[0].payload.duration_ms).toBe(72000);
    expect(c[0].payload.merged_ids).toEqual(['e1', 'e2', 'e3']);
    expect(c[0].payload.ended_at_client).toBe(new Date(t + 72000).toISOString());
    expect(items[0].payload.duration_ms).toBe(30000); // исходные элементы не мутируются
  });

  it('упаковка ↔ распаковка с подписью, чанки собираются в любом порядке', async () => {
    const t = Date.now();
    const items = Array.from({ length: 60 }, (_, i) => interval(i + 1, t + i * 100000, 30000, `m${i % 7}`));
    const { full, chunks, batchId } = await buildPacket(items, 'dev-1', 'user-1', SECRET);
    expect(chunks.length).toBeGreaterThan(1);
    const map = new Map<number, string>();
    let n = 0;
    for (const s of [...chunks].reverse()) {
      const ch = parseChunk(s)!;
      expect(ch.batchId).toBe(batchId);
      map.set(ch.i, ch.data);
      n = ch.n;
    }
    const got = assemble(map, n)!;
    expect(got).toBe(full);
    const packet = await unpack(got, SECRET);
    expect(packet.device_id).toBe('dev-1');
    expect(packet.items).toHaveLength(60);
  });

  it('повреждённый чанк отбрасывается по crc, подделка — по подписи', async () => {
    const [c] = toChunks('abc12345', 'hello-world');
    expect(parseChunk(c.replace('hello', 'jello'))).toBeNull();
    const { full } = await buildPacket([interval(1, Date.now(), 1000)], 'd', 'u', SECRET);
    const [p, s] = full.split('.');
    const bytes = b64urlDecode(p);
    bytes[bytes.length - 1] ^= 1;
    await expect(unpack(`${b64urlEncode(bytes)}.${s}`, SECRET)).rejects.toThrow();
  });
});
