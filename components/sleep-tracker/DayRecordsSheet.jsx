'use client';

import { isPlaceholder } from '@/lib/sleep';
import { toHHMM } from '@/lib/sleep-time';
import SheetShell from './SheetShell';

const describe = (row) => {
    if (isPlaceholder(row)) return '待填';
    if (!row.wake_time) return `${toHHMM(row.sleep_time)} → 睡覺中`;
    return `${toHHMM(row.sleep_time)} → ${toHHMM(row.wake_time)} · ${(row.total / 60).toFixed(1)} h`;
};

export default function DayRecordsSheet({ date, rows, onPick, onAdd, onClose }) {
    return (
        <SheetShell title={`${date.slice(5).replace('-', '/')} 的紀錄`} onClose={onClose}>
            <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                    <li key={row.id}>
                        <button
                            type="button"
                            onClick={() => onPick(row)}
                            className="w-full rounded-xl border-2 border-[#3f4a4e] px-4 py-3 text-left font-bold text-[#3f4a4e] active:scale-[0.98] transition-transform"
                        >
                            {describe(row)}
                        </button>
                    </li>
                ))}
            </ul>
            <button
                type="button"
                onClick={onAdd}
                className="text-sm font-bold tracking-widest text-[#3f4a4e]/60 hover:text-[#3f4a4e] transition-colors"
            >
                ＋ 新增一筆
            </button>
        </SheetShell>
    );
}
