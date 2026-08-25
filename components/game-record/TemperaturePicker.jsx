// components/game-record/TemperaturePicker.jsx
'use client';

import { TEMPERATURES } from '@/lib/games';

// Spec §1.3: five fixed states, deliberately NOT a good-to-bad scale — same
// neutral styling for all five, order follows the spec's definition order.
export default function TemperaturePicker({ value, onChange }) {
    return (
        <div className="grid grid-cols-5 gap-2">
            {TEMPERATURES.map(({ code, label }) => {
                const selected = value === code;
                return (
                    <button
                        key={code}
                        type="button"
                        onClick={() => onChange(selected ? null : code)}
                        aria-pressed={selected}
                        className={`py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                            selected
                                ? 'bg-[#3f4a4e] text-[#E5E0DC]'
                                : 'border-2 border-dashed border-[#3f4a4e]/30 text-[#3f4a4e]/60'
                        }`}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
