'use client';

import { Briefcase, Coffee } from 'lucide-react';

const ToggleButton = ({ active, onClick, Icon, activeColor }) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex-1 py-3 rounded-full text-base font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
            active ? `bg-white ${activeColor} shadow-sm` : 'text-[#8a817c] hover:text-[#6b635f]'
        }`}
    >
        <Icon size={20} strokeWidth={2.5} />
    </button>
);

export default function DayTypeToggle({ value, onChange }) {
    return (
        <div className="bg-[#dcd6d1] p-1.5 rounded-full flex w-full shadow-inner">
            <ToggleButton
                active={value === 'WORKDAY'}
                onClick={() => onChange('WORKDAY')}
                Icon={Briefcase}
                activeColor="text-[#3f4a4e]"
            />
            <ToggleButton
                active={value === 'HOLIDAY'}
                onClick={() => onChange('HOLIDAY')}
                Icon={Coffee}
                activeColor="text-[#c2785c]"
            />
        </div>
    );
}
