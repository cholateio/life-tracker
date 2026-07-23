'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Moon, Sun, Briefcase, Coffee, Loader2, X } from 'lucide-react';
import { Toaster, toast } from 'sonner';
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

const ActionButton = ({ onClick, disabled, color, Icon }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`group w-full max-w-sm h-40 rounded-[2.5rem] shadow-xl flex flex-col items-center justify-center gap-3 text-white transition-all active:scale-95 active:shadow-md disabled:opacity-70 ${color}`}
    >
        {disabled ? (
            <Loader2 className="animate-spin w-12 h-12 opacity-80" />
        ) : (
            <Icon size={48} strokeWidth={2} className="group-hover:scale-110 transition-transform duration-300" />
        )}
    </button>
);

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

            setShowBackfill(false);
            setBackfillSleep('');
            setBackfillWake('');
            return `已補紀錄 ${backfillDate}（${Math.floor(durationMinutes / 60)} 小時 ${durationMinutes % 60} 分）`;
        }, '正在補紀錄...');

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center p-8 gap-16 transition-colors duration-500"
            style={{ backgroundColor: '#ede6e1' }}
        >
            <Toaster
                position="top-center"
                toastOptions={{
                    style: {
                        background: '#fdfbf7',
                        color: '#3f4a4e',
                        border: '1px solid #dcd6d1',
                        borderRadius: '1.5rem',
                        fontSize: '1rem',
                        padding: '1.2rem',
                    },
                }}
            />

            <div className="bg-[#dcd6d1] p-1.5 rounded-full flex w-full max-w-xs shadow-inner">
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

            <ActionButton onClick={handleSleep} disabled={loading} Icon={Moon} color="bg-[#3f4a4e] shadow-[#3f4a4e]/20" />
            <ActionButton onClick={handleWake} disabled={loading} Icon={Sun} color="bg-[#c2785c] shadow-[#c2785c]/20" />

            <button
                onClick={() => setShowBackfill(true)}
                className="text-sm font-bold text-[#8a817c] underline underline-offset-4 decoration-[#8a817c]/40 hover:text-[#6b635f] transition-colors"
            >
                補紀錄
            </button>

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
        </div>
    );
}
