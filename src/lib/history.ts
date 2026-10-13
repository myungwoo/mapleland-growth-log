import { levelBase, totalExp } from './cumulative';
import { EXP_TABLE } from './expTable';
import { totalMeso, type Snapshot } from './model';

/* ── 레벨 도달 시각 ───────────────────────────────────────────────────── */

export interface LevelReach {
  level: number;
  /** 추정 시각. 레벨 경계를 사이에 둔 두 기록 사이를 누적 경험치로 직선 보간한다. */
  at: number;
}

/**
 * 기록 사이에서 레벨이 오른 시각을 추정한다.
 *
 * 한 구간에 여러 레벨이 올랐으면 레벨마다 따로 보간한다. 경계마다 필요량이 다르므로
 * 레벨 수로 시간을 똑같이 나누면 틀린다.
 *
 * 레벨이 내려간 구간(오타였거나 다른 캐릭터를 잘못 고른 기록)은 건너뛴다. 같은 레벨에
 * 두 번 도달하면 처음 것만 남긴다.
 */
export function levelReaches(snapshots: Snapshot[]): LevelReach[] {
  const out = new Map<number, number>();
  for (let i = 1; i < snapshots.length; i++) {
    const a = snapshots[i - 1];
    const b = snapshots[i];
    if (b.level <= a.level) continue;
    const ta = totalExp(a.level, a.exp);
    const tb = totalExp(b.level, b.exp);
    for (let level = a.level + 1; level <= b.level; level++) {
      if (out.has(level)) continue;
      const ratio = tb === ta ? 1 : (levelBase(level) - ta) / (tb - ta);
      out.set(level, a.at + ratio * (b.at - a.at));
    }
  }
  return [...out.entries()].map(([level, at]) => ({ level, at })).sort((x, y) => x.level - y.level);
}

export interface LevelRow {
  level: number;
  reachedAt: number;
  /** 다음 레벨까지 걸린 시간. 아직 그 레벨이면 null. */
  durationMs: number | null;
  required: number;
}

/**
 * 레벨 변화 추이 표의 지난 레벨 줄. 도달 시각과 다음 레벨 도달 시각을 둘 다 아는 레벨만
 * 걸린 기간을 갖는다. 기록을 시작하기 전 레벨은 도달 시각을 모르니 줄 자체가 없다.
 */
export function levelRows(snapshots: Snapshot[]): LevelRow[] {
  const reaches = levelReaches(snapshots);
  const at = new Map(reaches.map((r) => [r.level, r.at]));
  return reaches.map((r) => {
    const next = at.get(r.level + 1);
    return {
      level: r.level,
      reachedAt: r.at,
      durationMs: next === undefined ? null : next - r.at,
      required: EXP_TABLE[r.level] ?? 0,
    };
  });
}

/* ── 사건 ─────────────────────────────────────────────────────────────── */

/** 큰 변화로 볼 배수. 평소 변화폭(중앙값)의 이 배를 넘으면 표에서 눈에 띄게 한다. */
export const BIG_CHANGE_RATIO = 5;
/** 이만큼은 변화 기록이 있어야 "평소"를 말할 수 있다. */
export const BIG_CHANGE_MIN_SAMPLES = 5;

/**
 * 직전 기록 대비 총 메소 변화가 평소보다 훨씬 큰 기록. 장비 구매·판매 같은 사건이라
 * 메모를 남겨 두면 나중에 그래프를 읽을 수 있다.
 *
 * 평균이 아니라 중앙값을 기준으로 삼는다 — 큰 사건 몇 번이 평균을 끌어올려 자기 자신을
 * 가리게 된다.
 */
export function bigMesoChanges(snapshots: Snapshot[]): Map<string, number> {
  const deltas: { id: string; delta: number }[] = [];
  let prev: number | null = null;
  for (const s of snapshots) {
    const total = totalMeso(s);
    if (total === null) continue;
    if (prev !== null) deltas.push({ id: s.id, delta: total - prev });
    prev = total;
  }
  const out = new Map<string, number>();
  if (deltas.length < BIG_CHANGE_MIN_SAMPLES) return out;
  const sorted = deltas.map((d) => Math.abs(d.delta)).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median === 0) return out;
  for (const d of deltas) if (Math.abs(d.delta) >= BIG_CHANGE_RATIO * median) out.set(d.id, d.delta);
  return out;
}
