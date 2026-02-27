// components/ui/DropdownSelect.jsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Label, commonInputStyles } from './FormBase';

export default function DropdownSelect({ label, options = [], value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // 找出目前選取的選項物件，如果沒找到就預設帶第一個（防呆）
    const currentOption = options.find((opt) => opt.value === value) || options[0];

    // 處理點擊外部關閉彈窗 (同樣加上效能優化，只有展開時才綁定)
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleSelect = (selectedValue) => {
        onChange(selectedValue);
        setIsOpen(false);
    };

    return (
        <div className="group relative" ref={dropdownRef}>
            <Label>{label}</Label>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-between ${commonInputStyles}`}
            >
                <span>{currentOption?.label}</span>
                <ChevronDown
                    size={18}
                    className={`text-[#3f4a4e]/40 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {/* 下拉選單列表 */}
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#FAF8F5] rounded-xl shadow-xl shadow-[#3f4a4e]/10 border border-[#3f4a4e]/5 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
                    {options.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleSelect(opt.value)}
                            className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#E5E0DC]/50 transition-colors group/item"
                        >
                            <div className="flex flex-col items-start gap-0.5">
                                <span className="text-base font-bold text-[#3f4a4e]">{opt.label}</span>
                            </div>
                            {/* 如果是目前選取的項目，顯示勾勾圖示 */}
                            {value === opt.value && <Check size={16} className="text-[#3f4a4e]" strokeWidth={3} />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
