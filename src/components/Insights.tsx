'use client';

import { useMemo, useState } from 'react';
import { expPercent, fractionalLevelOfTotal, fromTotal, levelBase } from '@/lib/cumulative';
import { EXP_TABLE, MAX_LEVEL } from '@/lib/expTable';
import { eta, FORECAST_WINDOWS, MIN_SPAN_MS, trend, type Eta, type Trend } from '@/lib/forecast';
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatEta,
  formatKorean,
  formatKoreanFull,
  formatLevel,
  formatSigned,
  DAY_MS,
} from '@/lib/format';
import { levelRows } from '@/lib/history';
import { totalMeso, type Character, type Snapshot } from '@/lib/model';
import {
  dailyChanges,
  expPoints,
  gaps,
  mesoPoints,
  movingAverage,
  periodChange,
  rangeStart,
  RANGES,
  type RangeKey,
} from '@/lib/series';
import { DayBars, niceTicks, TimeChart, type Tick } from './charts';
import { Panel, Segmented, Stat } from './ui';

/** 성장 곡선의 세로 눈금: 레벨 경계에 긋는다. 레벨 간격이 위로 갈수록 넓어지는 게 그대로 보인다. */
function levelTicks(lo: number, hi: number): Tick[] {
  const first = fromTotal(Math.max(0, lo)).level + 1;
  const last = fromTotal(hi).level;
  const levels: number[] = [];
  for (let l = first; l <= Math.min(last, MAX_LEVEL); l++) levels.push(l);
  if (levels.length >= 2) {
    const every = Math.ceil(levels.length / 6);
    return levels.filter((l) => l % every === 0).map((l) => ({ value: levelBase(l), label: `Lv.${l}` }));
  }
  // 한두 레벨 안에서만 움직였으면 경계가 없거나 하나뿐이다 — 소수 레벨로 눈금을 낸다.
  return niceTicks(lo, hi, (v) => formatLevel(fractionalLevelOfTotal(v)));
}

function SnapshotTooltip({ s }: { s: Snapshot }) {
  const total = totalMeso(s);
  return (
    <>
      <div className="text-ink-3">{formatDateTime(s.at)}</div>
      <div className="tabular text-ink-1">
        Lv.{s.level} · {expPercent(s.level, s.exp).toFixed(2)}%
      </div>
      {(s.invMeso !== null || s.storageMeso !== null) && (
        <div className="tabular text-ink-2">
          {total !== null && <div>합계 {formatKorean(total)}</div>}
          <div>
            인벤 {s.invMeso === null ? '—' : formatKorean(s.invMeso)} · 창고{' '}
            {s.storageMeso === null ? '—' : formatKorean(s.storageMeso)}
          </div>
        </div>
      )}
      {s.memo && <div className="mt-0.5 text-ink-2">“{s.memo}”</div>}
    </>
  );
}

const renderTooltip = (s: Snapshot) => <SnapshotTooltip s={s} />;

export function Insights({
  character,
  snapshots,
  now,
}: {
  character: Character;
  /** 이 캐릭터의 기록 (시각 순). */
  snapshots: Snapshot[];
  now: number;
}) {
  const [range, setRange] = useState<RangeKey>('30d');

  const exp = useMemo(() => expPoints(snapshots), [snapshots]);
  const meso = useMemo(() => mesoPoints(snapshots), [snapshots]);
  const inv = useMemo(() => mesoPoints(snapshots, (s) => s.invMeso), [snapshots]);
  const storage = useMemo(() => mesoPoints(snapshots, (s) => s.storageMeso), [snapshots]);

  const from = rangeStart(range, now);
  const last = snapshots[snapshots.length - 1];

  const expChange = periodChange(exp, from);
  const mesoChange = periodChange(meso, from);

  const expDays = dailyChanges(exp, from, last.at);
  const mesoDays = dailyChanges(meso, from, last.at);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Forecast character={character} snapshots={snapshots} exp={exp} meso={meso} now={now} />

      <Panel
        title="기간 요약"
        hint={from === null ? '첫 기록부터 마지막 기록까지' : `${formatDate(from)}부터 마지막 기록까지`}
        right={<Segmented label="기간" value={range} options={RANGES} onChange={setRange} />}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Stat
            label="현재 레벨"
            value={
              <>
                Lv.{last.level} <span className="text-[13px] text-ink-2">{expPercent(last.level, last.exp).toFixed(2)}%</span>
              </>
            }
            sub={
              expChange
                ? `기간 ${formatSigned(
                    fractionalLevelOfTotal(expChange.endValue) - fractionalLevelOfTotal(expChange.startValue),
                    (v) => v.toFixed(2),
                  )} 레벨`
                : '이 기간에 기록 없음'
            }
          />
          <Stat
            label="얻은 경험치"
            value={expChange ? formatSigned(expChange.change) : '—'}
            sub={
              expChange?.perDay != null
                ? `하루 평균 ${formatSigned(expChange.perDay)}`
                : expChange
                  ? '하루가 안 돼 평균을 내지 않음'
                  : undefined
            }
          />
          <Stat
            label="메소 합계 (인벤 + 창고)"
            value={meso.length ? formatKorean(meso[meso.length - 1].value) : '—'}
            sub={
              !meso.length
                ? '인벤 · 창고를 둘 다 적은 기록이 없음'
                : mesoChange
                  ? `기간 ${formatSigned(mesoChange.change)}${
                      mesoChange.perDay != null ? ` · 하루 ${formatSigned(mesoChange.perDay)}` : ''
                    }`
                  : '이 기간에 기록 없음'
            }
          />
        </div>
      </Panel>

      <Panel title="성장 곡선" hint="누적 경험치 · 가로줄은 레벨 경계">
        <TimeChart
          ariaLabel="누적 경험치 성장 곡선"
          series={[{ key: 'exp', label: '누적 경험치', color: 'var(--series-1)', points: exp, primary: true }]}
          from={from}
          yTicks={levelTicks}
          gaps={gaps(exp)}
          renderTooltip={renderTooltip}
        />
      </Panel>

      <Panel title="날짜별 경험치" hint="기록 사이에 오른 양을 날짜별로 나눈 값">
        <DayBars
          ariaLabel="날짜별 얻은 경험치"
          buckets={expDays}
          average={movingAverage(expDays)}
          format={formatKorean}
          unit="경험치"
        />
      </Panel>

      <Panel title="메소" hint="인벤 · 창고 · 합계">
        <TimeChart
          ariaLabel="메소 추이"
          series={[
            { key: 'total', label: '합계', color: 'var(--series-1)', points: meso, primary: true },
            { key: 'inv', label: '인벤', color: 'var(--series-2)', points: inv },
            { key: 'storage', label: '창고', color: 'var(--series-3)', points: storage },
          ]}
          from={from}
          yTicks={(lo, hi) => niceTicks(lo, hi, formatKorean)}
          gaps={gaps(meso.length ? meso : inv)}
          renderTooltip={renderTooltip}
        />
      </Panel>

      <Panel title="날짜별 메소 증감" hint="합계 기준 · 지출한 날은 아래로">
        <DayBars
          ariaLabel="날짜별 메소 증감"
          buckets={mesoDays}
          average={movingAverage(mesoDays)}
          format={formatKorean}
          unit="메소"
        />
      </Panel>

      <LevelTable character={character} snapshots={snapshots} exp={exp} now={now} />
    </div>
  );
}

/* ── 예측 ─────────────────────────────────────────────────────────────── */

type Points = ReturnType<typeof expPoints>;

function EtaText({ result, trend: t, now }: { result: Eta | null; trend: Trend | null; now: number }) {
  if (!t || !result) {
    return (
      <span className="text-ink-3" title={`그 기간 안에 기록 2개 이상, ${MIN_SPAN_MS / DAY_MS}일 이상이 필요합니다`}>
        기록 부족
      </span>
    );
  }
  if (result.kind === 'reached') return <span className="text-good">달성 ✓</span>;
  if (result.kind === 'never') return <span className="text-ink-3">이 추세로는 닿지 않음</span>;
  return <span className="tabular text-ink-1">{formatEta(result.at, now)}</span>;
}

function Forecast({
  character,
  snapshots,
  exp,
  meso,
  now,
}: {
  character: Character;
  snapshots: Snapshot[];
  exp: Points;
  meso: Points;
  now: number;
}) {
  const last = snapshots[snapshots.length - 1];
  const expTrends = FORECAST_WINDOWS.map((w) => trend(exp, w));
  const mesoTrends = FORECAST_WINDOWS.map((w) => trend(meso, w));

  const rows: { label: string; target: number; trends: (Trend | null)[] }[] = [];
  if (last.level < MAX_LEVEL) {
    rows.push({ label: `다음 레벨 (Lv.${last.level + 1})`, target: levelBase(last.level + 1), trends: expTrends });
  }
  const goal = character.goals.level;
  if (goal !== null && goal > last.level + 1) {
    rows.push({ label: `목표 레벨 (Lv.${goal})`, target: levelBase(goal), trends: expTrends });
  }
  if (character.goals.meso !== null) {
    rows.push({ label: `목표 메소 (${formatKorean(character.goals.meso)})`, target: character.goals.meso, trends: mesoTrends });
  }

  const speed = (t: Trend | null, unit: string) =>
    t ? `${formatSigned(t.perDay)} ${unit}/일` : '—';

  return (
    <Panel title="목표 도달 예상" hint="마지막 기록 기준">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-3">
              <th className="py-1 pr-2 font-medium" />
              {FORECAST_WINDOWS.map((w) => (
                <th key={w} className="py-1 pr-2 font-medium">
                  최근 {w}일 페이스면
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <td className="py-1.5 pr-2 text-ink-2">{row.label}</td>
                {row.trends.map((t, i) => (
                  <td key={FORECAST_WINDOWS[i]} className="py-1.5 pr-2">
                    <EtaText result={t ? eta(t, row.target) : null} trend={t} now={now} />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-line text-[12px] text-ink-3">
              <td className="py-1.5 pr-2">페이스</td>
              {FORECAST_WINDOWS.map((w, i) => (
                <td key={w} className="tabular py-1.5 pr-2">
                  <div>{speed(expTrends[i], '경험치')}</div>
                  {meso.length > 0 && <div>{speed(mesoTrends[i], '메소')}</div>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {character.goals.level === null && character.goals.meso === null && (
        <p className="mt-2 text-[12px] text-ink-3">
          위의 「{character.name} 설정 · 목표」에서 목표 레벨 · 목표 메소를 정하면 여기에 함께 나옵니다.
        </p>
      )}
    </Panel>
  );
}

/* ── 레벨 변화 추이 표 ─────────────────────────────────────────────────────── */

const PAST_ROWS = 10;
const FUTURE_LEVELS = 5;

function LevelTable({
  character,
  snapshots,
  exp,
  now,
}: {
  character: Character;
  snapshots: Snapshot[];
  exp: Points;
  now: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const past = useMemo(() => levelRows(snapshots).reverse(), [snapshots]);
  const last = snapshots[snapshots.length - 1];
  const trends = FORECAST_WINDOWS.map((w) => trend(exp, w));

  const future: number[] = [];
  for (let l = last.level + 1; l <= Math.min(MAX_LEVEL, last.level + FUTURE_LEVELS); l++) future.push(l);
  const goal = character.goals.level;
  if (goal !== null && goal > last.level + FUTURE_LEVELS) future.push(goal);

  const shown = showAll ? past : past.slice(0, PAST_ROWS);

  return (
    <Panel title="레벨 변화 추이" hint="도달 시각은 기록 사이를 누적 경험치로 나눈 추정">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="min-w-0 overflow-x-auto">
          <h3 className="mb-1 text-[12px] text-ink-3">앞으로</h3>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-3">
                <th className="py-1 pr-2 font-medium">레벨</th>
                <th className="py-1 pr-2 font-medium">남은 경험치</th>
                {FORECAST_WINDOWS.map((w) => (
                  <th key={w} className="py-1 pr-2 font-medium">
                    최근 {w}일 페이스면
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {future.map((l) => {
                const target = levelBase(l);
                return (
                  <tr key={l} className="border-t border-line">
                    <td className="py-1 pr-2">
                      Lv.{l}
                      {l === goal && <span className="ml-1 text-[12px] text-accent">목표</span>}
                    </td>
                    <td className="num py-1 pr-2 text-ink-2">
                      {formatKorean(target - exp[exp.length - 1].value)}
                    </td>
                    {trends.map((t, i) => (
                      <td key={FORECAST_WINDOWS[i]} className="py-1 pr-2">
                        <EtaText result={t ? eta(t, target) : null} trend={t} now={now} />
                      </td>
                    ))}
                  </tr>
                );
              })}
              {future.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-2 text-ink-3">
                    만렙입니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="min-w-0 overflow-x-auto">
          <h3 className="mb-1 text-[12px] text-ink-3">지나온 레벨</h3>
          {past.length === 0 ? (
            <p className="py-2 text-[12px] text-ink-3">기록을 시작한 뒤로 아직 레벨업이 없습니다.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-3">
                  <th className="py-1 pr-2 font-medium">레벨</th>
                  <th className="py-1 pr-2 font-medium">도달 (약)</th>
                  <th className="py-1 pr-2 font-medium">머문 기간</th>
                  <th className="py-1 pr-2 font-medium">필요 경험치</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.level} className="border-t border-line">
                    <td className="py-1 pr-2">Lv.{r.level}</td>
                    <td className="num py-1 pr-2 text-ink-2">{formatDateTime(r.reachedAt)}</td>
                    <td className="py-1 pr-2 text-ink-2">
                      {r.durationMs === null ? (
                        <span className="text-accent">진행 중</span>
                      ) : (
                        formatDuration(r.durationMs)
                      )}
                    </td>
                    <td className="num py-1 pr-2 text-ink-3" title={formatKoreanFull(EXP_TABLE[r.level])}>
                      {formatKorean(r.required)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {past.length > PAST_ROWS && (
            <button type="button" className="btn mt-2" onClick={() => setShowAll((v) => !v)}>
              {showAll ? '접기' : `전체 ${past.length}개 보기`}
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}
