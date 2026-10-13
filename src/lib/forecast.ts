import { DAY_MS } from './format';
import { valueAt, type Point } from './series';

/** 예측에 쓰는 최근 기간. 둘을 나란히 보여 준다 — 회귀 신뢰구간보다 사람에게 읽힌다. */
export const FORECAST_WINDOWS = [7, 30] as const;

/** 예측을 띄우려면 이만큼은 쌓여 있어야 한다. 이보다 짧으면 하루 사냥 한 번이 전부를 정한다. */
export const MIN_SPAN_MS = 2 * DAY_MS;
export const MIN_RECORDS = 2;

export interface Trend {
  windowDays: number;
  /** 하루당 변화량. */
  perDay: number;
  /** 추세를 계산한 실제 범위. */
  from: number;
  to: number;
  /** 기준점 — 마지막 기록. */
  anchor: Point;
}

/**
 * 최근 N일의 추세(하루당 변화량)를 최소제곱 직선으로 구한다.
 *
 * 기간 시작이 두 기록 사이에 떨어지면 그 시점 값을 직선으로 추정해 점 하나로 넣는다.
 * 하루에 한 번만 적는 사람은 7일 안에 기록이 몇 개 안 되는데, 경계 점이 없으면 앞쪽
 * 며칠이 통째로 빠진다.
 *
 * 기준은 "지금"이 아니라 마지막 기록이다. 사흘 전에 마지막으로 적었으면 그 뒤는 모른다.
 */
export function trend(points: Point[], windowDays: number): Trend | null {
  if (points.length === 0) return null;
  const anchor = points[points.length - 1];
  const from = anchor.at - windowDays * DAY_MS;
  const inside = points.filter((p) => p.at >= from);
  if (inside.length < MIN_RECORDS) return null;

  const xs: number[] = [];
  const ys: number[] = [];
  const boundary = from > points[0].at ? valueAt(points, from) : null;
  if (boundary !== null) {
    xs.push(from);
    ys.push(boundary);
  }
  for (const p of inside) {
    xs.push(p.at);
    ys.push(p.value);
  }
  const start = xs[0];
  if (anchor.at - start < MIN_SPAN_MS) return null;

  // 시각을 일 단위로 바꿔서 푼다. ms 그대로 제곱하면 1e24 근처라 정밀도가 무너진다.
  const n = xs.length;
  const dx = xs.map((x) => (x - start) / DAY_MS);
  const mx = dx.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (dx[i] - mx) ** 2;
    sxy += (dx[i] - mx) * (ys[i] - my);
  }
  if (sxx === 0) return null;
  return { windowDays, perDay: sxy / sxx, from: start, to: anchor.at, anchor };
}

export type Eta =
  | { kind: 'reached' }
  /** 추세가 0 이하라 이대로면 닿지 않는다. */
  | { kind: 'never' }
  | { kind: 'at'; at: number };

/**
 * 목표 값에 닿는 시각. 마지막 기록에서 출발해 추세의 기울기로 늘린다.
 *
 * 회귀 직선의 절편에서 출발하지 않는 이유: 큰 지출 직후라면 직선이 마지막 기록보다
 * 위에 있어서 "이미 지났어야 할" 목표가 나온다. 사람은 "지금 여기서 이 페이스로"를 묻는다.
 */
export function eta(t: Trend, target: number): Eta {
  const remaining = target - t.anchor.value;
  if (remaining <= 0) return { kind: 'reached' };
  if (!(t.perDay > 0)) return { kind: 'never' };
  return { kind: 'at', at: t.anchor.at + (remaining / t.perDay) * DAY_MS };
}
