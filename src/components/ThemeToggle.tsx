'use client';

import { useSyncExternalStore } from 'react';

/**
 * 테마 고르기. 값은 다른 유틸과 **일부러 공유하는** `ml:theme` 에 둔다 — 같은 사이트인데 앱마다
 * 다크 모드를 따로 기억하면 화면이 튄다.
 *
 * 값 집합은 `'light' | 'dark' | 'system'` 이다 (mapleland-utils/CLAUDE.md §5). 모르는 값을 만나면
 * 시스템으로 보여 주되 **덮어쓰지 않는다** — 사용자가 직접 고를 때만 쓴다. 공유 키를 앱마다 다르게
 * 해석해 남의 선택을 지우던 버그가 실제로 있었다.
 */
const KEY = 'ml:theme';
type Theme = 'light' | 'dark' | 'system';

function read(): Theme {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // 다른 탭(다른 유틸)에서 바꾸면 따라간다.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== KEY) return;
    apply(read());
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const OPTIONS: { key: Theme; label: string }[] = [
  { key: 'system', label: '자동' },
  { key: 'light', label: '라이트' },
  { key: 'dark', label: '다크' },
];

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => 'system' as Theme);
  return (
    <div role="radiogroup" aria-label="테마" className="chips">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={theme === o.key}
          className="chip"
          onClick={() => {
            try {
              window.localStorage.setItem(KEY, o.key);
            } catch {
              /* 저장 못 해도 이번 화면에는 적용한다 */
            }
            apply(o.key);
            for (const l of listeners) l();
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
