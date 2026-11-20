import { BarController, BarElement, CategoryScale, Chart, Filler, Legend, LinearScale, LineElement, PointElement, RadarController, RadialLinearScale, Tooltip } from 'chart.js';
import { useEffect, useRef } from 'react';

Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend, BarController, BarElement, CategoryScale, LinearScale);
Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
Chart.defaults.font.size = 14;
Chart.defaults.color = '#3B3543';

/** dash и point — чтобы серии различались не только цветом (линия: сплошная / штрих / точки, точки: круг / квадрат / треугольник). */
export interface Series { label: string; data: (number | null)[]; color: string; dash?: number[]; point?: 'circle' | 'rect' | 'triangle' }

function useChart(cfg: () => ConstructorParameters<typeof Chart>[1], deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ch = new Chart(ref.current, cfg());
    return () => ch.destroy();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

/** «Роза компетенций»: radar с наборами self / manager / peers. */
export function RadarChart({ labels, series }: { labels: string[]; series: Series[] }) {
  const ref = useChart(() => ({
    type: 'radar',
    data: {
      labels,
      datasets: series.map((s) => ({ label: s.label, data: s.data, borderColor: s.color, backgroundColor: `${s.color}1A`, pointBackgroundColor: s.color, borderWidth: 3, borderDash: s.dash, pointStyle: s.point || 'circle', pointRadius: 5, spanGaps: true })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { r: { min: 0, max: 5, ticks: { stepSize: 1, backdropColor: 'transparent' }, pointLabels: { font: { size: 13, weight: 600 } } } },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } } },
    },
  }), [JSON.stringify(labels), JSON.stringify(series)]);
  return <div className="h-[380px]"><canvas ref={ref} /></div>;
}

export function BarChart({ labels, series, stacked }: { labels: string[]; series: Series[]; stacked?: boolean }) {
  const ref = useChart(() => ({
    type: 'bar',
    data: { labels, datasets: series.map((s) => ({ label: s.label, data: s.data, backgroundColor: s.color, borderRadius: 6 })) },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { stacked }, y: { stacked, beginAtZero: true, ticks: { precision: 0 } } },
      plugins: { legend: { position: 'bottom' } },
    },
  }), [JSON.stringify(labels), JSON.stringify(series), stacked]);
  return <div className="h-[300px]"><canvas ref={ref} /></div>;
}
