import { totalExp } from './cumulative';
import { DAY_MS, dayStart, nextDayStart } from './format';
import { totalMeso, type Snapshot } from './model';

/** 시계열의 한 점. 실제 기록 위치에만 있다 — 사이를 잇는 선은 추정이다. */
export interface Point {
  at: number;
  value: number;
  /** 원본 기록. 툴팁에서 그대로 보여 준다. */
  snapshot: Snapshot;
}

/** 시각 순으로 정렬된 기록 → 누적 경험치 점. */
export function expPoints(snapshots: Snapshot[]): Point[] {
  return snapshots.map((s) => ({ at: s.at, value: totalExp(s.level, s.exp), snapshot: s }));
}

/** 메소 점. 안 적은(null) 기록은 건너뛴다 — 0 으로 그리면 가짜 절벽이 생긴다. */
export function mesoPoints(snapshots: Snapshot[], pick: (s: Snapshot) => number | null = totalMeso): Point[] {
  const out: Point[] = [];
  for (const s of snapshots) {
    const value = pick(s);
    if (value !== null) out.push({ at: s.at, value, snapshot: s });
  }
  return out;
}

/** 두 기록 사이를 직선으로 이은 값. 기록 범위 밖이면 null (모르는 걸 지어내지 않는다). */
export function valueAt(points: Point[], at: number): number | null {
  if (points.length === 0 || at < points[0].at || at > points[points.length - 1].at) return null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (at > b.at) continue;
    if (b.at === a.at) return b.value;
    return a.value + ((b.value - a.value) * (at - a.at)) / (b.at - a.at);
  }
  return points[points.length - 1].value;
}

/* ── 기간 ─────────────────────────────────────────────────────────────── */

export type RangeKey = '7d' | '30d' | '90d' | 'all';

export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '7d', label: '7일', days: 7 },
  { key: '30d', label: '30일', days: 30 },
  { key: '90d', label: '90일', days: 90 },
  { key: 'all', label: '전체', days: null },
];

/** "최근 7일" = 오늘을 포함한 7일. 하루는 로컬 오전 7시에 시작한다 (`DAY_START_HOUR`). */
export function rangeStart(key: RangeKey, now: number): number | null {
  const days = RANGES.find((r) => r.key === key)?.days ?? null;
  if (days === null) return null;
  const d = new Date(dayStart(now));
  d.setDate(d.getDate() - (days - 1));
  return d.getTime();
}

export interface PeriodChange {
  /** 기간 시작 값. 기간이 기록보다 앞서 시작하면 첫 기록 값이다. */
  startAt: number;
  startValue: number;
  endAt: number;
  endValue: number;
  change: number;
  /** 하루 평균. 잰 기간이 하루가 안 되면 null — 몇 시간짜리를 하루로 늘리면 과장된다. */
  perDay: number | null;
}

/**
 * 기간 동안의 변화. 끝은 마지막 기록이다 (그 뒤는 모른다).
 *
 * 기간 시작이 두 기록 사이에 떨어지면 그 시점 값을 직선으로 추정한다.
 */
export function periodChange(points: Point[], from: number | null): PeriodChange | null {
  if (points.length === 0) return null;
  const last = points[points.length - 1];
  if (from !== null && from > last.at) return null;
  const startAt = from === null || from < points[0].at ? points[0].at : from;
  const startValue = valueAt(points, startAt) ?? points[0].value;
  const span = last.at - startAt;
  const change = last.value - startValue;
  return {
    startAt,
    startValue,
    endAt: last.at,
    endValue: last.value,
    change,
    perDay: span >= DAY_MS ? (change / span) * DAY_MS : null,
  };
}

/* ── 일 단위 배분 ─────────────────────────────────────────────────────── */

export interface DayBucket {
  /** 그날의 시작 (오전 7시). */
  day: number;
  value: number;
  /**
   * 날짜 경계를 넘는 구간에서 나눠 받은 몫이 섞였는지. 하루 안에서 시작하고 끝나는
   * 구간만으로 채워진 날만 실측이다. 화면은 추정인 날을 흐리게 그린다.
   */
  estimated: boolean;
  /** 그날에 걸친 기록 구간이 하나라도 있는지. 없으면 막대를 그리지 않는다. */
  covered: boolean;
}

/**
 * 기록 사이의 변화를 날짜별로 나눈다.
 *
 * 기록은 불규칙하다. 월요일 밤 → 목요일 밤 사이에 오른 경험치를 어느 날에 넣을지는 알 수
 * 없으므로, 구간 안에서 **시간에 비례해 고르게** 나눈다. 끝 날에 몰아넣으면 막대가 들쭉날쭉해
 * 오히려 거짓 신호가 된다. 대신 이렇게 나눈 날은 `estimated` 로 표시한다.
 */
export function dailyChanges(points: Point[], from: number | null, to: number): DayBucket[] {
  if (points.length < 2) return [];
  const firstDay = dayStart(Math.max(from ?? -Infinity, points[0].at));
  const lastDay = dayStart(Math.min(to, points[points.length - 1].at));
  if (firstDay > lastDay) return [];

  const buckets = new Map<number, DayBucket>();
  for (let day = firstDay; day <= lastDay; day = nextDayStart(day)) {
    buckets.set(day, { day, value: 0, estimated: false, covered: false });
  }

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const delta = b.value - a.value;
    if (b.at === a.at) {
      const bucket = buckets.get(dayStart(b.at));
      if (bucket) {
        bucket.value += delta;
        bucket.covered = true;
      }
      continue;
    }
    const spansDays = dayStart(a.at) !== dayStart(b.at);
    for (let day = dayStart(a.at); day <= b.at; day = nextDayStart(day)) {
      const bucket = buckets.get(day);
      if (!bucket) continue;
      const overlap = Math.min(b.at, nextDayStart(day)) - Math.max(a.at, day);
      if (overlap <= 0) continue;
      bucket.value += (delta * overlap) / (b.at - a.at);
      bucket.covered = true;
      if (spansDays) bucket.estimated = true;
    }
  }
  return [...buckets.values()];
}

/** 덮인 날만 세는 이동평균. 덮이지 않은 날은 null. */
export function movingAverage(buckets: DayBucket[], window = 7): (number | null)[] {
  return buckets.map((b, i) => {
    if (!b.covered) return null;
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      if (!buckets[j].covered) continue;
      sum += buckets[j].value;
      n++;
    }
    return n ? sum / n : null;
  });
}

/** 기록이 오래 끊긴 구간. 그래프에서 음영으로 보여 준다 — 그 사이 선은 거의 지어낸 것이다. */
export const GAP_MS = 7 * DAY_MS;

export function gaps(points: Point[], minGap = GAP_MS): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i].at - points[i - 1].at >= minGap) out.push({ from: points[i - 1].at, to: points[i].at });
  }
  return out;
}
