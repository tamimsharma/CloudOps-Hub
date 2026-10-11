// Dependency-free SVG charts for the operations dashboards.
import { ReactNode, useState } from 'react';
import { MetricPoint } from '../types';

const PALETTE = ['#4f8cff', '#2ecc8f', '#f5b544', '#ff5d73', '#7a5cff', '#58c4dd'];

function niceMax(values: number[]): number {
  const max = Math.max(...values, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / magnitude) * magnitude;
}

function formatValue(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export interface SeriesConfig {
  points: MetricPoint[];
  label: string;
  color?: string;
}

/** Multi-series line/area chart with hover tooltip. */
export function LineChart({
  series,
  height = 220,
  unit = '',
  showArea = true,
  yMax: forcedMax,
}: {
  series: SeriesConfig[];
  height?: number;
  unit?: string;
  showArea?: boolean;
  yMax?: number;
}) {
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null);
  const allValues = series.flatMap((entry) => entry.points.map((point) => point.value));
  if (allValues.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 30 }}>
        <span className="small">No data points for this range</span>
      </div>
    );
  }

  const width = 720;
  const padding = { top: 14, right: 12, bottom: 24, left: 42 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const max = forcedMax ?? niceMax(allValues);
  const min = 0;

  const path = (points: MetricPoint[]) => {
    if (points.length === 0) return '';
    return points
      .map((point, index) => {
        const x = padding.left + (index / Math.max(1, points.length - 1)) * chartW;
        const y = padding.top + chartH - ((point.value - min) / (max - min || 1)) * chartH;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const areaPath = (points: MetricPoint[]) => {
    if (points.length === 0) return '';
    const x0 = padding.left;
    const x1 = padding.left + chartW;
    const base = padding.top + chartH;
    return `${path(points)} L${x1},${base} L${x0},${base} Z`;
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const primary = series[0];

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.round(ratio * (primary.points.length - 1));
    const point = primary.points[Math.max(0, Math.min(primary.points.length - 1, index))];
    if (!point) return;
    const x = padding.left + (index / Math.max(1, primary.points.length - 1)) * chartW;
    const y =
      padding.top + chartH - ((point.value - min) / (max - min || 1)) * chartH;
    setHover({
      x,
      y,
      label: series
        .map((entry) => {
          const entryPoint = entry.points[Math.min(index, entry.points.length - 1)];
          return `${entry.label}: ${entryPoint ? formatValue(entryPoint.value) : '—'}${unit}`;
        })
        .join('  ·  ') + `  @ ${new Date(point.timestamp).toLocaleTimeString()}`,
    });
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((tick) => {
          const y = padding.top + chartH - tick * chartH;
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
              />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#67758f">
                {formatValue(max * tick)}
              </text>
            </g>
          );
        })}

        {[0, 0.5, 1].map((ratio) => {
          const index = Math.round(ratio * (primary.points.length - 1));
          const point = primary.points[index];
          if (!point) return null;
          const x = padding.left + ratio * chartW;
          return (
            <text
              key={ratio}
              x={x}
              y={height - 6}
              textAnchor={ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle'}
              fontSize="10"
              fill="#67758f"
            >
              {new Date(point.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </text>
          );
        })}

        {series.map((entry, index) => {
          const color = entry.color ?? PALETTE[index % PALETTE.length];
          return (
            <g key={entry.label}>
              {showArea && (
                <path d={areaPath(entry.points)} fill={color} opacity={0.12} className="chart-area-path" />
              )}
              <path
                d={path(entry.points)}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                className="chart-line-path"
              />
            </g>
          );
        })}

        {hover && (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={padding.top}
            y2={padding.top + chartH}
            stroke="rgba(255,255,255,0.25)"
            strokeDasharray="3 3"
          />
        )}
      </svg>

      {hover && (
        <div
          className="chart-tooltip"
          style={{
            left: `${(hover.x / width) * 100}%`,
            top: `${(hover.y / height) * 100}%`,
          }}
        >
          {hover.label}
        </div>
      )}

      {series.length > 1 && (
        <div className="legend" style={{ marginTop: 8 }}>
          {series.map((entry, index) => (
            <span className="legend-item" key={entry.label}>
              <span
                className="legend-swatch"
                style={{ background: entry.color ?? PALETTE[index % PALETTE.length] }}
              />
              {entry.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact sparkline for stat cards. */
export function Sparkline({
  points,
  color = '#4f8cff',
  height = 40,
}: {
  points: MetricPoint[];
  color?: string;
  height?: number;
}) {
  if (points.length < 2) return null;
  const width = 200;
  const values = points.map((point) => point.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const d = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point.value - min) / range) * (height - 4) - 2;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height }}>
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={color} opacity={0.12} className="sparkline-path" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" className="sparkline-path" />
    </svg>
  );
}

/** Horizontal bar chart for categorical breakdowns. */
export function BarChart({
  data,
  unit = '',
  height = 18,
}: {
  data: Array<{ label: string; value: number; color?: string }>;
  unit?: string;
  height?: number;
}) {
  if (data.length === 0) return <div className="faint small">No data</div>;
  const max = Math.max(...data.map((entry) => entry.value), 1);

  return (
    <div className="stack" style={{ gap: 10 }}>
      {data.map((entry, index) => (
        <div key={entry.label}>
          <div className="row between small" style={{ marginBottom: 4 }}>
            <span className="muted">{entry.label}</span>
            <span className="mono">
              {formatValue(entry.value)}
              {unit}
            </span>
          </div>
          <div className="progress">
            <span
              style={{
                width: `${(entry.value / max) * 100}%`,
                background: entry.color ?? PALETTE[index % PALETTE.length],
                height,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Donut chart for status distribution. */
export function DonutChart({
  data,
  size = 150,
  centerLabel,
  centerValue,
}: {
  data: Array<{ label: string; value: number; color?: string }>;
  size?: number;
  centerLabel?: string;
  centerValue?: ReactNode;
}) {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="health-ring">
      <svg width={size} height={size} viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="15" />
        {total > 0 &&
          data.map((entry, index) => {
            const fraction = entry.value / total;
            const dash = fraction * circumference;
            const element = (
              <circle
                key={entry.label}
                cx="65"
                cy="65"
                r={radius}
                fill="none"
                stroke={entry.color ?? PALETTE[index % PALETTE.length]}
                strokeWidth="15"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 65 65)"
                strokeLinecap="butt"
                className="donut-segment"
              />
            );
            offset += dash;
            return element;
          })}
        <text x="65" y="62" textAnchor="middle" fontSize="22" fontWeight="700" fill="#e6ecf7">
          {centerValue ?? total}
        </text>
        <text x="65" y="80" textAnchor="middle" fontSize="10" fill="#67758f">
          {centerLabel ?? 'total'}
        </text>
      </svg>

      <div className="stack" style={{ gap: 8 }}>
        {data.map((entry, index) => (
          <div className="legend-item" key={entry.label}>
            <span
              className="legend-swatch"
              style={{ background: entry.color ?? PALETTE[index % PALETTE.length] }}
            />
            <span className="small muted">{entry.label}</span>
            <span className="small" style={{ fontWeight: 700 }}>
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Radial gauge for scores (0-100). */
export function Gauge({
  value,
  label,
  size = 170,
}: {
  value: number;
  label: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 52;
  const circumference = Math.PI * radius; // half circle
  const dash = (clamped / 100) * circumference;
  const color = clamped >= 85 ? '#2ecc8f' : clamped >= 65 ? '#f5b544' : '#ff5d73';

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size * 0.62} viewBox="0 0 130 82">
        <path
          d="M13 74 A52 52 0 0 1 117 74"
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="13"
          strokeLinecap="round"
        />
        <path
          d="M13 74 A52 52 0 0 1 117 74"
          fill="none"
          stroke={color}
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="gauge-arc"
        />
        <text x="65" y="66" textAnchor="middle" fontSize="27" fontWeight="700" fill="#e6ecf7">
          {Math.round(clamped)}
        </text>
      </svg>
      <div className="small muted">{label}</div>
    </div>
  );
}

export function ChartLegend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="legend">
      {items.map((item) => (
        <span className="legend-item" key={item.label}>
          <span className="legend-swatch" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
