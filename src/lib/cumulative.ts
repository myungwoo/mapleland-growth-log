import { EXP_TABLE, MAX_LEVEL } from './expTable';

/**
 * 누적 경험치 — 1레벨 0경험치에서부터 쌓은 경험치의 총량.
 *
 * 레벨과 레벨 내 경험치를 그대로 그리면 레벨업마다 톱니가 생겨 추세가 안 보인다. 누적으로
 * 바꾸면 거의 줄어들지 않는 한 줄이 되어, 페이스 · 예측을 이 위에서 계산할 수 있다.
 *
 * ⚠️ 예측은 반드시 누적 경험치 공간에서 하고 결과만 레벨로 바꾼다. 고레벨일수록 레벨당
 * 필요량이 커서, 소수 레벨(72.43)에 직선을 그으면 도달 시각이 체계적으로 이르게 나온다.
 */

/** BASE[L] = L레벨 0경험치의 누적 경험치. BASE[1] = 0. */
const BASE: number[] = (() => {
  const base = [0, 0];
  for (let level = 1; level <= MAX_LEVEL; level++) base.push(base[level] + EXP_TABLE[level]);
  return base;
})();

/** L레벨 0경험치의 누적 경험치. */
export function levelBase(level: number): number {
  return BASE[Math.max(1, Math.min(MAX_LEVEL + 1, Math.floor(level)))];
}

export function totalExp(level: number, exp: number): number {
  return levelBase(level) + exp;
}

/** 누적 경험치 → (레벨, 레벨 내 경험치). 표 범위를 넘으면 끝 레벨에 붙인다. */
export function fromTotal(total: number): { level: number; exp: number } {
  if (!(total > 0)) return { level: 1, exp: 0 };
  // 레벨이 200개뿐이라 이분 탐색까지 갈 이유가 없지만, 그래프 축을 그릴 때 수백 번 불린다.
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (BASE[mid] <= total) lo = mid;
    else hi = mid - 1;
  }
  return { level: lo, exp: total - BASE[lo] };
}

/** 72레벨 89.15% → 72.8915. 사람에게 와닿는 단위라 화면에서는 이쪽을 주로 쓴다. */
export function fractionalLevel(level: number, exp: number): number {
  const need = EXP_TABLE[level];
  return need ? level + Math.min(1, Math.max(0, exp / need)) : level;
}

export function fractionalLevelOfTotal(total: number): number {
  const { level, exp } = fromTotal(total);
  return fractionalLevel(level, exp);
}

/** 레벨 내 경험치를 퍼센트(0~100)로. */
export function expPercent(level: number, exp: number): number {
  const need = EXP_TABLE[level];
  return need ? (exp / need) * 100 : 0;
}
