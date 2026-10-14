'use client';

import { formatTaipeiMonthDay, toHHMM } from '@/lib/sleep-time';
import SheetShell from './SheetShell';

export default function SessionConflictSheet({ session, busy, onCloseSession, onRestart, onClose }) {
    return (
        <SheetShell title="已經在睡覺中" busy={busy} onClose={onClose}>
            <p className="text-sm font-bold text-[#3f4a4e]/70">
                {formatTaipeiMonthDay(session.created_at)} {toHHMM(session.sleep_time)} 開始的紀錄還沒按起床。
            </p>
            <button
                type="button"
                onClick={onCloseSession}
                disabled={busy}
                className="w-full py-4 rounded-full bg-[#3f4a4e] text-white font-bold shadow-lg active:scale-95 transition-all disabled:opacity-60"
            >
                補上它的起床時間
            </button>
            <button
                type="button"
                onClick={onRestart}
                disabled={busy}
                className="w-full py-4 rounded-full border-2 border-[#3f4a4e] text-[#3f4a4e] font-bold active:scale-95 transition-all disabled:opacity-60"
            >
                改成從現在開始
            </button>
        </SheetShell>
    );
}
