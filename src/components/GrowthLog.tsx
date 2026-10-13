'use client';

import { useEffect, useMemo, useState } from 'react';
import { DAY_MS } from '@/lib/format';
import { newId, planMerge, snapshotsOf, sortSnapshots, type Data, type Snapshot } from '@/lib/model';
import { BackupPanel } from './BackupPanel';
import { CharacterBar } from './CharacterBar';
import { EntryForm, type EntryValues } from './EntryForm';
import { Insights } from './Insights';
import { RecordsTable } from './RecordsTable';
import { ThemeToggle } from './ThemeToggle';
import { mutate, requestPersistence, useStore } from './store';
import { Notice, Panel, refreshNow, useNow } from './ui';

/** 백업 권유: 마지막 백업 뒤로 이만큼 지났고 기록이 이만큼 쌓였으면 상단에 띄운다. */
const BACKUP_NUDGE_MS = 30 * DAY_MS;
const BACKUP_NUDGE_RECORDS = 50;
const UNDO_MS = 6000;

export function GrowthLog() {
  const store = useStore();
  const now = useNow();

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-line bg-surface-1/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[17px]"
            >
              📈
            </span>
            <div className="min-w-0">
              <h1 className="text-[16px] leading-tight font-bold tracking-tight">메이플랜드 성장 기록</h1>
              <p className="hidden truncate text-[12px] text-ink-3 sm:block">
                레벨 · 경험치 · 메소를 가끔 적어 두면 며칠, 몇 주 단위의 성장 추세를 보여 줍니다
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex max-w-[1280px] flex-col gap-5 px-4 py-6 sm:px-6">
        {store.status === 'loading' ? (
          <div className="card h-[320px] animate-pulse" aria-busy />
        ) : store.status === 'blocked' ? (
          <Notice tone="critical">
            {store.reason} 기록을 지키려고 이 화면에서는 아무것도 쓰지 않습니다.
          </Notice>
        ) : (
          <Main
            data={store.data}
            dropped={store.dropped}
            bytes={store.bytes}
            persistent={store.status === 'ok'}
            now={now}
          />
        )}

        <footer className="mt-6 border-t border-line pt-4 text-[12px] leading-relaxed text-ink-3">
          기록은 이 브라우저(localStorage)에만 저장되고 어디로도 보내지 않습니다. 기록 사이의 값은 직선으로 이은
          추정이며, 여기서 말하는 페이스는 사냥 효율이 아니라 쉬는 시간까지 포함한 달력 기준 페이스입니다. 사냥
          한 번의 효율은 경험치 측정기에서 재세요. 이 도구는 넥슨과 관계가 없습니다.
        </footer>
      </main>
    </div>
  );
}

function Main({
  data,
  dropped,
  bytes,
  persistent,
  now,
}: {
  data: Data;
  dropped: number;
  bytes: number;
  persistent: boolean;
  now: number;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  /** 기록할 때마다 폼을 새로 띄워 방금 기록으로 다시 채운다. */
  const [formNonce, setFormNonce] = useState(0);
  const [undo, setUndo] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedId = data.settings.selectedCharacterId;
  const character = data.characters.find((c) => c.id === selectedId) ?? null;
  const snapshots = useMemo(() => snapshotsOf(data, selectedId), [data, selectedId]);
  const editing = snapshots.find((s) => s.id === editingId) ?? null;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of data.snapshots) m.set(s.characterId, (m.get(s.characterId) ?? 0) + 1);
    return m;
  }, [data.snapshots]);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const run = (change: (d: Data) => Data) => {
    const result = mutate(change);
    setError(result.ok ? null : result.message);
    return result;
  };

  const select = (id: string) => {
    setEditingId(null);
    run((d) => ({ ...d, settings: { ...d.settings, selectedCharacterId: id } }));
  };

  const save = (v: EntryValues) => {
    const createdAt = Date.now();
    const characterId = v.newCharacterName !== null ? newId() : selectedId;
    if (!characterId) return { ok: false as const, message: '캐릭터를 먼저 골라 주세요' };
    const fields = {
      at: v.at ?? createdAt,
      level: v.level,
      exp: v.exp,
      expFromPercent: v.expFromPercent,
      invMeso: v.invMeso,
      storageMeso: v.storageMeso,
      memo: v.memo,
    };
    const result = run((d) => {
      const characters =
        v.newCharacterName !== null
          ? [...d.characters, { id: characterId, name: v.newCharacterName, goals: { level: null, meso: null }, createdAt }]
          : d.characters;
      const snapshots = editing
        ? d.snapshots.map((s) => (s.id === editing.id ? { ...s, ...fields } : s))
        : [...d.snapshots, { id: newId(), characterId, createdAt, ...fields }];
      return {
        ...d,
        characters,
        snapshots: sortSnapshots(snapshots),
        settings: { ...d.settings, selectedCharacterId: characterId },
      };
    });
    if (result.ok) {
      if (data.snapshots.length === 0) requestPersistence();
      setEditingId(null);
      setFormNonce((n) => n + 1);
      refreshNow();
    }
    return result;
  };

  const remove = (s: Snapshot) => {
    const result = run((d) => ({ ...d, snapshots: d.snapshots.filter((x) => x.id !== s.id) }));
    if (result.ok) {
      setUndo(s);
      if (editingId === s.id) setEditingId(null);
      setFormNonce((n) => n + 1);
    }
  };

  const restore = () => {
    if (!undo) return;
    const s = undo;
    run((d) =>
      d.snapshots.some((x) => x.id === s.id) || !d.characters.some((c) => c.id === s.characterId)
        ? d
        : { ...d, snapshots: sortSnapshots([...d.snapshots, s]) },
    );
    setUndo(null);
    setFormNonce((n) => n + 1);
  };

  const backupDue =
    data.snapshots.length >= BACKUP_NUDGE_RECORDS &&
    (data.settings.lastBackupAt === null || now - data.settings.lastBackupAt > BACKUP_NUDGE_MS);

  const needsCharacter = data.characters.length === 0;

  return (
    <>
      {dropped > 0 && (
        <Notice>
          저장된 기록 중 읽을 수 없는 {dropped}건을 빼고 열었습니다. 다음에 기록하면 그 {dropped}건은 지워집니다.
        </Notice>
      )}
      {backupDue && (
        <Notice tone="info">
          기록이 {data.snapshots.length}건 쌓였는데{' '}
          {data.settings.lastBackupAt === null ? '아직 백업한 적이 없습니다' : '마지막 백업이 30일도 넘었습니다'}.
          브라우저 데이터를 지우면 함께 사라지니 아래 「백업」에서 JSON 백업을 받아 두세요.
        </Notice>
      )}
      {error && <Notice tone="critical">{error}</Notice>}

      <CharacterBar
        characters={data.characters}
        selectedId={selectedId}
        counts={counts}
        onSelect={select}
        onAdd={(name) => {
          const id = newId();
          setEditingId(null);
          run((d) => ({
            ...d,
            characters: [...d.characters, { id, name, goals: { level: null, meso: null }, createdAt: Date.now() }],
            settings: { ...d.settings, selectedCharacterId: id },
          }));
        }}
        onUpdate={(id, change) =>
          run((d) => ({ ...d, characters: d.characters.map((c) => (c.id === id ? { ...c, ...change } : c)) }))
        }
        onDelete={(id) => {
          setEditingId(null);
          run((d) => {
            const characters = d.characters.filter((c) => c.id !== id);
            return {
              ...d,
              characters,
              snapshots: d.snapshots.filter((s) => s.characterId !== id),
              settings: {
                ...d.settings,
                selectedCharacterId:
                  d.settings.selectedCharacterId === id ? (characters[0]?.id ?? null) : d.settings.selectedCharacterId,
              },
            };
          });
        }}
      />

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 lg:sticky lg:top-[84px] lg:self-start">
          <EntryForm
            key={`${selectedId}:${editingId ?? 'new'}:${formNonce}`}
            snapshots={snapshots}
            editing={editing}
            needsCharacter={needsCharacter}
            now={now}
            onSave={save}
            onCancelEdit={() => setEditingId(null)}
          />
          {undo && (
            <Notice tone="info">
              <div className="flex items-center justify-between gap-2">
                <span>기록을 삭제했습니다.</span>
                <button type="button" className="btn" onClick={restore}>
                  되돌리기
                </button>
              </div>
            </Notice>
          )}
          <BackupPanel
            data={data}
            bytes={bytes}
            persistent={persistent}
            onBackedUp={() => run((d) => ({ ...d, settings: { ...d.settings, lastBackupAt: Date.now() } }))}
            onMerge={(incoming) => run((d) => planMerge(d, incoming).merged)}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {character && snapshots.length > 0 ? (
            <>
              <Insights character={character} snapshots={snapshots} now={now} />
              <RecordsTable
                snapshots={snapshots}
                editingId={editingId}
                onEdit={(s) => {
                  setEditingId(s.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onDelete={remove}
              />
            </>
          ) : (
            <Welcome hasCharacter={character !== null} />
          )}
        </div>
      </div>
    </>
  );
}

function Welcome({ hasCharacter }: { hasCharacter: boolean }) {
  return (
    <Panel title={hasCharacter ? '첫 기록을 남겨 보세요' : '시작하기'}>
      <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
        <p>
          접속할 때나 끝낼 때 30초만 들여 레벨 · 경험치 · 메소를 적어 두세요. 기록이 쌓이면 여기에 이런 것들이
          나옵니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>성장 곡선 — 레벨업마다 끊기지 않게 누적 경험치로 그립니다</li>
          <li>날짜별로 얻은 경험치 · 메소 증감과 7일 평균</li>
          <li>다음 레벨 · 목표 레벨 · 목표 메소에 닿는 예상 날짜 (최근 7일 · 30일 페이스)</li>
          <li>레벨마다 걸린 기간, 평소보다 큰 메소 변화</li>
        </ul>
        <p className="text-ink-3">
          경험치 칸에는 게임 화면의 <code className="rounded bg-surface-2 px-1 text-ink-1">1301770001[89.15%]</code> 를 그대로 붙여 넣어도
          되고, 메소는 <code className="rounded bg-surface-2 px-1 text-ink-1">1억 2500만</code> · <code className="rounded bg-surface-2 px-1 text-ink-1">3천만</code>{' '}
          처럼 적어도 됩니다. 지난 기록은 시각을 「직접」으로 바꿔 소급해 넣을 수 있습니다.
        </p>
      </div>
    </Panel>
  );
}
