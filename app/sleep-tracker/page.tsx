'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Moon, Sun, Briefcase, Coffee, Loader2, LucideIcon } from 'lucide-react';
import { Toaster, toast } from 'sonner';

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
        <span className="text-2xl font-bold tracking-wider"></span>
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
            { loading: loadingMsg, success: (data) => data, error: (err) => `錯誤：${err.message}` }
        );
    };

    const handleSleep = () =>
        handleAction(async () => {
            const { error } = await supabase.from('Sleep').insert([{ sleep_time: new Date().toISOString(), day_type: dayType }]);
            if (error) throw error;
            return `已紀錄「${dayType === 'WORKDAY' ? '平日' : '假日'}」睡覺時間`;
        }, '正在紀錄...');

    const handleWake = () =>
        handleAction(async () => {
            const { data: latest, error: fetchError } = await supabase
                .from('Sleep')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (fetchError || !latest) throw new Error('找不到任何睡眠紀錄，請先按睡覺。');
            if (latest.wake_time) throw new Error('最新一筆紀錄已結束。');

            const wakeTime = new Date();
            const durationMinutes = Math.floor((wakeTime.getTime() - new Date(latest.sleep_time).getTime()) / 60000);

            const { error } = await supabase
                .from('Sleep')
                .update({
                    wake_time: wakeTime.toISOString(),
                    date: wakeTime.toLocaleDateString('en-CA'),
                    weekday: wakeTime.toLocaleDateString('zh-TW', { weekday: 'short' }),
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
