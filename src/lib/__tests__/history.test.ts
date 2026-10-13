import { describe, expect, it } from 'vitest';
import { EXP_TABLE } from '../expTable';
import { bigMesoChanges, levelReaches, levelRows } from '../history';
import { snap, t } from './helpers';

describe('levelReaches', () => {
  it('경계를 누적 경험치로 보간한다', () => {
    // 10레벨 0 → 11레벨 (10레벨 필요량과 같은 양) : 경계는 정확히 가운데
    const list = [snap('2026-10-01T00:00', 10, 0), snap('2026-10-01T10:00', 11, EXP_TABLE[10])];
    expect(levelReaches(list)).toEqual([{ level: 11, at: t('2026-10-01T05:00') }]);
  });

  it('한 구간에 여러 레벨이 오르면 레벨마다 따로 보간한다', () => {
    const list = [snap('2026-10-01T00:00', 10, 0), snap('2026-10-02T00:00', 13, 0)];
    const r = levelReaches(list);
    expect(r.map((x) => x.level)).toEqual([11, 12, 13]);
    expect(r[2].at).toBe(t('2026-10-02T00:00'));
    // 필요량이 커지므로 간격도 커진다
    expect(r[1].at - r[0].at).toBeGreaterThan(r[0].at - t('2026-10-01T00:00'));
  });

  it('레벨이 내려간 구간은 건너뛰고 처음 도달만 남긴다', () => {
    const list = [
      snap('2026-10-01T00:00', 10, 0),
      snap('2026-10-02T00:00', 11, 0),
      snap('2026-10-03T00:00', 1, 0),
      snap('2026-10-04T00:00', 11, 5),
    ];
    expect(levelReaches(list).filter((r) => r.level === 11)).toEqual([{ level: 11, at: t('2026-10-02T00:00') }]);
  });

  it('levelRows: 다음 레벨을 알아야 걸린 기간이 있다', () => {
    const rows = levelRows([snap('2026-10-01T00:00', 10, 0), snap('2026-10-03T00:00', 12, 0)]);
    expect(rows.map((r) => r.level)).toEqual([11, 12]);
    expect(rows[0].durationMs).toBe(rows[1].reachedAt - rows[0].reachedAt);
    expect(rows[1].durationMs).toBeNull();
  });
});

describe('bigMesoChanges', () => {
  it('평소 변화폭 중앙값의 5배 이상', () => {
    const values = [100, 110, 120, 130, 140, 150, 10, 160];
    const list = values.map((v, i) => snap(`2026-10-0${i + 1}T00:00`, 10, 0, { invMeso: v, storageMeso: 0 }));
    const big = bigMesoChanges(list);
    expect([...big.keys()]).toEqual([list[6].id, list[7].id]);
  });

  it('기록이 적으면 판단하지 않는다', () => {
    const list = [100, 1000].map((v, i) => snap(`2026-10-0${i + 1}T00:00`, 10, 0, { invMeso: v, storageMeso: 0 }));
    expect(bigMesoChanges(list).size).toBe(0);
  });
});
