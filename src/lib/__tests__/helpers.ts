import type { Snapshot } from '../model';

let seq = 0;

/** 로컬 시각(Asia/Seoul — package.json 의 test 스크립트가 TZ 를 고정한다)으로 기록을 만든다. */
export function snap(at: string, level: number, exp: number, extra: Partial<Snapshot> = {}): Snapshot {
  seq++;
  return {
    id: `s${seq}`,
    characterId: 'c1',
    at: new Date(at).getTime(),
    level,
    exp,
    expFromPercent: false,
    invMeso: null,
    storageMeso: null,
    memo: '',
    createdAt: seq,
    ...extra,
  };
}

export const t = (s: string) => new Date(s).getTime();
