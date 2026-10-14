import { describe, expect, it } from 'vitest';
import { EXP_TABLE } from '../expTable';
import { parseExpText, parseMeso, resolveExp } from '../parse';

describe('parseMeso', () => {
  const ok = (s: string) => {
    const r = parseMeso(s);
    return r.ok ? r.value : 'invalid';
  };

  it('숫자 그대로', () => {
    expect(ok('125000000')).toBe(125_000_000);
    expect(ok('125,000,000')).toBe(125_000_000);
    expect(ok(' 0 ')).toBe(0);
  });

  it('빈 칸은 안 적음(null)', () => {
    expect(ok('')).toBeNull();
    expect(ok('   ')).toBeNull();
  });

  it('억·만·천', () => {
    expect(ok('1억2500만')).toBe(125_000_000);
    expect(ok('1억 2,500만')).toBe(125_000_000);
    expect(ok('1.25억')).toBe(125_000_000);
    expect(ok('12500만')).toBe(125_000_000);
    expect(ok('3천만')).toBe(30_000_000);
    expect(ok('5천')).toBe(5_000);
    expect(ok('1억 3000')).toBe(100_003_000);
    expect(ok('2천만 3천')).toBe(20_003_000);
  });

  it('순서가 뒤집히거나 모르는 글자는 거절', () => {
    expect(ok('3만 2억')).toBe('invalid');
    expect(ok('1만 1만')).toBe('invalid');
    expect(ok('억')).toBe('invalid');
    expect(ok('12abc')).toBe('invalid');
    expect(ok('-5')).toBe('invalid');
  });
});

describe('parseExpText / resolveExp', () => {
  const need72 = EXP_TABLE[72];

  it('값과 퍼센트를 함께 적으면 둘 다 읽는다', () => {
    expect(parseExpText('1301770001[89.15%]')).toEqual({ kind: 'both', value: 1301770001, percent: 89.15 });
    expect(parseExpText('1301770001 [89.15%')).toEqual({ kind: 'both', value: 1301770001, percent: 89.15 });
    expect(parseExpText('12.5%')).toEqual({ kind: 'percent', percent: 12.5 });
    expect(parseExpText('1,234')).toEqual({ kind: 'value', value: 1234 });
    expect(parseExpText('')).toEqual({ kind: 'empty' });
    expect(parseExpText('abc')).toEqual({ kind: 'invalid' });
  });

  it('퍼센트만 넣으면 값으로 바꾸고 추정 표시를 단다', () => {
    const r = resolveExp({ kind: 'percent', percent: 50 }, 72);
    expect(r).toEqual({ ok: true, exp: Math.round(need72 / 2), percent: 50, fromPercent: true });
  });

  it('그 레벨 필요량 이상은 거절', () => {
    expect(resolveExp({ kind: 'value', value: need72 }, 72)).toMatchObject({ ok: false });
    expect(resolveExp({ kind: 'value', value: need72 - 1 }, 72)).toMatchObject({ ok: true });
  });

  it('값과 퍼센트가 어긋나면 거절, 끊어 보여 준 정도는 허용', () => {
    const value = Math.floor(need72 * 0.8915678);
    expect(resolveExp({ kind: 'both', value, percent: 89.15 }, 72)).toMatchObject({ ok: true, exp: value });
    expect(resolveExp({ kind: 'both', value, percent: 80 }, 72)).toMatchObject({ ok: false });
  });

  it('레벨 없이는 확정할 수 없다', () => {
    expect(resolveExp({ kind: 'value', value: 5 }, null)).toMatchObject({ ok: false });
    expect(resolveExp({ kind: 'empty' }, 72)).toBeNull();
  });
});
