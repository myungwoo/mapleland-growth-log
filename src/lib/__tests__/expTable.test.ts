import { describe, expect, it } from 'vitest';
import { EXP_TABLE, MAX_LEVEL } from '../expTable';

describe('EXP_TABLE', () => {
  it('1~200 레벨이 빠짐없이 있다', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) expect(EXP_TABLE[level]).toBeGreaterThan(0);
    expect(EXP_TABLE[MAX_LEVEL + 1]).toBeUndefined();
  });

  it('경험치 측정기의 표와 같다 (합계 스냅샷)', () => {
    // 측정기 표가 바뀌면 이 숫자가 어긋난다. 그쪽을 보고 함께 고칠 것.
    const sum = Object.values(EXP_TABLE).reduce((s, v) => s + v, 0);
    expect(sum).toBe(40824484208);
  });
});
