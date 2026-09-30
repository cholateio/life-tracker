'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Moon, Sun, Briefcase, Coffee, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import RecordPageLayout from '@/components/layout/RecordPageLayout';
import DatePicker from '@/components/ui/DatePicker';
import { FormInput } from '@/components/ui/FormInput';

// --- Helper: Get Taipei Time String (HH:mm:ss) ---
const getTaipeiTime = () => {
    return new Date().toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Taipei',
        hour12: false, // Forces 24-hour format like 22:00:00
    });
};

// --- Helper: Get Taipei Date Details ---
const getTaipeiDateDetails = () => {
    const now = new Date();
    return {
        date: now.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }), // YYYY-MM-DD
        weekday: now.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'short' }), // 週X
    };
};

// --- Helper: 由 YYYY-MM-DD 算出週幾（與即時流程的 zh-TW short weekday 格式一致，例如 週二）
// 以本地午夜建構 Date 只為取 weekday，不涉時區位移
const getWeekdayFromDate = (dateStr) =>
    new Date(`${dateStr}T00:00:00`).toLocaleDateString('zh-TW', { weekday: 'short' });

// --- Helper: Calculate Duration between two time strings ---
const calculateDurationMinutes = (startTime, endTime) => {
    const parseMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const start = parseMinutes(startTime);
    let end = parseMinutes(endTime);
    // If wake time is earlier than sleep time (e.g., Sleep 23:00, Wake 07:00), add 24 hours
    if (end < start) end += 24 * 60;

    return end - start;
};

// YYYY-MM-DD strings for the last n days ending at today (Taipei), oldest first
const lastNDates = (n) => {
    const today = getTaipeiDateDetails().date;
    const base = new Date(`${today}T00:00:00Z`);
    const dates = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(base);
        d.setUTCDate(d.getUTCDate() - i);
        dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
};

const DAY_TYPE_COLOR = { WORKDAY: '#3f4a4e', HOLIDAY: '#c2785c' };

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

function HistoryStrip({ records }) {
    const dates = lastNDates(7);
    // Multiple rows per wake date (e.g. naps) are summed; the latest row decides day_type
    const byDate = {};
    for (const r of records) {
        const entry = byDate[r.date] || { total: 0, dayType: r.day_type };
        entry.total += r.total || 0;
        entry.dayType = r.day_type;
        byDate[r.date] = entry;
    }

    return (
        <section className="mt-8 mb-6">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-[#3f4a4e]/60">最近 7 天</h3>
            <div className="flex justify-between gap-1.5">
                {dates.map((dateStr) => {
                    const entry = byDate[dateStr];
                    return (
                        <div
                            key={dateStr}
                            className={`flex flex-1 flex-col items-center rounded-lg py-2 ${
                                entry ? 'border-2 border-[#3f4a4e]' : 'border-2 border-dashed border-[#3f4a4e]/20'
                            }`}
                        >
                            <span className="text-xs font-bold text-[#3f4a4e]/60">{dateStr.slice(8, 10)}</span>
                            <span className="mt-1 text-sm font-extrabold text-[#3f4a4e]">
                                {entry ? (entry.total / 60).toFixed(1) : '–'}
                            </span>
                            <span
                                className="mt-1.5 h-2 w-2 rounded-full"
                                style={{ backgroundColor: entry ? DAY_TYPE_COLOR[entry.dayType] : 'transparent' }}
                            />
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

const ToggleButton = ({ active, onClick, Icon, activeColor }) => (
    <button
        onClick={onClick}
        className={`flex-1 py-3 rounded-full text-base font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
            active ? `bg-white ${activeColor} shadow-sm` : 'text-[#8a817c] hover:text-[#6b635f]'
        }`}
    >
        <Icon size={20} strokeWidth={2.5} />
    </button>
);

export default function SleepTrackerPage() {
    const [loading, setLoading] = useState(false);
    const [dayType, setDayType] = useState('WORKDAY');

    // Backfill（事後補一整筆完整紀錄）— 與即時打卡的 dayType 分開，避免互相干擾
    const [showBackfill, setShowBackfill] = useState(false);
    const [backfillDate, setBackfillDate] = useState(() => getTaipeiDateDetails().date);
    const [backfillSleep, setBackfillSleep] = useState('');
    const [backfillWake, setBackfillWake] = useState('');
    const [backfillDayType, setBackfillDayType] = useState('WORKDAY');
    const [records, setRecords] = useState([]);

    const fetchRecords = useCallback(async () => {
        const dates = lastNDates(7);
        const { data, error } = await supabase
            .from('life_sleep')
            .select('date, total, day_type, created_at')
            .not('wake_time', 'is', null)
            .gte('date', dates[0])
            .lte('date', dates[dates.length - 1])
            .order('created_at', { ascending: true });
        if (error) {
            toast.error(`讀取紀錄失敗：${error.message}`);
            setRecords([]);
            return;
        }
        setRecords(data || []);
    }, []);

    useEffect(() => {
        const load = () => fetchRecords();
        load();
    }, [fetchRecords]);

    const handleAction = async (actionFn, loadingMsg) => {
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

    const handleSleep = () =>
        handleAction(async () => {
            const taipeiTime = getTaipeiTime();

            const { error } = await supabase.from('life_sleep').insert([{ sleep_time: taipeiTime, day_type: dayType }]);

            if (error) throw error;
            return `已紀錄「${dayType === 'WORKDAY' ? '平日' : '假日'}」睡覺時間 (${taipeiTime})`;
        }, '正在紀錄...');

    const handleWake = () =>
        handleAction(async () => {
            const wakeTimeStr = getTaipeiTime();
            const { date, weekday } = getTaipeiDateDetails();

            // 過濾未完成的 row（wake_time IS NULL），不能只靠「最新一筆」：
            // backfill 插入的完成紀錄 created_at 是當下，會比開啟中的即時紀錄還新
            const { data: latest, error: fetchError } = await supabase
                .from('life_sleep')
                .select('*')
                .is('wake_time', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (fetchError || !latest) throw new Error('找不到開啟中的睡眠紀錄，請先按睡覺。');

            const durationMinutes = calculateDurationMinutes(latest.sleep_time, wakeTimeStr);

            const { error } = await supabase
                .from('life_sleep')
                .update({
                    wake_time: wakeTimeStr,
                    date: date,
                    weekday: weekday,
                    total: durationMinutes,
                })
                .eq('id', latest.id);

            if (error) throw error;
            fetchRecords();
            return `早安！共睡了 ${Math.floor(durationMinutes / 60)} 小時 ${durationMinutes % 60} 分鐘`;
        }, '正在計算...');

    const handleBackfillSubmit = () =>
        handleAction(async () => {
            if (!backfillDate || !backfillSleep || !backfillWake) throw new Error('請填寫日期、睡覺與起床時間。');

            const sleepTime = `${backfillSleep}:00`;
            const wakeTime = `${backfillWake}:00`;
            const durationMinutes = calculateDurationMinutes(sleepTime, wakeTime);

            // 寫入一筆已完成 row（含 wake_time），不會被 handleWake 的「找開啟中紀錄」邏輯撈到
            const { error } = await supabase.from('life_sleep').insert([
                {
                    sleep_time: sleepTime,
                    wake_time: wakeTime,
                    day_type: backfillDayType,
                    date: backfillDate,
                    weekday: getWeekdayFromDate(backfillDate),
                    total: durationMinutes,
                },
            ]);

            if (error) throw error;

            fetchRecords();
            setShowBackfill(false);
            setBackfillSleep('');
            setBackfillWake('');
            return `已補紀錄 ${backfillDate}（${Math.floor(durationMinutes / 60)} 小時 ${durationMinutes % 60} 分）`;
        }, '正在補紀錄...');

    return (
        <RecordPageLayout title="睡眠">
            <div className="bg-[#dcd6d1] p-1.5 rounded-full flex w-full shadow-inner">
                <ToggleButton
                    active={dayType === 'WORKDAY'}
                    onClick={() => setDayType('WORKDAY')}
                    Icon={Briefcase}
                    activeColor="text-[#3f4a4e]"
                />
                <ToggleButton
                    active={dayType === 'HOLIDAY'}
                    onClick={() => setDayType('HOLIDAY')}
                    Icon={Coffee}
                    activeColor="text-[#c2785c]"
                />
            </div>

            <div className="mt-8 flex gap-3">
                <ActionButton onClick={handleSleep} disabled={loading} Icon={Moon} label="睡覺" color="#3f4a4e" />
                <ActionButton onClick={handleWake} disabled={loading} Icon={Sun} label="起床" color="#c2785c" />
            </div>

            <HistoryStrip records={records} />

            <section className="mt-auto border-t border-[#3f4a4e]/10 pt-4">
                <button
                    type="button"
                    onClick={() => setShowBackfill(true)}
                    className="text-sm font-bold uppercase tracking-widest text-[#3f4a4e]/60 hover:text-[#3f4a4e] transition-colors"
                >
                    補紀錄
                </button>
            </section>

            {showBackfill && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40"
                    onClick={() => !loading && setShowBackfill(false)}
                >
                    <div
                        className="w-full max-w-sm bg-[#fdfbf7] rounded-[2rem] p-6 shadow-2xl flex flex-col gap-5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-black text-[#3f4a4e]">補紀錄</h2>
                            <button
                                onClick={() => setShowBackfill(false)}
                                disabled={loading}
                                className="text-[#3f4a4e] opacity-50 hover:opacity-100 transition-opacity disabled:opacity-30"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <DatePicker label="起床日期" value={backfillDate} onChange={setBackfillDate} />

                        <FormInput
                            label="睡覺時間"
                            type="time"
                            value={backfillSleep}
                            onChange={(e) => setBackfillSleep(e.target.value)}
                        />
                        <FormInput
                            label="起床時間"
                            type="time"
                            value={backfillWake}
                            onChange={(e) => setBackfillWake(e.target.value)}
                        />

                        <div className="bg-[#dcd6d1] p-1.5 rounded-full flex shadow-inner">
                            <ToggleButton
                                active={backfillDayType === 'WORKDAY'}
                                onClick={() => setBackfillDayType('WORKDAY')}
                                Icon={Briefcase}
                                activeColor="text-[#3f4a4e]"
                            />
                            <ToggleButton
                                active={backfillDayType === 'HOLIDAY'}
                                onClick={() => setBackfillDayType('HOLIDAY')}
                                Icon={Coffee}
                                activeColor="text-[#c2785c]"
                            />
                        </div>

                        <button
                            onClick={handleBackfillSubmit}
                            disabled={loading}
                            className="w-full py-4 rounded-full bg-[#3f4a4e] text-white font-bold text-lg shadow-lg active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : '儲存'}
                        </button>
                    </div>
                </div>
            )}
        </RecordPageLayout>
    );
}
