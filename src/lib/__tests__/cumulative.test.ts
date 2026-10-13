import { describe, expect, it } from 'vitest';
import { expPercent, fractionalLevel, fromTotal, levelBase, totalExp } from '../cumulative';
import { EXP_TABLE } from '../expTable';

describe('누적 경험치', () => {
  it('1레벨 0경험치가 0 이다', () => {
    expect(levelBase(1)).toBe(0);
    expect(totalExp(1, 0)).toBe(0);
  });

  it('레벨 경계가 이어진다', () => {
    expect(levelBase(2)).toBe(EXP_TABLE[1]);
    expect(totalExp(1, EXP_TABLE[1])).toBe(totalExp(2, 0));
    expect(levelBase(3)).toBe(EXP_TABLE[1] + EXP_TABLE[2]);
  });

  it('fromTotal 은 totalExp 의 역이다', () => {
    for (const [level, exp] of [
      [1, 0],
      [1, 14],
      [2, 0],
      [72, 123456],
      [150, 999],
      [200, 5],
    ]) {
      expect(fromTotal(totalExp(level, exp))).toEqual({ level, exp });
    }
  });

  it('소수 레벨과 퍼센트', () => {
    const need = EXP_TABLE[72];
    expect(fractionalLevel(72, need / 2)).toBeCloseTo(72.5);
    expect(expPercent(72, need / 4)).toBeCloseTo(25);
  });
});
