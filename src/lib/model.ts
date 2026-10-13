import { MAX_LEVEL, requiredExp } from './expTable';

export interface Goals {
  level: number | null;
  meso: number | null;
}

export interface Character {
  id: string;
  /** 게임 닉네임일 필요는 없다 ("본캐", "부캐1"). */
  name: string;
  goals: Goals;
  createdAt: number;
}

export interface Snapshot {
  id: string;
  characterId: string;
  /** 기록한 시점(epoch ms). 소급 입력이면 과거 시각이다. */
  at: number;
  level: number;
  /** 레벨 내 경험치 값. 퍼센트는 저장하지 않고 표에서 다시 구한다. */
  exp: number;
  /** 퍼센트로 입력해서 값이 반올림 추정치라는 표시. */
  expFromPercent: boolean;
  /** null = 이번엔 안 적음. 0 메소와 다르다 — 0 으로 두면 자산 그래프가 절벽을 그린다. */
  invMeso: number | null;
  storageMeso: number | null;
  memo: string;
  /** 실제로 입력한 시각. 소급 입력과 구분하려고 둔다. */
  createdAt: number;
}

export interface Settings {
  selectedCharacterId: string | null;
  lastBackupAt: number | null;
}

export interface Data {
  characters: Character[];
  snapshots: Snapshot[];
  settings: Settings;
}

export const EMPTY_DATA: Data = {
  characters: [],
  snapshots: [],
  settings: { selectedCharacterId: null, lastBackupAt: null },
};

/** 저장 포맷 판 번호. 칸을 더하기만 하고 없을 때의 기본값으로 뜻이 통하면 올리지 않는다. */
export const VERSION = 1;

/** JSON 백업 파일에 찍는 표식. 엉뚱한 JSON 을 불러오는 걸 막는다. */
export const BACKUP_APP = 'mapleland-growth-log';

export const MAX_MEMO = 200;
export const MAX_NAME = 20;
/** 메소 칸 상한. 이보다 크면 0 을 잘못 친 것으로 본다. */
export const MAX_MESO = 1e13;

/* ── 읽을 때 믿지 않는다 ────────────────────────────────────────────────────
 *
 * 저장소에 든 것은 예전 판이 쓴 값일 수도, 사용자가 콘솔로 고친 값일 수도, 남이 만든
 * 백업 파일일 수도 있다. 기록 하나가 이상하다고 몇 달 치를 버리지 않도록 **기록 단위로**
 * 검사해서 이상한 것만 뺀다. 몇 개를 뺐는지는 호출한 쪽이 사용자에게 알린다.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function meso(value: unknown): number | null {
  return finite(value) && value >= 0 && value <= MAX_MESO ? Math.round(value) : null;
}

function readGoals(value: unknown): Goals {
  if (!isRecord(value)) return { level: null, meso: null };
  const level = finite(value.level) && value.level >= 2 && value.level <= MAX_LEVEL ? Math.round(value.level) : null;
  return { level, meso: meso(value.meso) };
}

export function sanitizeCharacter(value: unknown): Character | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id === '') return null;
  return {
    id: value.id,
    name: str(value.name, MAX_NAME).trim() || '이름 없음',
    goals: readGoals(value.goals),
    createdAt: finite(value.createdAt) ? value.createdAt : 0,
  };
}

export function sanitizeSnapshot(value: unknown): Snapshot | null {
  if (!isRecord(value)) return null;
  const { id, characterId, at, level, exp } = value;
  if (typeof id !== 'string' || id === '' || typeof characterId !== 'string' || characterId === '') return null;
  if (!finite(at) || !finite(level) || !Number.isInteger(level) || !finite(exp)) return null;
  const need = requiredExp(level);
  // 경험치가 그 레벨의 필요량 이상이면 누적 경험치가 다음 레벨과 겹쳐 그래프가 거꾸로 간다.
  if (need === null || exp < 0 || exp >= need) return null;
  return {
    id,
    characterId,
    at,
    level,
    exp: Math.round(exp),
    expFromPercent: value.expFromPercent === true,
    invMeso: meso(value.invMeso),
    storageMeso: meso(value.storageMeso),
    memo: str(value.memo, MAX_MEMO),
    createdAt: finite(value.createdAt) ? value.createdAt : at,
  };
}

export interface ParseResult {
  data: Data;
  /** 검사에서 빠진 기록 수. */
  dropped: number;
}

/**
 * 저장 형식(`{ v, characters, snapshots, settings }`)을 읽는다.
 *
 * 모르는 판이면 null — 더 새로운 판이 쓴 값일 수 있으니 이해하는 척 덮어쓰면 안 된다.
 */
export function parseData(value: unknown): ParseResult | null {
  if (!isRecord(value) || value.v !== VERSION) return null;
  let dropped = 0;

  const characters: Character[] = [];
  const charIds = new Set<string>();
  for (const raw of Array.isArray(value.characters) ? value.characters : []) {
    const c = sanitizeCharacter(raw);
    if (!c || charIds.has(c.id)) continue;
    charIds.add(c.id);
    characters.push(c);
  }

  const snapshots: Snapshot[] = [];
  const snapIds = new Set<string>();
  for (const raw of Array.isArray(value.snapshots) ? value.snapshots : []) {
    const s = sanitizeSnapshot(raw);
    if (!s || snapIds.has(s.id)) {
      dropped++;
      continue;
    }
    snapIds.add(s.id);
    // 캐릭터 목록에 없는 기록은 버리지 않고 캐릭터를 되살린다. 기록이 캐릭터보다 귀하다.
    if (!charIds.has(s.characterId)) {
      charIds.add(s.characterId);
      characters.push({ id: s.characterId, name: '이름 없음', goals: { level: null, meso: null }, createdAt: s.at });
    }
    snapshots.push(s);
  }

  const settings = isRecord(value.settings) ? value.settings : {};
  const selected = typeof settings.selectedCharacterId === 'string' ? settings.selectedCharacterId : null;
  return {
    data: {
      characters,
      snapshots: sortSnapshots(snapshots),
      settings: {
        selectedCharacterId: selected && charIds.has(selected) ? selected : (characters[0]?.id ?? null),
        lastBackupAt: finite(settings.lastBackupAt) ? settings.lastBackupAt : null,
      },
    },
    dropped,
  };
}

export function serializeData(data: Data): string {
  return JSON.stringify({ v: VERSION, ...data });
}

/** 시각 순. 같은 시각이면 먼저 입력한 것이 앞이다. */
export function sortSnapshots(list: Snapshot[]): Snapshot[] {
  return [...list].sort((a, b) => a.at - b.at || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}

export function snapshotsOf(data: Data, characterId: string | null): Snapshot[] {
  return characterId ? data.snapshots.filter((s) => s.characterId === characterId) : [];
}

/** 인벤 + 창고. 둘 중 하나라도 안 적었으면 계산하지 않는다 — 반쪽 합계는 가짜 하락을 만든다. */
export function totalMeso(s: Pick<Snapshot, 'invMeso' | 'storageMeso'>): number | null {
  return s.invMeso === null || s.storageMeso === null ? null : s.invMeso + s.storageMeso;
}

export function newId(): string {
  // randomUUID 는 보안 컨텍스트(https, localhost)에서만 있다. 같은 망의 다른 기기에서
  // http://192.168.x.x:3000 으로 개발 서버를 열면 없으므로 대체 경로를 둔다.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ── JSON 백업 / 불러오기 ──────────────────────────────────────────────── */

export function toBackup(data: Data, now: number): string {
  return JSON.stringify(
    {
      app: BACKUP_APP,
      v: VERSION,
      exportedAt: now,
      characters: data.characters,
      snapshots: data.snapshots,
    },
    null,
    2,
  );
}

export type BackupRead =
  | { ok: true; data: Data; dropped: number }
  | { ok: false; message: string };

export function readBackup(text: string): BackupRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: 'JSON 파일이 아닙니다' };
  }
  if (!isRecord(parsed) || parsed.app !== BACKUP_APP) {
    return { ok: false, message: '성장 기록의 JSON 백업 파일이 아닙니다' };
  }
  if (parsed.v !== VERSION) {
    return { ok: false, message: '더 새로운 판에서 만든 백업이라 읽을 수 없습니다. 페이지를 새로고침해 보세요' };
  }
  const result = parseData(parsed);
  return result ? { ok: true, data: result.data, dropped: result.dropped } : { ok: false, message: '읽을 수 없는 백업입니다' };
}

export interface MergePlan {
  merged: Data;
  newSnapshots: number;
  sameSnapshots: number;
  /** 같은 id 인데 내용이 다른 기록. 이 브라우저 쪽을 남긴다. */
  conflicts: number;
  newCharacters: number;
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return (
    a.characterId === b.characterId &&
    a.at === b.at &&
    a.level === b.level &&
    a.exp === b.exp &&
    a.invMeso === b.invMeso &&
    a.storageMeso === b.storageMeso &&
    a.memo === b.memo
  );
}

/**
 * 불러온 백업을 지금 기록에 합친다. id 가 같으면 이 브라우저 쪽을 남긴다.
 *
 * 덮어쓰지 않고 합치는 이유: 기기를 옮기는 중에 양쪽에서 기록했을 수 있다. 그리고 같은
 * 파일을 두 번 불러와도 결과가 같아야 한다 (멱등).
 */
export function planMerge(current: Data, incoming: Data): MergePlan {
  const charIds = new Set(current.characters.map((c) => c.id));
  const addedChars = incoming.characters.filter((c) => !charIds.has(c.id));

  const byId = new Map(current.snapshots.map((s) => [s.id, s]));
  let newSnapshots = 0;
  let sameSnapshots = 0;
  let conflicts = 0;
  const added: Snapshot[] = [];
  for (const s of incoming.snapshots) {
    const existing = byId.get(s.id);
    if (!existing) {
      newSnapshots++;
      added.push(s);
    } else if (sameSnapshot(existing, s)) sameSnapshots++;
    else conflicts++;
  }

  const characters = [...current.characters, ...addedChars];
  return {
    merged: {
      characters,
      snapshots: sortSnapshots([...current.snapshots, ...added]),
      settings: {
        ...current.settings,
        selectedCharacterId: current.settings.selectedCharacterId ?? characters[0]?.id ?? null,
      },
    },
    newSnapshots,
    sameSnapshots,
    conflicts,
    newCharacters: addedChars.length,
  };
}

/* ── CSV 내보내기 ─────────────────────────────────────────────────────── */

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(data: Data, formatAt: (at: number) => string): string {
  const names = new Map(data.characters.map((c) => [c.id, c.name]));
  const header = ['캐릭터', '시각', '레벨', '경험치', '경험치(%)', '인벤 메소', '창고 메소', '합계 메소', '메모'];
  const rows = data.snapshots.map((s) => {
    const need = requiredExp(s.level) ?? 1;
    return [
      names.get(s.characterId) ?? '',
      formatAt(s.at),
      s.level,
      s.exp,
      ((s.exp / need) * 100).toFixed(2),
      s.invMeso,
      s.storageMeso,
      totalMeso(s),
      s.memo,
    ]
      .map(csvCell)
      .join(',');
  });
  // BOM 이 없으면 엑셀이 한글을 깨뜨린다.
  return `﻿${[header.join(','), ...rows].join('\r\n')}\r\n`;
}
