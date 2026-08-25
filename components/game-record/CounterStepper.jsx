// components/game-record/CounterStepper.jsx
'use client';

import { Minus, Plus } from 'lucide-react';

// Stepper is the primary input (spec §1.4); tapping the number allows direct
// keyboard entry. value null = untouched today, rendered as empty.
export default function CounterStepper({ value, onChange }) {
    const current = value ?? 0;
    const btnCls =
        'w-12 h-12 rounded-full border-2 border-[#3f4a4e] text-[#3f4a4e] flex items-center justify-center active:scale-90 transition-all';

    return (
        <div className="flex items-center justify-center gap-6">
            <button type="button" aria-label="減一" onClick={() => onChange(current - 1)} className={btnCls}>
                <Minus size={20} strokeWidth={2.5} />
            </button>
            <input
                type="number"
                inputMode="numeric"
                value={value ?? ''}
                placeholder="—"
                onChange={(e) => onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                className="w-24 bg-transparent text-center text-3xl font-extrabold text-[#3f4a4e] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button type="button" aria-label="加一" onClick={() => onChange(current + 1)} className={btnCls}>
                <Plus size={20} strokeWidth={2.5} />
            </button>
        </div>
    );
}
