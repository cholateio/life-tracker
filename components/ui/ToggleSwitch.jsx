// components/ui/ToggleSwitch.jsx
'use client';

export default function ToggleSwitch({ label, checked, onChange }) {
    return (
        <div className="group mt-2">
            <label className="flex items-center gap-3 cursor-pointer">
                {/* 開關本體 */}
                <div
                    className={`w-14 h-8 rounded-full transition-colors relative flex items-center ${
                        checked ? 'bg-[#3f4a4e]' : 'bg-[#3f4a4e]/20'
                    }`}
                    onClick={() => onChange(!checked)}
                >
                    {/* 滑動的圓點 */}
                    <div
                        className={`w-6 h-6 bg-[#E5E0DC] rounded-full absolute transition-transform ${
                            checked ? 'translate-x-7' : 'translate-x-1'
                        }`}
                    />
                </div>
                {/* 如果有傳入 label 才顯示右側文字 */}
                {label && <span className="text-sm font-bold text-[#3f4a4e] uppercase tracking-wider">{label}</span>}
            </label>
        </div>
    );
}
