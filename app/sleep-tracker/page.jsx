'use client';

import { useCallback, useEffect, useState } from 'react';
import { Moon, Sun, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import RecordPageLayout from '@/components/layout/RecordPageLayout';
import DayTypeToggle from '@/components/sleep-tracker/DayTypeToggle';
import HistoryStrip from '@/components/sleep-tracker/HistoryStrip';
import SleepRecordSheet from '@/components/sleep-tracker/SleepRecordSheet';
import DayRecordsSheet from '@/components/sleep-tracker/DayRecordsSheet';
import SessionConflictSheet from '@/components/sleep-tracker/SessionConflictSheet';
import {
    buildCompleteFields,
    expectedWakeDate,
    formatDuration,
    formatTaipeiMonthDay,
    getTaipeiTime,
    getTaipeiToday,
    lastNDates,
    toHHMM,
} from '@/lib/sleep-time';
import {
    deleteRecord,
    fetchOpenSession,
    fetchRecordsInRange,
    isPlaceholder,
    restartSession,
    saveCompleteRecord,
    startSession,
} from '@/lib/sleep';

const ActionButton = ({ onClick, disabled, color, Icon, label }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex-1 bg-transparent border-2 rounded-2xl py-12 text-lg font-extrabold tracking-widest active:scale-[0.98] transition-all disabled:opacity-60"
        style={{ borderColor: color, color }}
    >
        {disabled ? (
            <Loader2 className="mx-auto mb-3 animate-spin" size={40} />
        ) : (
            <Icon className="mx-auto mb-3" size={40} strokeWidth={2.5} />
        )}
        {label}
    </button>
);

const blankEditor = (date) => ({
    id: null,
    date,
    sleep: '',
    wake: '',
    dayType: 'WORKDAY',
    title: '補紀錄',
    canDelete: false,
});

const editorFromRow = (row) => ({
    id: row.id,
    date: row.date ?? (row.sleep_time ? expectedWakeDate(row.created_at, row.sleep_time) : getTaipeiToday()),
    sleep: toHHMM(row.sleep_time),
    wake: toHHMM(row.wake_time),
    dayType: row.day_type ?? 'WORKDAY',
    title: isPlaceholder(row) ? '補紀錄' : row.wake_time ? '編輯紀錄' : '補上起床',
    canDelete: true,
});

export default function SleepTrackerPage() {
    const [loading, setLoading] = useState(false);
    const [dayType, setDayType] = useState('WORKDAY');
    const [records, setRecords] = useState([]);
    const [openSession, setOpenSession] = useState(null);
    const [editor, setEditor] = useState(null);
    const [dayPicker, setDayPicker] = useState(null);
    const [conflict, setConflict] = useState(null);

    const refresh = useCallback(async () => {
        const dates = lastNDates(7);
        const [recent, open] = await Promise.all([
            fetchRecordsInRange(dates[0], dates[dates.length - 1]),
            fetchOpenSession(),
        ]);
        // On error keep the previous state: an empty/null fallback would read as "no session".
        if (recent.error) toast.error(`讀取紀錄失敗：${recent.error.message}`);
        else setRecords(recent.data || []);
        if (open.error) toast.error(`讀取睡覺中紀錄失敗：${open.error.message}`);
        else setOpenSession(open.data);
    }, []);

    useEffect(() => {
        const load = () => refresh();
        load();
    }, [refresh]);

    const handleAction = (actionFn, loadingMsg) => {
        if (loading) return;
        setLoading(true);
        toast.promise(
            actionFn().finally(() => setLoading(false)),
            {
                loading: loadingMsg,
                success: (data) => data,
                error: (err) => `錯誤：${err.message}`,
            }
        );
    };

    const openEditor = (initial) => {
        setDayPicker(null);
        setConflict(null);
        setEditor(initial);
    };

    const beginSession = () =>
        handleAction(async () => {
            const time = getTaipeiTime();
            const { error } = await startSession(time, dayType);
            if (error) throw error;
            refresh();
            return `已紀錄「${dayType === 'WORKDAY' ? '平日' : '假日'}」睡覺時間 (${time})`;
        }, '正在紀錄...');

    // Re-checks the DB instead of trusting openSession state: another device may have changed it.
    const handleSleep = async () => {
        if (loading) return;
        setLoading(true);
        const { data: open, error } = await fetchOpenSession();
        setLoading(false);
        if (error) return toast.error(`讀取紀錄失敗：${error.message}`);
        if (open) return setConflict(open);
        beginSession();
    };

    const handleRestart = () =>
        handleAction(async () => {
            const time = getTaipeiTime();
            const { error } = await restartSession(conflict.id, time, dayType);
            if (error) throw error;
            setConflict(null);
            refresh();
            return `已改成從 ${time} 開始睡覺`;
        }, '正在更新...');

    const handleWake = () =>
        handleAction(async () => {
            const { data: open, error: fetchError } = await fetchOpenSession();
            if (fetchError) throw fetchError;
            if (!open) throw new Error('找不到睡覺中的紀錄，忘了按睡覺的話請點下方今天的卡片補上。');

            const fields = buildCompleteFields({
                date: getTaipeiToday(),
                sleep: open.sleep_time,
                wake: getTaipeiTime(),
                dayType: open.day_type,
            });
            const { error } = await saveCompleteRecord(open.id, fields);
            if (error) throw error;
            refresh();
            return `早安！共睡了 ${formatDuration(fields.total)}`;
        }, '正在計算...');

    const handleSave = ({ id, date, sleep, wake, dayType: rowDayType }) =>
        handleAction(async () => {
            if (!date || !sleep || !wake) throw new Error('請填寫日期、睡覺與起床時間。');
            const fields = buildCompleteFields({ date, sleep, wake, dayType: rowDayType });
            if (fields.total === 0) throw new Error('睡覺與起床時間相同。');

            const { error } = await saveCompleteRecord(id, fields);
            if (error) throw error;
            setEditor(null);
            refresh();
            return `已儲存 ${date}（${formatDuration(fields.total)}）`;
        }, '正在儲存...');

    const handleDelete = (id) =>
        handleAction(async () => {
            const { error } = await deleteRecord(id);
            if (error) throw error;
            setEditor(null);
            refresh();
            return '已刪除';
        }, '正在刪除...');

    // Today's empty slot with an open session waking today is the "forgot 起床" case: close that session
    // rather than add a second row. A session started tonight wakes tomorrow and is left alone. Re-queried, not read from state: state is null before the first load
    // and after a failed read, and a blank editor opened then would recreate the 2026-10-13 duplicate.
    const openTodaySlot = async () => {
        if (loading) return;
        setLoading(true);
        const { data: open, error } = await fetchOpenSession();
        setLoading(false);
        if (error) return toast.error(`讀取紀錄失敗：${error.message}`);
        const today = getTaipeiToday();
        const wakesToday = open && expectedWakeDate(open.created_at, open.sleep_time) === today;
        openEditor(wakesToday ? editorFromRow(open) : blankEditor(today));
    };

    const handleSelectDate = (dateStr) => {
        const rows = records.filter((r) => r.date === dateStr);
        if (rows.length === 1) return openEditor(editorFromRow(rows[0]));
        if (rows.length > 1) return setDayPicker({ date: dateStr, rows });
        if (dateStr === getTaipeiToday()) return openTodaySlot();
        openEditor(blankEditor(dateStr));
    };

    return (
        <RecordPageLayout title="睡眠">
            <DayTypeToggle value={dayType} onChange={setDayType} />

            <div className="mt-8 flex gap-3">
                <ActionButton onClick={handleSleep} disabled={loading} Icon={Moon} label="睡覺" color="#3f4a4e" />
                <ActionButton onClick={handleWake} disabled={loading} Icon={Sun} label="起床" color="#c2785c" />
            </div>

            {openSession && (
                <button
                    type="button"
                    onClick={() => openEditor(editorFromRow(openSession))}
                    className="mt-6 w-full rounded-2xl border-2 border-dashed border-[#3f4a4e]/40 px-4 py-3 text-left active:scale-[0.98] transition-transform"
                >
                    <span className="block text-sm font-bold text-[#3f4a4e]">
                        睡覺中 · 自 {formatTaipeiMonthDay(openSession.created_at)} {toHHMM(openSession.sleep_time)}
                    </span>
                    <span className="block text-xs font-bold text-[#3f4a4e]/50">忘了按起床？點這裡補上</span>
                </button>
            )}

            <HistoryStrip records={records} onSelectDate={handleSelectDate} />

            {editor && (
                <SleepRecordSheet
                    initial={editor}
                    busy={loading}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onClose={() => setEditor(null)}
                />
            )}
            {dayPicker && (
                <DayRecordsSheet
                    date={dayPicker.date}
                    rows={dayPicker.rows}
                    onPick={(row) => openEditor(editorFromRow(row))}
                    onAdd={() => openEditor(blankEditor(dayPicker.date))}
                    onClose={() => setDayPicker(null)}
                />
            )}
            {conflict && (
                <SessionConflictSheet
                    session={conflict}
                    busy={loading}
                    onCloseSession={() => openEditor(editorFromRow(conflict))}
                    onRestart={handleRestart}
                    onClose={() => setConflict(null)}
                />
            )}
        </RecordPageLayout>
    );
}
