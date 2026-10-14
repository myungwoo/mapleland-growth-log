import { requiredExp } from './expTable';
import { EOK, MAN } from './format';

/**
 * 사람이 친 메소를 숫자로 바꾼다.
 *
 * 메소는 자릿수가 커서 0 을 하나 더 치거나 덜 치는 실수가 제일 흔하다. 게임 안에서
 * 쓰는 말(억·만·천)로 칠 수 있게 하고, 입력 칸 옆에 다시 읽어 준다.
 *
 * 받는 꼴: `125000000`, `125,000,000`, `1억2500만`, `1억 2,500만`, `1.25억`, `12500만`,
 * `3천만`, `5천`. 마지막 단위 없는 숫자는 일의 자리다(`1억 3000` = 100,003,000).
 * 단위가 큰 것에서 작은 것 순서가 아니면(`3만 2억`) 오타로 보고 거절한다.
 */
export function parseMeso(input: string): { ok: true; value: number | null } | { ok: false } {
  const text = input.replace(/[\s,_]/g, '');
  if (text === '') return { ok: true, value: null };
  if (/^\d+$/.test(text)) return { ok: true, value: Number(text) };

  const group = /(\d+(?:\.\d+)?)(천)?(억|만)?/y;
  let total = 0;
  let lastUnit = Infinity;
  let pos = 0;
  while (pos < text.length) {
    group.lastIndex = pos;
    const m = group.exec(text);
    if (!m || m[0] === '') return { ok: false };
    const unit = (m[2] ? 1000 : 1) * (m[3] === '억' ? EOK : m[3] === '만' ? MAN : 1);
    if (unit >= lastUnit) return { ok: false };
    lastUnit = unit;
    total += Number(m[1]) * unit;
    pos = group.lastIndex;
  }
  // 1.234567억 처럼 일의 자리 밑으로 떨어지는 소수는 반올림한다 (메소에 소수는 없다).
  return Number.isFinite(total) ? { ok: true, value: Math.round(total) } : { ok: false };
}

/** 경험치 칸에서 읽어 낸 것. 값만, 퍼센트만, 둘 다 중 하나다. */
export type RawExp =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'value'; value: number }
  | { kind: 'percent'; percent: number }
  | { kind: 'both'; value: number; percent: number };

/**
 * 경험치 칸의 글자를 읽는다. 레벨은 보지 않는다 — 레벨과 맞춰 보는 건 `resolveExp`.
 *
 * 값(`1301770001`)이나 퍼센트(`89.15%`)를 받는다. 게임 화면처럼 둘을 함께 적은
 * `1301770001[89.15%]` 도 받는데, 화면에서 안내하지는 않는다 — 다른 유틸이 URL 로 경험치를 넘길 때
 * 이 꼴을 쓸 수 있게 둔 것이다. 대괄호 앞 공백, 닫는 괄호 누락도 받는다.
 */
export function parseExpText(input: string): RawExp {
  const text = input.replace(/[\s,_]/g, '');
  if (text === '') return { kind: 'empty' };

  const both = /^(\d+)\[(\d+(?:\.\d+)?)%?\]?$/.exec(text);
  if (both) return { kind: 'both', value: Number(both[1]), percent: Number(both[2]) };

  const percent = /^(\d+(?:\.\d+)?)%$/.exec(text);
  if (percent) return { kind: 'percent', percent: Number(percent[1]) };

  if (/^\d+$/.test(text)) return { kind: 'value', value: Number(text) };
  return { kind: 'invalid' };
}

/**
 * 함께 적힌 값과 퍼센트가 어긋나도 되는 폭(%p).
 *
 * 게임은 퍼센트를 소수 둘째 자리에서 끊어 보여 주므로 0.01%p 안쪽은 늘 어긋난다.
 * 그 이상 어긋나면 레벨을 잘못 넣었거나 값을 잘못 옮긴 것이다.
 */
const PERCENT_TOLERANCE = 0.02;

export type ResolvedExp =
  | { ok: true; exp: number; percent: number; fromPercent: boolean }
  | { ok: false; message: string };

/** 레벨에 맞춰 경험치를 값으로 확정한다. 저장은 늘 값으로 한다. */
export function resolveExp(raw: RawExp, level: number | null): ResolvedExp | null {
  if (raw.kind === 'empty') return null;
  if (raw.kind === 'invalid') {
    return { ok: false, message: '경험치 값이나 퍼센트(89.15%)로 넣어 주세요' };
  }
  const need = level === null ? null : requiredExp(level);
  if (need === null) return { ok: false, message: '레벨을 먼저 넣어 주세요' };

  if (raw.kind === 'percent') {
    if (raw.percent >= 100) return { ok: false, message: '퍼센트는 100 보다 작아야 합니다' };
    return { ok: true, exp: Math.round((raw.percent / 100) * need), percent: raw.percent, fromPercent: true };
  }

  if (raw.value >= need) {
    return { ok: false, message: `${level}레벨의 경험치는 ${need.toLocaleString('ko-KR')} 보다 작아야 합니다` };
  }
  const percent = (raw.value / need) * 100;
  if (raw.kind === 'both' && Math.abs(percent - raw.percent) > PERCENT_TOLERANCE) {
    // 원인을 단정하지 않는다 — 레벨이 틀렸는지 숫자를 잘못 옮겼는지는 여기서 알 수 없다.
    return {
      ok: false,
      message: `${level}레벨 기준으로 ${raw.value.toLocaleString('ko-KR')} 은 ${percent.toFixed(2)}% 인데 ${raw.percent}% 로 적혀 있습니다. 레벨이나 숫자를 확인해 주세요`,
    };
  }
  return { ok: true, exp: raw.value, percent, fromPercent: false };
}
