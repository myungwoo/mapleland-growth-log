import { describe, expect, it } from 'vitest';
import { formatDay } from '../format';
import { dailyChanges, expPoints, gaps, mesoPoints, periodChange, rangeStart, valueAt } from '../series';
import { snap, t } from './helpers';

describe('valueAt', () => {
  const pts = expPoints([snap('2026-10-01T00:00', 10, 0), snap('2026-10-01T10:00', 10, 1000)]);
  it('사이는 직선, 밖은 모른다', () => {
    expect(valueAt(pts, t('2026-10-01T05:00')) ?? 0).toBeCloseTo(pts[0].value + 500);
    expect(valueAt(pts, t('2026-09-30T23:00'))).toBeNull();
    expect(valueAt(pts, t('2026-10-01T11:00'))).toBeNull();
  });
});

describe('mesoPoints', () => {
  it('인벤이나 창고를 안 적은 기록은 합계 점이 없다', () => {
    const pts = mesoPoints([
      snap('2026-10-01T00:00', 10, 0, { invMeso: 100, storageMeso: 50 }),
      snap('2026-10-02T00:00', 10, 0, { invMeso: 200, storageMeso: null }),
      snap('2026-10-03T00:00', 10, 0, { invMeso: 0, storageMeso: 0 }),
    ]);
    expect(pts.map((p) => p.value)).toEqual([150, 0]);
  });
});

describe('dailyChanges', () => {
  it('자정을 넘는 구간은 시간에 비례해 나누고 추정으로 표시한다', () => {
    // 10/1 18:00 → 10/3 06:00 (36시간) 동안 3600 증가: 6h / 24h / 6h
    const pts = expPoints([snap('2026-10-01T18:00', 10, 0), snap('2026-10-03T06:00', 10, 3600)]);
    const days = dailyChanges(pts, null, t('2026-10-10T00:00'));
    expect(days.map((d) => formatDay(d.day))).toEqual(['10/1(목)', '10/2(금)', '10/3(토)']);
    expect(days.map((d) => Math.round(d.value))).toEqual([600, 2400, 600]);
    expect(days.every((d) => d.estimated && d.covered)).toBe(true);
  });

  it('하루 안에서 끝나는 구간만 있는 날은 실측이다', () => {
    const pts = expPoints([
      snap('2026-10-01T10:00', 10, 0),
      snap('2026-10-01T12:00', 10, 500),
      snap('2026-10-01T20:00', 10, 800),
    ]);
    const [day] = dailyChanges(pts, null, t('2026-10-10T00:00'));
    expect(day).toMatchObject({ value: 800, estimated: false, covered: true });
  });

  it('여러 레벨을 건너도 합계가 보존된다', () => {
    const list = [snap('2026-10-01T10:00', 10, 0), snap('2026-10-04T10:00', 14, 7), snap('2026-10-05T03:00', 15, 2)];
    const pts = expPoints(list);
    const sum = dailyChanges(pts, null, t('2026-10-10T00:00')).reduce((s, d) => s + d.value, 0);
    expect(sum).toBeCloseTo(pts[2].value - pts[0].value, 6);
  });

  it('기간 시작 앞은 자른다', () => {
    const pts = expPoints([snap('2026-10-01T00:00', 10, 0), snap('2026-10-05T00:00', 10, 400)]);
    const days = dailyChanges(pts, t('2026-10-03T00:00'), t('2026-10-10T00:00'));
    expect(days.map((d) => formatDay(d.day))).toEqual(['10/3(토)', '10/4(일)', '10/5(월)']);
    expect(days.map((d) => Math.round(d.value))).toEqual([100, 100, 0]);
  });
});

describe('periodChange', () => {
  const pts = expPoints([snap('2026-10-01T00:00', 10, 0), snap('2026-10-11T00:00', 10, 1000)]);

  it('기간 시작이 기록 사이면 그 시점 값을 추정한다', () => {
    const p = periodChange(pts, t('2026-10-06T00:00'));
    expect(p?.change).toBeCloseTo(500);
    expect(p?.perDay).toBeCloseTo(100);
  });

  it('기간이 기록보다 먼저 시작하면 첫 기록부터', () => {
    expect(periodChange(pts, t('2026-09-01T00:00'))?.change).toBeCloseTo(1000);
  });

  it('기간 안에 기록이 없으면 null', () => {
    expect(periodChange(pts, t('2026-10-12T00:00'))).toBeNull();
  });

  it('하루가 안 되면 하루 평균을 내지 않는다', () => {
    const short = expPoints([snap('2026-10-01T00:00', 10, 0), snap('2026-10-01T05:00', 10, 1000)]);
    expect(periodChange(short, null)?.perDay).toBeNull();
  });
});

describe('rangeStart / gaps', () => {
  it('최근 7일은 오늘 포함', () => {
    expect(rangeStart('7d', t('2026-10-13T15:00'))).toBe(t('2026-10-07T00:00'));
    expect(rangeStart('all', t('2026-10-13T15:00'))).toBeNull();
  });

  it('7일 넘게 비면 공백', () => {
    const pts = expPoints([snap('2026-10-01T00:00', 10, 0), snap('2026-10-09T00:00', 10, 1), snap('2026-10-10T00:00', 10, 2)]);
    expect(gaps(pts)).toEqual([{ from: t('2026-10-01T00:00'), to: t('2026-10-09T00:00') }]);
  });
});
