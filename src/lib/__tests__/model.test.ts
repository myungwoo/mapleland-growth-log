import { describe, expect, it } from 'vitest';
import { EMPTY_DATA, parseData, planMerge, readBackup, serializeData, toBackup, toCsv, type Data } from '../model';
import { snap } from './helpers';

const data = (): Data => ({
  characters: [{ id: 'c1', name: '본캐', goals: { level: 120, meso: null }, createdAt: 0 }],
  snapshots: [snap('2026-10-01T00:00', 10, 5, { invMeso: 100, storageMeso: 50, memo: '첫, "기록"' })],
  settings: { selectedCharacterId: 'c1', lastBackupAt: null },
});

describe('parseData', () => {
  it('저장 → 읽기가 같다', () => {
    const d = data();
    expect(parseData(JSON.parse(serializeData(d)))).toEqual({ data: d, dropped: 0 });
  });

  it('모르는 판은 읽지 않는다', () => {
    expect(parseData({ v: 2, characters: [], snapshots: [] })).toBeNull();
    expect(parseData(null)).toBeNull();
  });

  it('이상한 기록만 빼고 나머지는 살린다', () => {
    const d = data();
    const raw = JSON.parse(serializeData(d));
    raw.snapshots.push({ id: 'bad', characterId: 'c1', at: 1, level: 10, exp: 1e12 });
    raw.snapshots.push('garbage');
    raw.snapshots.push({ ...raw.snapshots[0] }); // 같은 id
    const r = parseData(raw);
    expect(r?.dropped).toBe(3);
    expect(r?.data.snapshots).toHaveLength(1);
  });

  it('캐릭터 없는 기록은 캐릭터를 되살린다', () => {
    const raw = JSON.parse(serializeData({ ...EMPTY_DATA, snapshots: [snap('2026-10-01T00:00', 10, 0, { characterId: 'ghost' })] }));
    const r = parseData(raw);
    expect(r?.data.characters.map((c) => c.id)).toEqual(['ghost']);
    expect(r?.data.settings.selectedCharacterId).toBe('ghost');
  });

  it('메소 null 과 0 을 구분한다', () => {
    const d = data();
    d.snapshots[0] = { ...d.snapshots[0], invMeso: 0, storageMeso: null };
    const r = parseData(JSON.parse(serializeData(d)));
    expect(r?.data.snapshots[0]).toMatchObject({ invMeso: 0, storageMeso: null });
  });
});

describe('JSON 백업 / 불러오기', () => {
  it('백업 → 불러오기', () => {
    const d = data();
    const r = readBackup(toBackup(d, 123));
    expect(r.ok && r.data.snapshots).toEqual(d.snapshots);
  });

  it('다른 JSON 은 거절', () => {
    expect(readBackup('{"v":1}').ok).toBe(false);
    expect(readBackup('nope').ok).toBe(false);
  });

  it('합치기는 멱등이고 이 브라우저 쪽을 남긴다', () => {
    const current = data();
    const incoming = data();
    incoming.snapshots = [
      { ...current.snapshots[0], memo: '다르게 고침' },
      snap('2026-10-02T00:00', 11, 0),
    ];
    incoming.characters.push({ id: 'c2', name: '부캐', goals: { level: null, meso: null }, createdAt: 0 });
    const once = planMerge(current, incoming);
    expect(once).toMatchObject({ newSnapshots: 1, sameSnapshots: 0, conflicts: 1, newCharacters: 1 });
    expect(once.merged.snapshots[0].memo).toBe('첫, "기록"');
    const twice = planMerge(once.merged, incoming);
    expect(twice.merged).toEqual(once.merged);
    expect(twice.newSnapshots).toBe(0);
  });
});

describe('toCsv', () => {
  it('BOM, 따옴표, 합계', () => {
    const csv = toCsv(data(), () => 'T');
    expect(csv.startsWith('﻿캐릭터,')).toBe(true);
    expect(csv).toContain('본캐,T,10,5,');
    expect(csv).toContain(',100,50,150,"첫, ""기록"""');
  });
});
