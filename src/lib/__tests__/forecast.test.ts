import { describe, expect, it } from 'vitest';
import { eta, trend } from '../forecast';
import { DAY_MS } from '../format';
import { expPoints } from '../series';
import { snap, t } from './helpers';

describe('trend', () => {
  it('일정한 페이스면 그 페이스가 나온다', () => {
    const pts = expPoints([0, 1, 2, 3, 4].map((d) => snap(`2026-10-0${d + 1}T00:00`, 10, d * 100)));
    expect(trend(pts, 7)?.perDay).toBeCloseTo(100);
  });

  it('기간 경계 앞 기록과 이어서 추정점을 넣는다', () => {
    // 하루에 한 번이 아니라 9월 말 한 번 + 최근 두 번
    const pts = expPoints([
      snap('2026-09-20T00:00', 10, 0),
      snap('2026-10-08T00:00', 10, 1800),
      snap('2026-10-10T00:00', 10, 2000),
    ]);
    const tr = trend(pts, 7);
    expect(tr?.from).toBe(t('2026-10-03T00:00'));
    expect(tr?.perDay).toBeCloseTo(100);
  });

  it('기록이 짧으면 예측하지 않는다', () => {
    const pts = expPoints([snap('2026-10-01T00:00', 10, 0), snap('2026-10-02T00:00', 10, 100)]);
    expect(trend(pts, 7)).toBeNull();
    expect(trend(expPoints([snap('2026-10-01T00:00', 10, 0)]), 7)).toBeNull();
  });
});

describe('eta', () => {
  const pts = expPoints([0, 1, 2, 3].map((d) => snap(`2026-10-0${d + 1}T00:00`, 10, d * 100)));
  const tr = trend(pts, 7)!;

  it('마지막 기록에서 출발한다', () => {
    const e = eta(tr, pts[3].value + 250);
    expect(e.kind).toBe('at');
    if (e.kind === 'at') expect(e.at).toBeCloseTo(t('2026-10-04T00:00') + 2.5 * DAY_MS, -3);
  });

  it('이미 넘었거나 추세가 0 이하', () => {
    expect(eta(tr, 0)).toEqual({ kind: 'reached' });
    expect(eta({ ...tr, perDay: -5 }, pts[3].value + 1)).toEqual({ kind: 'never' });
  });
});
