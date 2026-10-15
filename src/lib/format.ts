export const MAN = 10_000;
export const EOK = 100_000_000;
export const DAY_MS = 86_400_000;

/** 1억 2,500만 3,000 — 입력 칸 옆에서 "내가 0 을 몇 개 쳤는지" 확인하는 용도라 줄이지 않는다. */
export function formatKoreanFull(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  let v = Math.round(Math.abs(value));
  if (v === 0) return '0';
  const parts: string[] = [];
  const eok = Math.floor(v / EOK);
  v -= eok * EOK;
  const man = Math.floor(v / MAN);
  const rest = v - man * MAN;
  if (eok) parts.push(`${eok.toLocaleString('ko-KR')}억`);
  if (man) parts.push(`${man.toLocaleString('ko-KR')}만`);
  if (rest) parts.push(rest.toLocaleString('ko-KR'));
  return sign + parts.join(' ');
}

/** 1.25억, 3,200만 — 표·축·카드처럼 자리가 좁은 곳에서 쓴다. */
export function formatKorean(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(value);
  if (v >= EOK) return `${sign}${trimZeros((v / EOK).toFixed(v >= 100 * EOK ? 0 : v >= 10 * EOK ? 1 : 2))}억`;
  if (v >= MAN) return `${sign}${Math.round(v / MAN).toLocaleString('ko-KR')}만`;
  return `${sign}${Math.round(v).toLocaleString('ko-KR')}`;
}

/** 증감용: 양수에 + 를 붙인다. */
export function formatSigned(value: number, format: (v: number) => string = formatKorean): string {
  if (value > 0) return `+${format(value)}`;
  if (value < 0) return `-${format(-value)}`;
  return format(0);
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

export function formatLevel(fractional: number): string {
  return fractional.toFixed(2);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 2026. 10. 13. 21:05 처럼 쓰지 않고 26.10.13 21:05 — 표에서 폭을 아낀다. */
export function formatDateTime(at: number): string {
  const d = new Date(at);
  return `${String(d.getFullYear()).slice(2)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(at: number, withYear = false): string {
  const d = new Date(at);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return withYear ? `${d.getFullYear()}.${md.replace('/', '.')}` : md;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 10/13(월) */
export function formatDay(at: number): string {
  return `${formatDate(at)}(${WEEKDAYS[new Date(at).getDay()]})`;
}

/** 3일 4시간, 5시간 20분 — 기간 표시는 큰 단위 두 개면 충분하다. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const minutes = Math.round(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours ? `${days}일 ${hours}시간` : `${days}일`;
  if (hours > 0) return mins ? `${hours}시간 ${mins}분` : `${hours}시간`;
  return `${mins}분`;
}

/** 오늘·내일·N일 뒤 + 날짜. 예측 결과에 쓴다. */
export function formatEta(at: number, now: number): string {
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS);
  const when = days === 0 ? '오늘' : days === 1 ? '내일' : `${days}일 뒤`;
  const yearDiffers = new Date(at).getFullYear() !== new Date(now).getFullYear();
  return `${formatDate(at, yearDiffers)} (${when})`;
}

/** 로컬 자정 — 달력의 날짜. 그래프 눈금 · "내일" 같은 표시에 쓴다. 날짜별 집계는 `dayStart`. */
export function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 다음 날 자정. 서머타임이 있는 시간대에서도 맞도록 24시간을 더하지 않고 날짜를 넘긴다. */
export function nextDay(dayStart: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 날짜별 집계에서 하루가 시작하는 로컬 시각. 새벽까지 이어진 사냥을 전날로 묶으려고 오전 7시로
 * 고정한다 (설정으로 바꾸지 않는다).
 */
export const DAY_START_HOUR = 7;

/** `at` 이 속한 하루의 시작. 10/14 03:00 → 10/13 07:00. */
export function dayStart(at: number): number {
  const d = new Date(at);
  if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  return d.getTime();
}

/** 다음 하루의 시작. `nextDay` 와 같은 이유로 날짜를 넘긴다. */
export function nextDayStart(day: number): number {
  const d = new Date(day);
  d.setDate(d.getDate() + 1);
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  return d.getTime();
}

/** <input type="datetime-local"> 의 값. */
export function toDateTimeLocal(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocal(value: string): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}
