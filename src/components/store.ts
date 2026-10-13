'use client';

import { useSyncExternalStore } from 'react';
import { EMPTY_DATA, parseData, serializeData, type Data } from '@/lib/model';

/**
 * 기록 저장소 — localStorage 키 하나(`ml:log:data`).
 *
 * ## 키에 접두어가 붙는 이유
 *
 * `mapleland.myungwoo.kr` 에서 이 앱은 다른 유틸들과 **오리진을 공유한다.** localStorage 는
 * 경로로 갈라지지 않아서 접두어 없는 이름은 옆 유틸의 값을 조용히 덮는다. 같은 이유로
 * 저장 공간(약 5MB)도 모든 유틸이 나눠 쓴다.
 *
 * ## 쓸 때마다 디스크에서 다시 읽는다
 *
 * 탭 두 개에서 기록하면, 메모리에 든 낡은 사본으로 덮어쓰는 순간 다른 탭의 기록이 사라진다.
 * 그래서 모든 변경은 "디스크에서 읽기 → 바꾸기 → 쓰기"를 한 번에 하고(`mutate`), 다른 탭이
 * 쓰면 `storage` 이벤트로 다시 읽는다. 변경 함수는 id 기준으로 더하고 빼므로 합쳐진다.
 *
 * ## 못 읽는 값은 덮어쓰지 않는다
 *
 * 깨진 JSON 이거나 모르는 판(더 새로운 배포가 쓴 값)이면 `blocked` 로 열고 쓰기를 막는다.
 * 빈 기록으로 덮으면 배포를 되돌렸을 때 사용자 기록이 통째로 사라진다.
 */
export const STORAGE_KEY = 'ml:log:data';

export type StoreState =
  /** 서버 렌더 · 하이드레이션 전. 정적 HTML 에는 기록이 없다. */
  | { status: 'loading' }
  | { status: 'ok'; data: Data; dropped: number; bytes: number }
  | { status: 'blocked'; reason: string }
  /** localStorage 자체를 못 쓴다 (사파리 비공개 모드, 저장소 차단). 메모리에만 둔다. */
  | { status: 'unavailable'; data: Data; dropped: 0; bytes: 0 };

const LOADING: StoreState = { status: 'loading' };

function readDisk(): StoreState {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { status: 'unavailable', data: memoryOnly ?? EMPTY_DATA, dropped: 0, bytes: 0 };
  }
  if (raw === null) return { status: 'ok', data: EMPTY_DATA, dropped: 0, bytes: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'blocked', reason: '저장된 기록을 읽을 수 없습니다 (JSON 이 깨져 있습니다).' };
  }
  const result = parseData(parsed);
  if (!result) {
    return {
      status: 'blocked',
      reason: '이 브라우저에 더 새로운 판의 기록이 있습니다. 페이지를 새로고침해 최신 판으로 열어 주세요.',
    };
  }
  return { status: 'ok', data: result.data, dropped: result.dropped, bytes: raw.length * 2 };
}

let current: StoreState | null = null;
let memoryOnly: Data | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function onStorage(e: StorageEvent) {
  // key 가 null 이면 다른 탭이 localStorage.clear() 를 했다.
  if (e.key !== null && e.key !== STORAGE_KEY) return;
  current = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): StoreState {
  current ??= readDisk();
  return current;
}

const getServerSnapshot = () => LOADING;

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export type MutateResult = { ok: true } | { ok: false; message: string };

/** 디스크의 최신 값에 변경을 적용해 쓴다. */
export function mutate(change: (data: Data) => Data): MutateResult {
  const fresh = readDisk();
  if (fresh.status === 'blocked') return { ok: false, message: fresh.reason };
  if (fresh.status === 'loading') return { ok: false, message: '아직 기록을 읽는 중입니다' };

  const next = change(fresh.data);
  if (fresh.status === 'unavailable') {
    memoryOnly = next;
    current = { status: 'unavailable', data: next, dropped: 0, bytes: 0 };
    emit();
    return { ok: true };
  }
  const raw = serializeData(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // 용량 초과. 화면 상태도 바꾸지 않아야 "저장된 줄 알았는데 새로고침하니 없다"를 막는다.
    current = fresh;
    emit();
    return {
      ok: false,
      message: '브라우저 저장 공간이 가득 차 기록하지 못했습니다. JSON 백업을 받아 두고 오래된 기록을 정리해 주세요.',
    };
  }
  // 읽을 때 뺀 기록은 이번 쓰기로 영영 사라졌으니 알림도 거둔다.
  current = { status: 'ok', data: next, dropped: 0, bytes: raw.length * 2 };
  emit();
  return { ok: true };
}

/**
 * 브라우저가 저장소를 마음대로 비우지 않게 요청한다. 첫 기록 때 한 번.
 *
 * 공간이 모자랄 때 브라우저는 "최근에 안 쓴 사이트"의 저장소부터 지운다. 몇 주에 한 번
 * 들어오는 사용자의 기록이 딱 그 대상이다. 거절돼도 할 수 있는 건 없으니 결과는 보지 않는다.
 */
export function requestPersistence() {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* 지원하지 않는 브라우저 */
  }
}
