import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { Icon } from './Icon';
import { Spinner } from './ui';

// worker бандлится локально (без CDN) и кэшируется service worker'ом
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Doc = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;

function Page({ doc, n, width }: { doc: Doc; n: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(n <= 2);
  const [ratio, setRatio] = useState(1.414);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setVisible(true), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !width) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void (async () => {
      const page = await doc.getPage(n);
      const vp1 = page.getViewport({ scale: 1 });
      setRatio(vp1.height / vp1.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: (width / vp1.width) * dpr });
      const c = ref.current;
      if (!c || cancelled) return;
      c.width = vp.width;
      c.height = vp.height;
      const ctx = c.getContext('2d')!;
      const t = page.render({ canvasContext: ctx, viewport: vp });
      task = t;
      await t.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, n, width, visible]);

  return (
    <div ref={box} className="bg-white shadow mb-3 mx-auto" style={{ width, height: width * ratio }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

export function PdfViewer({ blob }: { blob: Blob }) {
  const { t } = useTranslation();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState(1);
  const wrap = useRef<HTMLDivElement>(null);
  const [baseW, setBaseW] = useState(0);

  useEffect(() => {
    let d: Doc | null = null;
    void (async () => {
      try {
        d = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
        setDoc(d);
      } catch (e) {
        setErr(String(e));
      }
    })();
    return () => void d?.destroy();
  }, [blob]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBaseW(Math.min(el.clientWidth - 8, 1000)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div>
      <div className="sticky top-16 z-10 flex items-center justify-center gap-2 py-2 bg-slate-50/95">
        <button className="min-h-tap min-w-tap rounded-xl bg-white border text-xl font-bold" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} aria-label={t('Уменьшить')}>−</button>
        <span className="w-16 text-center font-semibold">{Math.round(zoom * 100)}%</span>
        <button className="min-h-tap min-w-tap rounded-xl bg-white border text-xl font-bold" onClick={() => setZoom((z) => Math.min(3, z + 0.2))} aria-label={t('Увеличить')}>+</button>
        {doc && <span className="ml-3 text-slate-500 text-sm"><Icon name="file" size={16} className="inline" /> {doc.numPages} {t('стр.')}</span>}
      </div>
      <div ref={wrap} className="overflow-x-auto bg-slate-200 rounded-xl p-1 min-h-[300px]">
        {err && <div className="p-4 text-red-700">{t('Не удалось открыть PDF')}: {err}</div>}
        {!doc && !err && <Spinner />}
        {doc && baseW > 0 && Array.from({ length: doc.numPages }, (_, i) => <Page key={i} doc={doc} n={i + 1} width={baseW * zoom} />)}
      </div>
    </div>
  );
}
