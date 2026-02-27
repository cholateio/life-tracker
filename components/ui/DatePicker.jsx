// components/ui/DatePicker.jsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Label } from './FormBase';

export default function DatePicker({ label = 'Date', value, onChange }) {
    const [showDatePicker, setShowDatePicker] = useState(false);

    // 初始化日曆顯示的月份（若有傳入 value 則使用該日期，否則使用當前時間）
    const initialDate = value ? new Date(value) : new Date();
    const [currentMonth, setCurrentMonth] = useState(initialDate);

    const datePickerRef = useRef(null);

    // 效能優化：處理點擊外部關閉彈窗，並在元件卸載時清除監聽器避免 Memory Leak
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
                setShowDatePicker(false);
            }
        };

        // 只有在彈窗開啟時才綁定事件，節省效能
        if (showDatePicker) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showDatePicker]);

    // 計算當月天數與第一天是星期幾
    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        return { daysInMonth, firstDayOfMonth };
    };

    // 處理日期選擇並回傳給父層
    const handleDateSelect = (day) => {
        const year = currentMonth.getFullYear();
        const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
        const dayString = String(day).padStart(2, '0');

        // 呼叫父層傳入的 onChange 函式更新狀態
        onChange(`${year}-${month}-${dayString}`);
        setShowDatePicker(false);
    };

    const { daysInMonth, firstDayOfMonth } = getDaysInMonth(currentMonth);

    return (
        <div className="group relative" ref={datePickerRef}>
            <Label>{label}</Label>
            <button
                type="button"
                onClick={() => setShowDatePicker(!showDatePicker)}
                className={`flex items-center justify-between w-full border-b-2 py-2 transition-all ${
                    showDatePicker ? 'border-[#3f4a4e]' : 'border-[#3f4a4e]/20'
                }`}
            >
                <span className="text-lg font-bold text-[#3f4a4e]">{value}</span>
                <CalendarIcon size={20} className="text-[#3f4a4e] opacity-60" />
            </button>

            {/* 日曆彈窗 */}
            {showDatePicker && (
                <div className="absolute top-full left-0 mt-2 w-full bg-[#E5E0DC] border-2 border-[#3f4a4e]/20 rounded-2xl p-4 shadow-xl shadow-[#3f4a4e]/10 z-50">
                    <div className="flex justify-between items-center mb-4 text-[#3f4a4e] font-bold">
                        <button
                            type="button"
                            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                            className="p-1 hover:bg-[#3f4a4e]/10 rounded transition-colors"
                        >
                            &lt;
                        </button>
                        <span>
                            {currentMonth.getFullYear()} / {currentMonth.getMonth() + 1}
                        </span>
                        <button
                            type="button"
                            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                            className="p-1 hover:bg-[#3f4a4e]/10 rounded transition-colors"
                        >
                            &gt;
                        </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center mb-2 text-xs font-bold text-[#3f4a4e]/60">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                            <div key={d}>{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                            <div key={`empty-${i}`} />
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, i) => (
                            <button
                                key={i + 1}
                                type="button"
                                onClick={() => handleDateSelect(i + 1)}
                                className="aspect-square flex items-center justify-center rounded-xl text-sm font-bold text-[#3f4a4e] hover:bg-[#3f4a4e]/10 transition-colors"
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
