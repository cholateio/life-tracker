'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import DatePicker from '@/components/ui/DatePicker';
import { FormInput } from '@/components/ui/FormInput';
import SheetShell from './SheetShell';
import DayTypeToggle from './DayTypeToggle';

// Form state is seeded from `initial` once; the parent unmounts this sheet between opens,
// which is also what resets DatePicker's displayed month.
export default function SleepRecordSheet({ initial, busy, onSave, onDelete, onClose }) {
    const [date, setDate] = useState(initial.date);
    const [sleep, setSleep] = useState(initial.sleep);
    const [wake, setWake] = useState(initial.wake);
    const [dayType, setDayType] = useState(initial.dayType);

    const handleDelete = () => {
        if (!window.confirm('確定刪除這筆紀錄？')) return;
        onDelete(initial.id);
    };

    return (
        <SheetShell title={initial.title} busy={busy} onClose={onClose}>
            <DatePicker label="起床日期" value={date} onChange={setDate} />
            <FormInput label="睡覺時間" type="time" value={sleep} onChange={(e) => setSleep(e.target.value)} />
            <FormInput label="起床時間" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
            <DayTypeToggle value={dayType} onChange={setDayType} />

            <button
                type="button"
                onClick={() => onSave({ id: initial.id, date, sleep, wake, dayType })}
                disabled={busy}
                className="w-full py-4 rounded-full bg-[#3f4a4e] text-white font-bold text-lg shadow-lg active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
                {busy ? <Loader2 className="animate-spin w-5 h-5" /> : '儲存'}
            </button>

            {initial.canDelete && (
                <button
                    type="button"
                    onClick={handleDelete}
                    disabled={busy}
                    className="flex items-center justify-center gap-1.5 text-sm font-bold text-[#c2785c] disabled:opacity-40"
                >
                    <Trash2 size={16} />
                    刪除這筆
                </button>
            )}
        </SheetShell>
    );
}
