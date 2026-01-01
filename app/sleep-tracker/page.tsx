'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Moon, Sun, Briefcase, Coffee, Loader2, LucideIcon } from 'lucide-react';
import { Toaster, toast } from 'sonner';

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

// --- Helper: Calculate Duration between two time strings ---
const calculateDurationMinutes = (startTime: string, endTime: string) => {
    const parseMinutes = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const start = parseMinutes(startTime);
    let end = parseMinutes(endTime);
    // If wake time is earlier than sleep time (e.g., Sleep 23:00, Wake 07:00), add 24 hours
    if (end < start) end += 24 * 60;

    return end - start;
};

const ActionButton = ({
    onClick,
    disabled,
    color,
    Icon,
}: {
    onClick: () => void;
    disabled: boolean;
    color: string;
    Icon: LucideIcon;
}) => (
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

const ToggleButton = ({
    active,
    onClick,
    Icon,
    activeColor,
}: {
    active: boolean;
    onClick: () => void;
    Icon: LucideIcon;
    activeColor: string;
}) => (
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
    const [dayType, setDayType] = useState<'WORKDAY' | 'HOLIDAY'>('WORKDAY');

    const handleAction = async (actionFn: () => Promise<string>, loadingMsg: string) => {
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
            const taipeiTime = getTaipeiTime(); // e.g., "22:30:05"

            const { error } = await supabase.from('Sleep').insert([{ sleep_time: taipeiTime, day_type: dayType }]);

            if (error) throw error;
            return `已紀錄「${dayType === 'WORKDAY' ? '平日' : '假日'}」睡覺時間 (${taipeiTime})`;
        }, '正在紀錄...');

    const handleWake = () =>
        handleAction(async () => {
            // Get current Taipei time/date
            const wakeTimeStr = getTaipeiTime();
            const { date, weekday } = getTaipeiDateDetails();

            // Fetch latest sleep record
            const { data: latest, error: fetchError } = await supabase
                .from('Sleep')
                .select('*')
                .order('created_at', { ascending: false }) // Keep ordering by created_at for reliability
                .limit(1)
                .single();

            if (fetchError || !latest) throw new Error('找不到任何睡眠紀錄，請先按睡覺。');
            if (latest.wake_time) throw new Error('最新一筆紀錄已結束。');

            // Calculate duration using custom logic (Time String Math)
            const durationMinutes = calculateDurationMinutes(latest.sleep_time, wakeTimeStr);

            const { error } = await supabase
                .from('Sleep')
                .update({
                    wake_time: wakeTimeStr,
                    date: date, // Taipei Date
                    weekday: weekday, // Taipei Weekday
                    total: durationMinutes,
                })
                .eq('id', latest.id);

            if (error) throw error;
            return `早安！共睡了 ${Math.floor(durationMinutes / 60)} 小時 ${durationMinutes % 60} 分鐘`;
        }, '正在計算...');

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

            {/* 切換器 */}
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

            {/* 大按鈕區域 */}
            <ActionButton onClick={handleSleep} disabled={loading} Icon={Moon} color="bg-[#3f4a4e] shadow-[#3f4a4e]/20" />
            <ActionButton onClick={handleWake} disabled={loading} Icon={Sun} color="bg-[#c2785c] shadow-[#c2785c]/20" />
        </div>
    );
}
