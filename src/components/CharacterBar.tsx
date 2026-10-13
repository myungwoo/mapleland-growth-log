'use client';

import { useState } from 'react';
import { MAX_LEVEL } from '@/lib/expTable';
import { formatKoreanFull } from '@/lib/format';
import { MAX_NAME, type Character, type Goals } from '@/lib/model';
import { parseMeso } from '@/lib/parse';

export function CharacterBar({
  characters,
  selectedId,
  counts,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
}: {
  characters: Character[];
  selectedId: string | null;
  /** 캐릭터별 기록 수. 삭제 확인에 쓴다. */
  counts: Map<string, number>;
  onSelect: (id: string) => void;
  onAdd: (name: string) => void;
  onUpdate: (id: string, change: { name: string; goals: Goals }) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selected = characters.find((c) => c.id === selectedId) ?? null;

  if (characters.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="chips" role="group" aria-label="캐릭터">
        {characters.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              onSelect(c.id);
              setSettingsOpen(false);
            }}
            aria-pressed={c.id === selectedId}
            className="chip"
          >
            {c.name}
          </button>
        ))}
        </div>

        {adding ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              onAdd(newName.trim().slice(0, MAX_NAME));
              setNewName('');
              setAdding(false);
            }}
          >
            <span className="field px-2.5 py-1">
              <input
                autoFocus
                className="w-32 bg-transparent text-[13px] outline-none"
                value={newName}
                maxLength={MAX_NAME}
                placeholder="캐릭터 이름"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
                aria-label="새 캐릭터 이름"
              />
            </span>
            <button type="submit" className="btn btn-primary">
              추가
            </button>
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              취소
            </button>
          </form>
        ) : (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + 캐릭터
          </button>
        )}

        {selected && (
          <button
            type="button"
            className="btn ml-auto"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            {settingsOpen ? '설정 닫기' : '캐릭터 설정 · 목표'}
          </button>
        )}
      </div>

      {selected && settingsOpen && (
        <CharacterSettings
          key={selected.id}
          character={selected}
          count={counts.get(selected.id) ?? 0}
          onSave={(change) => {
            onUpdate(selected.id, change);
            setSettingsOpen(false);
          }}
          onDelete={() => {
            onDelete(selected.id);
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

function CharacterSettings({
  character,
  count,
  onSave,
  onDelete,
}: {
  character: Character;
  count: number;
  onSave: (change: { name: string; goals: Goals }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(character.name);
  const [goalLevel, setGoalLevel] = useState(character.goals.level?.toString() ?? '');
  const [goalMeso, setGoalMeso] = useState(
    character.goals.meso === null ? '' : formatKoreanFull(character.goals.meso),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const levelNum = Number(goalLevel.trim());
  const levelOk = goalLevel.trim() === '' || (Number.isInteger(levelNum) && levelNum >= 2 && levelNum <= MAX_LEVEL);
  const meso = parseMeso(goalMeso);
  const canSave = name.trim() !== '' && levelOk && meso.ok;

  return (
    <form
      className="card flex flex-wrap items-end gap-4 p-4 text-[13px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave || !meso.ok) return;
        onSave({
          name: name.trim().slice(0, MAX_NAME),
          goals: { level: goalLevel.trim() === '' ? null : levelNum, meso: meso.value },
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-medium text-ink-2">이름</span>
        <span className="field px-2.5 py-1.5">
          <input
            className="w-32 bg-transparent outline-none"
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => setName(e.target.value)}
          />
        </span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium text-ink-2">목표 레벨</span>
        <span className="field px-2.5 py-1.5">
          <input
            className="w-16 bg-transparent text-right outline-none"
            inputMode="numeric"
            value={goalLevel}
            placeholder="120"
            onChange={(e) => setGoalLevel(e.target.value)}
          />
        </span>
        {!levelOk && <span className="text-[12px] text-critical">2~{MAX_LEVEL}</span>}
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium text-ink-2">목표 메소 (인벤 + 창고)</span>
        <span className="field px-2.5 py-1.5">
          <input
            className="w-32 bg-transparent text-right outline-none"
            value={goalMeso}
            placeholder="10억"
            onChange={(e) => setGoalMeso(e.target.value)}
          />
        </span>
        {!meso.ok && <span className="text-[12px] text-critical">읽을 수 없음</span>}
      </label>
      <button type="submit" className="btn btn-primary" disabled={!canSave}>
        저장
      </button>

      <div className="ml-auto flex items-center gap-2">
        {confirmDelete ? (
          <>
            <span className="text-[13px] text-ink-2">기록 {count}건도 함께 지워지고 되돌릴 수 없습니다.</span>
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              정말 삭제
            </button>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
              취소
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            캐릭터 삭제
          </button>
        )}
      </div>
    </form>
  );
}
