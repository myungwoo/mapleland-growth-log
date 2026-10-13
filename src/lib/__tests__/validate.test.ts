import { describe, expect, it } from 'vitest';
import { EXP_TABLE } from '../expTable';
import { validateDraft, type Draft } from '../validate';
import { snap, t } from './helpers';

const now = t('2026-10-13T12:00');
const draft = (d: Partial<Draft>): Draft => ({ at: now, level: 50, exp: 0, invMeso: null, storageMeso: null, ...d });
const sev = (issues: { severity: string }[]) => issues.map((i) => i.severity);

describe('validateDraft', () => {
  const need = EXP_TABLE[50];
  const prev = snap('2026-10-12T12:00', 50, need / 2, { invMeso: 1_000_000, storageMeso: 5_000_000 });

  it('평범한 기록은 문제없다', () => {
    expect(validateDraft(draft({ exp: need * 0.6, invMeso: 2_000_000, storageMeso: 5_000_000 }), prev, now)).toEqual([]);
    expect(validateDraft(draft({}), null, now)).toEqual([]);
  });

  it('미래 시각은 막는다', () => {
    expect(sev(validateDraft(draft({ at: now + 3_600_000 }), null, now))).toEqual(['error']);
  });

  it('레벨이 내려가면 확인', () => {
    expect(sev(validateDraft(draft({ level: 49 }), prev, now))).toEqual(['confirm']);
  });

  it('같은 레벨에서 경험치가 줄면 확인', () => {
    expect(sev(validateDraft(draft({ exp: need * 0.45 }), prev, now))).toEqual(['confirm']);
  });

  it('메소 0 개수 실수', () => {
    expect(sev(validateDraft(draft({ exp: need / 2, invMeso: 10_000_000 }), prev, now))).toEqual(['confirm']);
    expect(sev(validateDraft(draft({ exp: need / 2, storageMeso: 500_000 }), prev, now))).toEqual(['confirm']);
    // 0 에서 / 0 으로는 실수라고 볼 수 없다
    expect(sev(validateDraft(draft({ exp: need / 2, invMeso: 0 }), prev, now))).toEqual([]);
  });
});
