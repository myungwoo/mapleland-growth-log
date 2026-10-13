'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

export function Panel({
  title,
  hint,
  right,
  children,
  className = '',
}: {
  title: string;
  hint?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card min-w-0 ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink-1">{title}</h2>
          {hint && <p className="mt-0.5 text-[13px] text-ink-3">{hint}</p>}
        </div>
        {right}
      </header>
      <div className="px-5 pt-3 pb-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-4 py-3">
      <div className="text-[13px] text-ink-3">{label}</div>
      <div className="tabular mt-1 truncate text-[22px] font-semibold tracking-tight text-ink-1">{value}</div>
      {sub && <div className="tabular mt-1 text-[12px] leading-snug text-ink-2">{sub}</div>}
    </div>
  );
}

const NOTICE_STYLE = {
  warn: { bg: 'var(--warn-soft)', fg: 'var(--warn)', icon: '!' },
  critical: { bg: 'var(--critical-soft)', fg: 'var(--critical)', icon: '!' },
  info: { bg: 'var(--info-soft)', fg: 'var(--accent-ink)', icon: 'i' },
} as const;

export function Notice({
  tone = 'warn',
  children,
}: {
  tone?: 'warn' | 'critical' | 'info';
  children: ReactNode;
}) {
  const style = NOTICE_STYLE[tone];
  return (
    <div
      role={tone === 'critical' ? 'alert' : 'status'}
      className="flex gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2"
      style={{ background: style.bg }}
    >
      <span
        aria-hidden
        className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
        style={{ background: style.fg }}
      >
        {style.icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** 몇 개 중 하나 고르기 (기간 선택 등). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (key: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="chips">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={o.key === value}
          onClick={() => onChange(o.key)}
          className="chip"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── 지금 시각 ───────────────────────────────────────────────────────────
 *
 * 예측의 "오늘/내일", 백업 권유의 "30일 지남" 정도에만 쓰므로 1분마다 갱신하면 충분하다.
 * 렌더 중에 Date.now() 를 부르면 렌더마다 값이 달라져 React 가 경고한다.
 */
let nowCache = 0;
const nowListeners = new Set<() => void>();
let nowTimer: ReturnType<typeof setInterval> | null = null;

function subscribeNow(listener: () => void) {
  nowListeners.add(listener);
  if (!nowTimer) {
    nowTimer = setInterval(() => {
      nowCache = Date.now();
      for (const l of nowListeners) l();
    }, 60_000);
  }
  return () => {
    nowListeners.delete(listener);
    if (nowListeners.size === 0 && nowTimer) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
  };
}

function getNow() {
  if (nowCache === 0) nowCache = Date.now();
  return nowCache;
}

/** 서버에서는 0 — 시각에 기대는 부분은 기록을 읽은 뒤(클라이언트)에만 그린다. */
export function useNow(): number {
  return useSyncExternalStore(subscribeNow, getNow, () => 0);
}

/** 기록 직후처럼 "지금"이 1분 늦으면 어색한 순간에 부른다. */
export function refreshNow() {
  nowCache = Date.now();
  for (const l of nowListeners) l();
}
