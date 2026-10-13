'use client';

import { useRef, useState, type ReactNode } from 'react';
import { DAY_MS, formatDate, formatDay, nextDay, startOfDay } from '@/lib/format';
import type { Snapshot } from '@/lib/model';
import type { DayBucket, Point } from '@/lib/series';

/*
 * viewBox 를 실제로 그려지는 폭 근처에 맞춰 둔다. SVG 는 w-full 로 늘어나므로 좌표계가
 * 렌더 폭보다 좁으면 그 비율만큼 글자와 선이 함께 확대된다 (혼돈 분석기와 같은 이유).
 */
const W = 1000;
const H = 240;
const PAD = { top: 14, right: 16, bottom: 30, left: 72 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

export interface Tick {
  value: number;
  label: string;
}

/** 1·2·5 × 10ⁿ 간격의 눈금. */
export function niceTicks(lo: number, hi: number, format: (v: number) => string, count = 4): Tick[] {
  if (!(hi > lo)) return [{ value: lo, label: format(lo) }];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: Tick[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    out.push({ value: v, label: format(Math.abs(v) < step * 1e-9 ? 0 : v) });
  }
  return out;
}

const TIME_STEPS = [3, 6, 12].map((h) => h * 3_600_000).concat([1, 2, 7, 14, 30, 61, 91, 182, 365].map((d) => d * DAY_MS));

/** 시간축 눈금. 하루 이상 간격은 자정에 맞춘다 — 10/13 이라고 써 놓고 낮 12시에 찍히면 헷갈린다. */
function timeTicks(x0: number, x1: number): Tick[] {
  const span = x1 - x0;
  const step = TIME_STEPS.find((s) => span / s <= 6) ?? TIME_STEPS[TIME_STEPS.length - 1];
  const out: Tick[] = [];
  if (step < DAY_MS) {
    // 로컬 시각 기준으로 맞추려고 자정에서부터 센다.
    const base = startOfDay(x0);
    for (let v = base + Math.ceil((x0 - base) / step) * step; v <= x1; v += step) {
      const d = new Date(v);
      out.push({ value: v, label: d.getHours() === 0 ? formatDate(v) : `${d.getHours()}시` });
    }
    return out;
  }
  const days = Math.round(step / DAY_MS);
  for (let v = startOfDay(x0) === x0 ? x0 : nextDay(startOfDay(x0)); v <= x1; ) {
    out.push({ value: v, label: formatDate(v) });
    for (let i = 0; i < days; i++) v = nextDay(v);
  }
  return out;
}

/* ── 시계열 선 ─────────────────────────────────────────────────────────── */

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  points: Point[];
  /** 굵게 그릴 주 계열. 나머지는 가늘게. */
  primary?: boolean;
}

export function TimeChart({
  series,
  from,
  yTicks,
  gaps = [],
  renderTooltip,
  ariaLabel,
}: {
  series: LineSeries[];
  /** 기간 시작. null 이면 첫 기록부터. */
  from: number | null;
  yTicks: (lo: number, hi: number) => Tick[];
  gaps?: { from: number; to: number }[];
  renderTooltip: (snapshot: Snapshot) => ReactNode;
  ariaLabel: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Snapshot | null>(null);

  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return <EmptyChart />;

  const firstAt = Math.min(...all.map((p) => p.at));
  const lastAt = Math.max(...all.map((p) => p.at));
  // 기간이 첫 기록보다 앞서 시작하면 빈 앞부분을 그리지 않는다.
  let x0 = from === null ? firstAt : Math.max(from, firstAt);
  let x1 = lastAt;
  if (x1 - x0 < 3_600_000) {
    // 점 하나 · 몇 분짜리 기록도 축이 무너지지 않게 앞뒤로 반나절씩 벌린다.
    x0 -= 12 * 3_600_000;
    x1 += 12 * 3_600_000;
  }

  // 기간 시작 직전의 점은 선을 이어 그리려고 넣고, 그림 밖은 clipPath 로 자른다.
  const visible = series.map((s) => {
    const firstIn = s.points.findIndex((p) => p.at >= x0);
    if (firstIn === -1) return { ...s, points: [] as Point[], inRange: [] as Point[] };
    const start = Math.max(0, firstIn - 1);
    return { ...s, points: s.points.slice(start), inRange: s.points.slice(firstIn) };
  });

  const values: number[] = [];
  for (const s of visible) {
    for (const p of s.inRange) values.push(p.value);
    const before = s.points[0];
    const after = s.inRange[0];
    if (before && after && before !== after && after.at !== before.at) {
      values.push(before.value + ((after.value - before.value) * (x0 - before.at)) / (after.at - before.at));
    }
  }
  if (values.length === 0) return <EmptyChart />;
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const padY = (hi - lo) * 0.08 || Math.max(1, Math.abs(hi) * 0.05);
  lo -= padY;
  hi += padY;

  const sx = (at: number) => PAD.left + ((at - x0) / (x1 - x0)) * PLOT_W;
  const sy = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * PLOT_H;
  const ticksY = yTicks(lo, hi).filter((t) => t.value >= lo && t.value <= hi);
  const ticksX = timeTicks(x0, x1);

  const hoverable = visible.flatMap((s) => s.inRange);
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || hoverable.length === 0) return;
    const at = x0 + (((e.clientX - rect.left) / rect.width) * W - PAD.left) * ((x1 - x0) / PLOT_W);
    let best = hoverable[0];
    for (const p of hoverable) if (Math.abs(p.at - at) < Math.abs(best.at - at)) best = p;
    setHover(best.snapshot);
  };

  const clipId = `clip-${ariaLabel.replace(/\s/g, '')}`;
  const hoverX = hover ? sx(hover.at) : null;

  return (
    <figure className="relative m-0">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top - 6} width={PLOT_W} height={PLOT_H + 12} />
          </clipPath>
        </defs>

        {gaps
          .filter((g) => g.to > x0 && g.from < x1)
          .map((g) => (
            <rect
              key={g.from}
              x={sx(Math.max(g.from, x0))}
              y={PAD.top}
              width={sx(Math.min(g.to, x1)) - sx(Math.max(g.from, x0))}
              height={PLOT_H}
              fill="var(--surface-2)"
            >
              <title>기록이 7일 넘게 없던 구간</title>
            </rect>
          ))}

        {ticksY.map((t) => (
          <g key={t.value}>
            <line x1={PAD.left} x2={W - PAD.right} y1={sy(t.value)} y2={sy(t.value)} stroke="var(--line)" />
            <text x={PAD.left - 8} y={sy(t.value) + 4} textAnchor="end" fontSize={12} fill="var(--ink-3)">
              {t.label}
            </text>
          </g>
        ))}

        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom}
          stroke="var(--line-strong)"
        />
        {ticksX.map((t) => (
          <text key={t.value} x={sx(t.value)} y={H - 10} textAnchor="middle" fontSize={12} fill="var(--ink-3)">
            {t.label}
          </text>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {visible
            .filter((s) => !s.primary)
            .concat(visible.filter((s) => s.primary))
            .map((s) => (
              <g key={s.key}>
                <path
                  d={s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.at).toFixed(1)},${sy(p.value).toFixed(1)}`).join('')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.primary ? 2 : 1.5}
                  strokeLinejoin="round"
                />
                {/* 점은 실제 기록 위치에만 — 사이의 선이 추정이라는 걸 보이게 한다. */}
                {s.inRange.map((p) => (
                  <circle
                    key={p.snapshot.id}
                    cx={sx(p.at)}
                    cy={sy(p.value)}
                    r={s.primary ? 3 : 2.5}
                    fill={s.color}
                    stroke="var(--surface-1)"
                    strokeWidth={1.5}
                  />
                ))}
              </g>
            ))}

        </g>

        {hover && hoverX !== null && (
          <g pointerEvents="none">
            <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--ink-3)" />
            {visible.map((s) => {
              const p = s.inRange.find((q) => q.snapshot.id === hover.id);
              return p ? (
                <circle
                  key={s.key}
                  cx={hoverX}
                  cy={sy(p.value)}
                  r={5}
                  fill={s.color}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              ) : null;
            })}
          </g>
        )}
      </svg>

      {hover && hoverX !== null && (
        <Tooltip xRatio={hoverX / W}>{renderTooltip(hover)}</Tooltip>
      )}

      {series.length > 1 && (
        <figcaption className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span aria-hidden className="inline-block h-[3px] w-3" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

/* ── 일별 막대 ─────────────────────────────────────────────────────────── */

export function DayBars({
  buckets,
  average,
  format,
  unit,
  ariaLabel,
}: {
  buckets: DayBucket[];
  /** 7일 이동평균. 덮이지 않은 날은 null. */
  average?: (number | null)[];
  format: (v: number) => string;
  unit: string;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const covered = buckets.filter((b) => b.covered);
  if (covered.length === 0) return <EmptyChart text="막대를 그리려면 기록이 두 개 이상 필요합니다" />;

  const vals = covered.map((b) => b.value).concat((average ?? []).filter((v): v is number => v !== null));
  let lo = Math.min(0, ...vals);
  let hi = Math.max(0, ...vals);
  if (lo === hi) hi = 1;
  const padY = (hi - lo) * 0.06;
  if (hi > 0) hi += padY;
  if (lo < 0) lo -= padY;

  const slot = PLOT_W / buckets.length;
  const gap = slot > 6 ? 2 : slot > 3 ? 1 : 0;
  const sy = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * PLOT_H;
  const x = (i: number) => PAD.left + i * slot;
  const ticks = niceTicks(lo, hi, format);
  const labelEvery = Math.ceil(buckets.length / 7);
  const anyEstimated = covered.some((b) => b.estimated);
  const avgPath = average
    ?.map((v, i) => (v === null ? null : `${x(i) + slot / 2},${sy(v)}`))
    .reduce<string[]>((acc, p, i, arr) => {
      if (p === null) return acc;
      acc.push(`${i > 0 && arr[i - 1] !== null ? 'L' : 'M'}${p}`);
      return acc;
    }, [])
    .join('');

  const hovered = hover === null ? null : buckets[hover];

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={ariaLabel}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t.value}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={sy(t.value)}
              y2={sy(t.value)}
              stroke={t.value === 0 ? 'var(--line-strong)' : 'var(--line)'}
            />
            <text x={PAD.left - 8} y={sy(t.value) + 4} textAnchor="end" fontSize={12} fill="var(--ink-3)">
              {t.label}
            </text>
          </g>
        ))}

        {buckets.map((b, i) => {
          if (!b.covered || b.value === 0) return null;
          const y0 = sy(0);
          const y1 = sy(b.value);
          return (
            <rect
              key={b.day}
              x={x(i) + gap / 2}
              y={Math.min(y0, y1)}
              width={Math.max(1, slot - gap)}
              height={Math.max(1, Math.abs(y1 - y0))}
              rx={Math.min(3, (slot - gap) / 2)}
              fill={b.value >= 0 ? 'var(--series-1)' : 'var(--series-down)'}
              opacity={b.estimated ? 0.45 : 1}
            />
          );
        })}

        {avgPath && (
          <path d={avgPath} fill="none" stroke="var(--series-avg)" strokeWidth={2} strokeLinejoin="round" />
        )}

        {buckets.map((b, i) =>
          i % labelEvery === 0 ? (
            <text
              key={b.day}
              x={x(i) + slot / 2}
              y={H - 10}
              textAnchor="middle"
              fontSize={12}
              fill="var(--ink-3)"
            >
              {formatDate(b.day)}
            </text>
          ) : null,
        )}

        {hover !== null && (
          <rect
            x={x(hover)}
            y={PAD.top}
            width={slot}
            height={PLOT_H}
            fill="var(--ink-1)"
            opacity={0.06}
            pointerEvents="none"
          />
        )}

        {/* 막대보다 넓은 히트 영역 — 얇은 막대도 짚을 수 있게 칸 전체를 받는다. */}
        {buckets.map((b, i) => (
          <rect
            key={`hit-${b.day}`}
            x={x(i)}
            y={PAD.top}
            width={slot}
            height={PLOT_H}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
            onPointerDown={() => setHover(i)}
          />
        ))}
      </svg>

      {hovered && hover !== null && (
        <Tooltip xRatio={(x(hover) + slot / 2) / W}>
          <div className="text-ink-3">{formatDay(hovered.day)}</div>
          {hovered.covered ? (
            <>
              <div className="tabular text-ink-1">
                {hovered.value >= 0 ? '+' : ''}
                {format(hovered.value)} {unit}
              </div>
              {average?.[hover] != null && (
                <div className="tabular text-ink-2">7일 평균 {format(average[hover] as number)}</div>
              )}
              {hovered.estimated && <div className="text-ink-3">기록 사이를 날짜별로 나눈 추정치</div>}
            </>
          ) : (
            <div className="text-ink-3">이날을 덮는 기록 없음</div>
          )}
        </Tooltip>
      )}

      <figcaption className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2">
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-2 w-2" style={{ background: 'var(--series-1)' }} />
          늘어남
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-2 w-2" style={{ background: 'var(--series-down)' }} />
          줄어듦
        </span>
        {average && (
          <span className="flex items-center gap-1">
            <span aria-hidden className="inline-block h-[3px] w-3" style={{ background: 'var(--series-avg)' }} />
            7일 평균
          </span>
        )}
        {anyEstimated && (
          <span className="flex items-center gap-1 text-ink-3">
            <span aria-hidden className="inline-block h-2 w-2 opacity-45" style={{ background: 'var(--series-1)' }} />
            흐린 막대 = 기록 사이를 날짜별로 고르게 나눈 추정치
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function Tooltip({ xRatio, children }: { xRatio: number; children: ReactNode }) {
  // 오른쪽 끝에서는 툴팁을 왼쪽으로 펼친다 — 그대로 두면 화면 밖으로 잘린다.
  const flip = xRatio > 0.6;
  return (
    <div
      className="pointer-events-none absolute top-2 z-20 max-w-[260px] rounded-lg border border-line bg-surface-3 px-3 py-2 text-[12px] leading-relaxed shadow-[var(--shadow-lg)]"
      style={flip ? { right: `${(1 - xRatio) * 100 + 1}%` } : { left: `${xRatio * 100 + 1}%` }}
    >
      {children}
    </div>
  );
}

function EmptyChart({ text = '이 기간에 기록이 없습니다' }: { text?: string }) {
  return (
    <div className="flex h-[120px] items-center justify-center rounded-xl bg-surface-2 text-[13px] text-ink-3">{text}</div>
  );
}
