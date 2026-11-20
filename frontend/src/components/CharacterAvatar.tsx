import type { Emotion } from '../types';

/** Простой SVG-аватар собственной отрисовки: 5 эмоций — меняются брови, глаза и рот. */
const FACE: Record<Emotion, { brows: string; eyes: 'dot' | 'wide' | 'happy' | 'narrow'; mouth: string; cheek?: boolean }> = {
  calm: { brows: 'M62 70 q10 -4 20 0 M118 70 q10 -4 20 0', eyes: 'dot', mouth: 'M84 132 q16 8 32 0' },
  worried: { brows: 'M62 66 q10 -6 20 4 M118 70 q10 -10 20 -4', eyes: 'dot', mouth: 'M84 136 q16 -8 32 0' },
  angry: { brows: 'M60 64 l22 10 M140 64 l-22 10', eyes: 'narrow', mouth: 'M82 138 q18 -12 36 0' },
  scared: { brows: 'M62 62 q10 -8 20 0 M118 62 q10 -8 20 0', eyes: 'wide', mouth: 'M90 128 q10 -10 20 0 q-10 16 -20 0' },
  happy: { brows: 'M62 66 q10 -8 20 0 M118 66 q10 -8 20 0', eyes: 'happy', mouth: 'M80 126 q20 22 40 0 z', cheek: true },
};

export function CharacterAvatar({ emotion = 'calm', size = 180 }: { emotion?: Emotion; size?: number }) {
  const f = FACE[emotion] || FACE.calm;
  return (
    <svg viewBox="0 0 200 220" width={size} height={size * 1.1} aria-label={`Персонаж: ${emotion}`}>
      {/* тело в халате */}
      <path d="M30 220 q0 -60 70 -66 q70 6 70 66z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="3" />
      <path d="M100 156 l-14 64 M100 156 l14 64" stroke="#94a3b8" strokeWidth="3" />
      <rect x="58" y="186" width="22" height="14" rx="3" fill="#1f6f5c" />
      {/* голова */}
      <circle cx="100" cy="96" r="58" fill="#f2c9a5" />
      {/* шапочка */}
      <path d="M42 88 q4 -54 58 -56 q54 2 58 56 q-58 -16 -116 0z" fill="#e2f1ec" stroke="#9cc9bb" strokeWidth="3" />
      <g style={{ transition: 'all .3s' }}>
        <path d={f.brows} stroke="#5b4636" strokeWidth="5" strokeLinecap="round" fill="none" />
        {f.eyes === 'dot' && <><circle cx="72" cy="88" r="6" fill="#1f2937" /><circle cx="128" cy="88" r="6" fill="#1f2937" /></>}
        {f.eyes === 'wide' && <><circle cx="72" cy="88" r="10" fill="#fff" stroke="#1f2937" strokeWidth="3" /><circle cx="72" cy="88" r="4" fill="#1f2937" /><circle cx="128" cy="88" r="10" fill="#fff" stroke="#1f2937" strokeWidth="3" /><circle cx="128" cy="88" r="4" fill="#1f2937" /></>}
        {f.eyes === 'happy' && <path d="M62 90 q10 -10 20 0 M118 90 q10 -10 20 0" stroke="#1f2937" strokeWidth="5" fill="none" strokeLinecap="round" />}
        {f.eyes === 'narrow' && <path d="M64 90 h16 M120 90 h16" stroke="#1f2937" strokeWidth="6" strokeLinecap="round" />}
        <path d={f.mouth} stroke="#7f1d1d" strokeWidth="5" fill={f.eyes === 'happy' ? '#b91c1c' : 'none'} strokeLinecap="round" strokeLinejoin="round" />
        {f.cheek && <><circle cx="62" cy="112" r="8" fill="#f59e9e" opacity=".6" /><circle cx="138" cy="112" r="8" fill="#f59e9e" opacity=".6" /></>}
        {emotion === 'scared' && <path d="M150 70 q6 10 0 16 q-6 -6 0 -16z" fill="#7dd3fc" />}
      </g>
    </svg>
  );
}
