'use client';

import { useState, type ReactNode } from 'react';
import { expPercent, totalExp } from '@/lib/cumulative';
import { MAX_LEVEL } from '@/lib/expTable';
import {
  formatDateTime,
  formatKoreanFull,
  formatSigned,
  fromDateTimeLocal,
  toDateTimeLocal,
} from '@/lib/format';
import { MAX_MEMO, MAX_NAME, totalMeso, type Snapshot } from '@/lib/model';
import { parseExpText, parseMeso, resolveExp } from '@/lib/parse';
import { validateDraft, type Issue } from '@/lib/validate';
import { Notice, Panel } from './ui';

export interface EntryValues {
  /** null = 저장하는 순간("지금"). 화면의 now 는 1분 단위라 그대로 쓰면 최대 1분 이르다. */
  at: number | null;
  level: number;
  exp: number;
  expFromPercent: boolean;
  invMeso: number | null;
  storageMeso: number | null;
  memo: string;
  /** 캐릭터가 하나도 없을 때 첫 기록과 함께 만든다. */
  newCharacterName: string | null;
}

/* ── 다른 유틸에서 넘어온 값 ──────────────────────────────────────────────
 *
 * 경험치 측정기 · 사냥 타이머가 `/log/?level=72&exp=1301770&inv=125000000` 로 새 탭을 열면
 * 폼을 채운다. 같은 오리진이어도 남의 저장 키에는 쓰지 않는다는 규칙 때문에 URL 로만 받는다.
 * 채우기만 하고 저장은 사용자가 한다 (메소를 더 적을 수 있게). 읽은 뒤 주소에서 지워
 * 새로고침해도 다시 채워지지 않게 한다.
 */
interface QueryPrefill {
  level?: string;
  exp?: string;
  inv?: string;
  storage?: string;
}

let queryConsumed = false;

function takeQueryPrefill(): QueryPrefill | null {
  if (queryConsumed || typeof window === 'undefined') return null;
  queryConsumed = true;
  const params = new URLSearchParams(window.location.search);
  const out: QueryPrefill = {};
  for (const key of ['level', 'exp', 'inv', 'storage'] as const) {
    const v = params.get(key);
    if (v !== null && /^[\d.%[\]\s,]+$/.test(v)) out[key] = v;
  }
  if (Object.keys(out).length === 0) return null;
  for (const key of ['level', 'exp', 'inv', 'storage', 'from']) params.delete(key);
  const rest = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
  return out;
}

const mesoText = (v: number | null) => (v === null ? '' : formatKoreanFull(v));

export function EntryForm({
  snapshots,
  editing,
  needsCharacter,
  now,
  onSave,
  onCancelEdit,
}: {
  /** 지금 캐릭터의 기록 (시각 순). */
  snapshots: Snapshot[];
  editing: Snapshot | null;
  needsCharacter: boolean;
  now: number;
  onSave: (values: EntryValues) => { ok: true } | { ok: false; message: string };
  onCancelEdit: () => void;
}) {
  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
  // 새 기록은 직전 기록으로 미리 채운다 — 바뀐 칸만 고치면 된다. 메모는 이어받지 않는다.
  const base = editing ?? latest;

  const [initial] = useState(() => {
    const query = editing ? null : takeQueryPrefill();
    return {
      level: query?.level ?? (base ? String(base.level) : ''),
      exp: query?.exp ?? (base ? base.exp.toLocaleString('ko-KR') : ''),
      inv: query?.inv ?? mesoText(base?.invMeso ?? null),
      storage: query?.storage ?? mesoText(base?.storageMeso ?? null),
      fromQuery: query !== null,
    };
  });
  const [name, setName] = useState('');
  const [levelText, setLevelText] = useState(initial.level);
  const [expText, setExpText] = useState(initial.exp);
  const [invText, setInvText] = useState(initial.inv);
  const [storageText, setStorageText] = useState(initial.storage);
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [atMode, setAtMode] = useState<'now' | 'custom'>(editing ? 'custom' : 'now');
  const [atText, setAtText] = useState(() => toDateTimeLocal(editing?.at ?? Date.now()));
  const [confirming, setConfirming] = useState<Issue[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  // 칸을 고치면 확인 단계는 처음부터 다시 — 확인한 내용과 저장할 내용이 달라지면 안 된다.
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setConfirming(null);
      setSubmitError(null);
    };

  /* ── 읽기 ── */
  const levelNum = Number(levelText.trim());
  const level =
    levelText.trim() !== '' && Number.isInteger(levelNum) && levelNum >= 1 && levelNum <= MAX_LEVEL ? levelNum : null;
  const levelError = levelText.trim() !== '' && level === null ? `1~${MAX_LEVEL} 사이 정수` : null;
  const exp = resolveExp(parseExpText(expText), level);
  const inv = parseMeso(invText);
  const storage = parseMeso(storageText);
  const at = atMode === 'now' ? now : fromDateTimeLocal(atText);

  const prev =
    at === null
      ? null
      : ([...snapshots].reverse().find((s) => s.id !== editing?.id && s.at <= at) ?? null);

  const fieldErrors: string[] = [];
  if (needsCharacter && name.trim() === '') fieldErrors.push('캐릭터 이름을 넣어 주세요');
  if (level === null) fieldErrors.push(levelError ? `레벨: ${levelError}` : '레벨을 넣어 주세요');
  if (exp === null) fieldErrors.push('경험치를 넣어 주세요');
  else if (!exp.ok) fieldErrors.push(`경험치: ${exp.message}`);
  if (!inv.ok) fieldErrors.push('인벤 메소를 읽을 수 없습니다');
  if (!storage.ok) fieldErrors.push('창고 메소를 읽을 수 없습니다');
  if (at === null) fieldErrors.push('시각을 넣어 주세요');

  const issues =
    fieldErrors.length === 0 && level !== null && exp?.ok && inv.ok && storage.ok && at !== null
      ? validateDraft({ at, level, exp: exp.exp, invMeso: inv.value, storageMeso: storage.value }, prev, now)
      : [];
  const blocking = issues.filter((i) => i.severity === 'error');
  const needsConfirm = issues.filter((i) => i.severity === 'confirm');

  const save = (confirmed: boolean) => {
    setTried(true);
    if (fieldErrors.length || blocking.length || level === null || !exp?.ok || !inv.ok || !storage.ok) return;
    if (needsConfirm.length && !confirmed) {
      setConfirming(needsConfirm);
      return;
    }
    const result = onSave({
      at: atMode === 'now' ? null : at,
      level,
      exp: exp.exp,
      expFromPercent: exp.fromPercent,
      invMeso: inv.value,
      storageMeso: storage.value,
      memo: memo.trim().slice(0, MAX_MEMO),
      newCharacterName: needsCharacter ? name.trim().slice(0, MAX_NAME) : null,
    });
    if (!result.ok) setSubmitError(result.message);
  };

  /* ── 직전 대비 ── */
  const expReadout = (() => {
    if (!exp?.ok || level === null) return null;
    const pct = `${exp.percent.toFixed(2)}%${exp.fromPercent ? ' (퍼센트로 넣어 값은 추정)' : ''}`;
    if (!prev) return pct;
    const diff = totalExp(level, exp.exp) - totalExp(prev.level, prev.exp);
    if (level === prev.level) {
      const pp = exp.percent - expPercent(prev.level, prev.exp);
      return `${pct} · 직전 ${pp >= 0 ? '+' : ''}${pp.toFixed(2)}%p`;
    }
    return `${pct} · 직전 ${formatSigned(diff)}`;
  })();

  const mesoReadout = (r: ReturnType<typeof parseMeso>, before: number | null) => {
    if (!r.ok) return <span className="text-critical">읽을 수 없음 (예: 1억 2500만, 3천만)</span>;
    if (r.value === null) return '비워 두면 "이번엔 안 적음"';
    const diff = before !== null && r.value !== before ? ` · 직전 ${formatSigned(r.value - before)}` : '';
    return `${formatKoreanFull(r.value)}${diff}`;
  };

  const total = inv.ok && storage.ok ? totalMeso({ invMeso: inv.value, storageMeso: storage.value }) : null;
  const selectAll = (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select();

  return (
    <Panel
      title={editing ? '기록 고치기' : '지금 기록하기'}
      hint={editing ? formatDateTime(editing.at) : undefined}
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
      >
        {initial.fromQuery && (
          <Notice tone="info">다른 유틸에서 넘겨받은 값으로 채웠습니다. 확인하고 기록을 눌러 주세요.</Notice>
        )}

        {needsCharacter && (
          <Field label="캐릭터 이름" hint="게임 닉네임이 아니어도 됩니다 (본캐, 부캐1 …)">
            <input
              className="w-full bg-transparent outline-none"
              value={name}
              maxLength={MAX_NAME}
              placeholder="본캐"
              onChange={(e) => edit(setName)(e.target.value)}
            />
          </Field>
        )}

        <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3">
          <Field label="레벨" error={levelError}>
            <input
              className="w-full bg-transparent text-right outline-none"
              inputMode="numeric"
              value={levelText}
              onFocus={selectAll}
              onChange={(e) => {
                const v = e.target.value;
                // 레벨이 바뀌면 직전 레벨의 경험치가 남아 틀린 기록이 되기 쉽다. 비운다.
                if (v.trim() !== levelText.trim()) edit(setExpText)('');
                edit(setLevelText)(v);
              }}
              aria-label="레벨"
            />
          </Field>
          <Field
            label="경험치"
            error={exp && !exp.ok && level !== null ? exp.message : null}
            hint={expReadout ?? '값 또는 퍼센트(89.15%)'}
          >
            <input
              className="w-full bg-transparent text-right outline-none"
              value={expText}
              onFocus={selectAll}
              placeholder="예) 1301770001 또는 89.15%"
              onChange={(e) => edit(setExpText)(e.target.value)}
              aria-label="경험치"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="인벤 메소" hint={mesoReadout(inv, prev?.invMeso ?? null)}>
            <input
              className="w-full bg-transparent text-right outline-none"
              value={invText}
              onFocus={selectAll}
              placeholder="예) 1억 2500만"
              onChange={(e) => edit(setInvText)(e.target.value)}
              aria-label="인벤 메소"
            />
          </Field>
          <Field label="창고 메소" hint={mesoReadout(storage, prev?.storageMeso ?? null)}>
            <input
              className="w-full bg-transparent text-right outline-none"
              value={storageText}
              onFocus={selectAll}
              placeholder="예) 3억"
              onChange={(e) => edit(setStorageText)(e.target.value)}
              aria-label="창고 메소"
            />
          </Field>
        </div>
        {total !== null && (
          <div className="-mt-1 text-right text-[13px] text-ink-3">
            합계 <span className="tabular font-semibold text-ink-1">{formatKoreanFull(total)}</span>
          </div>
        )}

        <Field label="메모" hint="경쿠 사용, 사냥터 이동, 장비 구매처럼 나중에 그래프를 읽을 단서">
          <input
            className="w-full bg-transparent outline-none"
            value={memo}
            maxLength={MAX_MEMO}
            onChange={(e) => edit(setMemo)(e.target.value)}
            aria-label="메모"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
          <span className="font-medium text-ink-2">시각</span>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={atMode === 'now'} onChange={() => edit(setAtMode)('now')} />
            지금
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={atMode === 'custom'}
              onChange={() => {
                edit(setAtMode)('custom');
                if (!editing) setAtText(toDateTimeLocal(Date.now()));
              }}
            />
            직접
          </label>
          {atMode === 'custom' && (
            <span className="field px-2.5 py-1">
              <input
                type="datetime-local"
                className="bg-transparent text-[13px] outline-none"
                value={atText}
                onChange={(e) => edit(setAtText)(e.target.value)}
                aria-label="기록 시각"
              />
            </span>
          )}
        </div>

        {tried && fieldErrors.length > 0 && (
          <Notice tone="critical">
            {fieldErrors.map((m) => (
              <div key={m}>{m}</div>
            ))}
          </Notice>
        )}
        {blocking.map((i) => (
          <Notice key={i.message} tone="critical">
            {i.message}
          </Notice>
        ))}
        {confirming && (
          <Notice>
            {confirming.map((i) => (
              <div key={i.message}>{i.message}</div>
            ))}
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn btn-primary" onClick={() => save(true)}>
                그래도 기록
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(null)}>
                고치기
              </button>
            </div>
          </Notice>
        )}
        {submitError && <Notice tone="critical">{submitError}</Notice>}

        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary flex-1 py-2.5 text-[14px]">
            {editing ? '고친 내용 저장' : '기록'} <span className="text-[12px] font-normal opacity-75">Enter</span>
          </button>
          {editing && (
            <button type="button" className="btn" onClick={onCancelEdit}>
              취소
            </button>
          )}
        </div>
      </form>
    </Panel>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <span className="font-medium text-ink-2">{label}</span>
      <span className={`field px-3 py-2 text-[15px] text-ink-1 ${error ? 'field-error' : ''}`}>{children}</span>
      {(error || hint) && (
        <span
          className={`text-[12px] leading-snug ${error ? 'text-critical' : 'text-ink-3'}`}
        >
          {error ?? hint}
        </span>
      )}
    </label>
  );
}
