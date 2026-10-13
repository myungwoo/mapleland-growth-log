'use client';

import { useMemo, useState } from 'react';
import { expPercent, totalExp } from '@/lib/cumulative';
import { formatDateTime, formatKorean, formatSigned } from '@/lib/format';
import { bigMesoChanges } from '@/lib/history';
import { totalMeso, type Snapshot } from '@/lib/model';
import { Panel } from './ui';

const PAGE = 30;

export function RecordsTable({
  snapshots,
  editingId,
  onEdit,
  onDelete,
}: {
  /** 이 캐릭터의 기록 (시각 순). 표는 최신이 위다. */
  snapshots: Snapshot[];
  editingId: string | null;
  onEdit: (s: Snapshot) => void;
  onDelete: (s: Snapshot) => void;
}) {
  const [limit, setLimit] = useState(PAGE);
  const big = useMemo(() => bigMesoChanges(snapshots), [snapshots]);

  const rows = useMemo(() => {
    const out = [];
    // 메소 증감은 메소를 적은 직전 기록과 비교한다 — 바로 앞 기록이 메소를 안 적었을 수 있다.
    let prevMeso: number | null = null;
    for (let i = 0; i < snapshots.length; i++) {
      const s = snapshots[i];
      const prev = i > 0 ? snapshots[i - 1] : null;
      const total = totalMeso(s);
      out.push({
        s,
        expDelta: prev ? totalExp(s.level, s.exp) - totalExp(prev.level, prev.exp) : null,
        total,
        mesoDelta: total !== null && prevMeso !== null ? total - prevMeso : null,
      });
      if (total !== null) prevMeso = total;
    }
    return out.reverse();
  }, [snapshots]);

  return (
    <Panel title="기록" hint={`${snapshots.length}건 · 최신순`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-3">
              <th className="py-1 pr-3 font-medium">시각</th>
              <th className="py-1 pr-3 font-medium">레벨</th>
              <th className="py-1 pr-3 text-right font-medium">경험치 (직전 대비)</th>
              <th className="py-1 pr-3 text-right font-medium">인벤</th>
              <th className="py-1 pr-3 text-right font-medium">창고</th>
              <th className="py-1 pr-3 text-right font-medium">합계 (직전 대비)</th>
              <th className="py-1 pr-3 font-medium">메모</th>
              <th className="py-1 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map(({ s, expDelta, total, mesoDelta }) => {
              const isBig = big.has(s.id);
              return (
                <tr
                  key={s.id}
                  className={`border-t border-line align-top ${s.id === editingId ? 'bg-accent-soft' : ''}`}
                >
                  <td className="num py-1.5 pr-3 whitespace-nowrap text-ink-2">{formatDateTime(s.at)}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    Lv.{s.level}{' '}
                    <span className="text-ink-3">
                      {s.expFromPercent ? '≈' : ''}
                      {expPercent(s.level, s.exp).toFixed(2)}%
                    </span>
                  </td>
                  <td className="num py-1.5 pr-3 text-right whitespace-nowrap">
                    {expDelta === null ? (
                      <span className="text-ink-3">첫 기록</span>
                    ) : (
                      <span className={expDelta < 0 ? 'text-critical' : 'text-ink-1'}>
                        {formatSigned(expDelta)}
                      </span>
                    )}
                  </td>
                  <td className="num py-1.5 pr-3 text-right text-ink-2">
                    {s.invMeso === null ? '—' : formatKorean(s.invMeso)}
                  </td>
                  <td className="num py-1.5 pr-3 text-right text-ink-2">
                    {s.storageMeso === null ? '—' : formatKorean(s.storageMeso)}
                  </td>
                  <td className="num py-1.5 pr-3 text-right whitespace-nowrap">
                    {total === null ? <span className="text-ink-3">—</span> : formatKorean(total)}
                    {mesoDelta !== null && mesoDelta !== 0 && (
                      <div
                        className={`text-[12px] ${isBig ? 'text-warn' : 'text-ink-3'}`}
                        title={isBig ? '평소 변화폭보다 훨씬 큰 변화' : undefined}
                      >
                        {isBig && '⚡ '}
                        {formatSigned(mesoDelta)}
                      </div>
                    )}
                  </td>
                  <td className="max-w-[220px] py-1.5 pr-3 break-words text-ink-2">
                    {s.memo ||
                      (isBig ? (
                        <button type="button" className="text-[12px] text-accent underline" onClick={() => onEdit(s)}>
                          무슨 일이었는지 메모 남기기
                        </button>
                      ) : null)}
                  </td>
                  <td className="py-1.5 whitespace-nowrap">
                    <button type="button" className="btn btn-sm mr-1" onClick={() => onEdit(s)}>
                      고치기
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => onDelete(s)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" className="btn mt-2" onClick={() => setLimit((l) => l + PAGE)}>
          {Math.min(PAGE, rows.length - limit)}건 더 보기
        </button>
      )}
    </Panel>
  );
}
