'use client';

import { useRef, useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { planMerge, readBackup, toBackup, toCsv, type Data, type MergePlan } from '@/lib/model';
import { Notice, Panel } from './ui';

/** localStorage 는 오리진당 약 5MB(UTF-16 이라 글자 수로는 그 절반)이고 모든 유틸이 나눠 쓴다. */
const STORAGE_WARN_BYTES = 3 * 1024 * 1024;

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  // 바로 풀면 일부 브라우저(사파리)가 내려받기 전에 URL 을 잃는다.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function stamp(at: number) {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function BackupPanel({
  data,
  bytes,
  persistent,
  onBackedUp,
  onMerge,
}: {
  data: Data;
  bytes: number;
  /** false 면 이 브라우저에 저장할 수 없어 메모리에만 있다. */
  persistent: boolean;
  onBackedUp: () => void;
  /** 불러온 백업. 합치기는 저장 직전의 최신 기록에 대고 다시 한다. */
  onMerge: (incoming: Data) => { ok: true } | { ok: false; message: string };
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<(MergePlan & { incoming: Data; fileName: string; dropped: number }) | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'critical'; text: string } | null>(null);

  const backup = () => {
    const now = Date.now();
    download(`성장기록-${stamp(now)}.json`, toBackup(data, now), 'application/json');
    onBackedUp();
    setMessage({ tone: 'info', text: 'JSON 백업 파일을 내려받았습니다.' });
  };

  const exportCsv = () => {
    download(`성장기록-${stamp(Date.now())}.csv`, toCsv(data, formatDateTime), 'text/csv;charset=utf-8');
  };

  const onFile = async (file: File) => {
    setMessage(null);
    const result = readBackup(await file.text());
    if (!result.ok) {
      setPlan(null);
      setMessage({ tone: 'critical', text: result.message });
      return;
    }
    setPlan({ ...planMerge(data, result.data), incoming: result.data, fileName: file.name, dropped: result.dropped });
  };

  const apply = () => {
    if (!plan) return;
    // 미리보기를 만든 뒤 다른 탭에서 기록했을 수 있으니, 미리보기의 합친 결과를 그대로 쓰지 않는다.
    const result = onMerge(plan.incoming);
    if (!result.ok) {
      setMessage({ tone: 'critical', text: result.message });
      return;
    }
    setMessage({ tone: 'info', text: `기록 ${plan.newSnapshots}건을 합쳤습니다.` });
    setPlan(null);
  };

  return (
    <Panel title="백업" hint="기록은 이 브라우저에만 있습니다">
      <div className="flex flex-col gap-2 text-[13px]">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={backup} disabled={data.snapshots.length === 0}>
            JSON 백업
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            불러오기
          </button>
          <button type="button" className="btn" onClick={exportCsv} disabled={data.snapshots.length === 0}>
            CSV 내보내기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void onFile(file);
            }}
          />
        </div>

        <p className="text-[12px] leading-relaxed text-ink-3">
          브라우저 데이터를 지우면 기록도 사라집니다. 가끔 JSON 백업을 받아 두세요. 다른 기기로 옮길 때도 JSON
          백업 → 불러오기를 씁니다. 불러오기는 지금 기록을 지우지 않고 합칩니다.
          {data.settings.lastBackupAt && <> 마지막 백업: {formatDateTime(data.settings.lastBackupAt)}.</>}
        </p>

        {plan && (
          <Notice tone="info">
            <div className="text-ink-1">{plan.fileName}</div>
            <div>
              새 기록 {plan.newSnapshots}건 · 이미 있는 기록 {plan.sameSnapshots}건
              {plan.newCharacters > 0 && ` · 새 캐릭터 ${plan.newCharacters}명`}
            </div>
            {plan.conflicts > 0 && (
              <div>내용이 다른 같은 기록 {plan.conflicts}건은 이 브라우저 쪽을 남깁니다.</div>
            )}
            {plan.dropped > 0 && <div>파일에서 읽을 수 없는 기록 {plan.dropped}건은 뺍니다.</div>}
            <div className="mt-1.5 flex gap-2">
              <button type="button" className="btn btn-primary" onClick={apply} disabled={plan.newSnapshots + plan.newCharacters === 0}>
                {plan.newSnapshots + plan.newCharacters === 0 ? '합칠 것이 없습니다' : '합치기'}
              </button>
              <button type="button" className="btn" onClick={() => setPlan(null)}>
                취소
              </button>
            </div>
          </Notice>
        )}
        {message && <Notice tone={message.tone}>{message.text}</Notice>}

        {!persistent ? (
          <Notice tone="critical">
            이 브라우저에는 저장할 수 없습니다 (비공개 모드이거나 저장소가 막혀 있습니다). 탭을 닫으면 기록이
            사라지니 JSON 백업을 받아 두세요.
          </Notice>
        ) : (
          bytes > STORAGE_WARN_BYTES && (
            <Notice>
              기록이 {formatBytes(bytes)}를 차지합니다. 브라우저 저장 공간(약 5MB)은 다른 메이플랜드 유틸과 함께
              쓰므로, JSON 백업을 받아 두세요.
            </Notice>
          )
        )}
      </div>
    </Panel>
  );
}
