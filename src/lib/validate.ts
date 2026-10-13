import { expPercent } from './cumulative';
import { formatKorean } from './format';
import type { Snapshot } from './model';

export interface Draft {
  at: number;
  level: number;
  exp: number;
  invMeso: number | null;
  storageMeso: number | null;
}

/**
 * - error: 저장하지 않는다. 거의 확실한 오타.
 * - confirm: "그래도 기록"을 눌러야 저장한다. 드물지만 있을 수 있는 일.
 */
export type Severity = 'error' | 'confirm';

export interface Issue {
  severity: Severity;
  message: string;
}

/** 메소가 직전의 이 배 이상 / 이 분의 1 이하로 바뀌면 0 개수 실수를 의심한다. */
const MESO_JUMP_RATIO = 10;
/** 시계가 조금 어긋난 기기를 막지 않으려고 둔 여유. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;

/**
 * 저장 전 검사. `prev` 는 같은 캐릭터에서 `draft.at` 바로 앞의 기록이다 (수정 중인 기록 제외).
 *
 * 막는 건 확실한 오타뿐이고, 나머지는 확인만 받는다. 레벨이 내려가는 일도 실제로 있을 수
 * 있는 입력(다른 캐릭터 기록을 잘못 넣었다가 고치는 중 등)이라 막지 않는다.
 */
export function validateDraft(draft: Draft, prev: Snapshot | null, now: number): Issue[] {
  const issues: Issue[] = [];
  if (draft.at > now + FUTURE_TOLERANCE_MS) {
    issues.push({ severity: 'error', message: '미래 시각으로는 기록할 수 없습니다' });
  }
  if (!prev) return issues;

  if (draft.level < prev.level) {
    issues.push({
      severity: 'confirm',
      message: `레벨이 직전 기록(${prev.level})보다 낮은 ${draft.level} 입니다`,
    });
  } else if (draft.level === prev.level && draft.exp < prev.exp) {
    // 같은 레벨에서 경험치가 줄어드는 일은 드물어서, 대개 숫자를 잘못 옮긴 것이다.
    const lost = expPercent(prev.level, prev.exp) - expPercent(draft.level, draft.exp);
    issues.push({
      severity: 'confirm',
      message: `경험치가 직전 기록보다 ${lost.toFixed(2)}%p 줄었습니다`,
    });
  }

  for (const [label, now, before] of [
    ['인벤 메소', draft.invMeso, prev.invMeso],
    ['창고 메소', draft.storageMeso, prev.storageMeso],
  ] as const) {
    if (now === null || before === null || now === 0 || before === 0) continue;
    const ratio = now / before;
    if (ratio >= MESO_JUMP_RATIO || ratio <= 1 / MESO_JUMP_RATIO) {
      issues.push({
        severity: 'confirm',
        message: `${label}가 직전(${formatKorean(before)})에서 ${formatKorean(now)}(으)로 ${ratio >= 1 ? '10배 넘게 늘었' : '10분의 1 밑으로 줄었'}습니다. 0 개수를 확인해 주세요`,
      });
    }
  }
  return issues;
}
