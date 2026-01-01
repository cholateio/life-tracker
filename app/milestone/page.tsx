'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Save, Loader2, ChevronDown, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Toaster, toast } from 'sonner';

const GENRE_OPTIONS = [
    { value: 'major', label: 'Major' },
    { value: 'growth', label: 'Growth' },
    { value: 'minor', label: 'Minor' },
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function MilestonePage() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const [isGenreOpen, setIsGenreOpen] = useState(false);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    const genreRef = useRef<HTMLDivElement>(null);
    const dateRef = useRef<HTMLDivElement>(null);

    const [formData, setFormData] = useState({
        title: '',
        genre: 'growth',
        place: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
    });

    const [navDate, setNavDate] = useState(new Date());

    const commonInputStyles =
        'w-full bg-transparent text-lg font-bold text-[#3f4a4e] placeholder-[#3f4a4e]/20 outline-none pb-3 border-b-2 border-[#3f4a4e]/20 focus:border-[#3f4a4e] transition-all duration-300 rounded-none';

    // --- Effect & Handlers ---
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (genreRef.current && !genreRef.current.contains(event.target as Node)) setIsGenreOpen(false);
            if (dateRef.current && !dateRef.current.contains(event.target as Node)) setIsCalendarOpen(false);
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleGenreSelect = (value: string) => {
        setFormData((prev) => ({ ...prev, genre: value }));
        setIsGenreOpen(false);
    };

    const handleDateSelect = (day: number) => {
        const monthStr = (navDate.getMonth() + 1).toString().padStart(2, '0');
        const dayStr = day.toString().padStart(2, '0');
        setFormData((prev) => ({ ...prev, date: `${navDate.getFullYear()}-${monthStr}-${dayStr}` }));
        setIsCalendarOpen(false);
    };

    const changeMonth = (offset: number) => {
        setNavDate((prev) => {
            const newDate = new Date(prev);
            newDate.setMonth(newDate.getMonth() + offset);
            return newDate;
        });
    };

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return {
            daysInMonth: new Date(year, month + 1, 0).getDate(),
            firstDayOfMonth: new Date(year, month, 1).getDay(),
            year,
            month,
        };
    };

    const { daysInMonth, firstDayOfMonth, year, month } = getDaysInMonth(navDate);

    const isSelectedDate = (d: number) => {
        const target = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
        return formData.date === target;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (!formData.title) throw new Error('標題是必填的！');
            const { error } = await supabase
                .from('Milestone')
                .insert([{ ...formData, description: formData.description || null }]);
            if (error) throw error;
            toast.success('已記錄');
            setFormData((prev) => ({ ...prev, title: '', description: '', place: '' }));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '發生錯誤');
        } finally {
            setLoading(false);
        }
    };

    const currentGenre = GENRE_OPTIONS.find((g) => g.value === formData.genre) || GENRE_OPTIONS[0];

    const Label = ({ children }: { children: React.ReactNode }) => (
        <label className="block text-xs font-extrabold uppercase tracking-[0.15em] text-[#3f4a4e]/50 mb-2 pl-1">{children}</label>
    );

    return (
        <div
            className="min-h-dvh w-full flex flex-col items-center justify-center p-6 sm:p-8 transition-colors duration-500 overflow-y-auto"
            style={{ backgroundColor: '#E5E0DC' }}
        >
            <Toaster position="top-center" />

            <form onSubmit={handleSubmit} className="w-full max-w-md flex flex-col gap-8 my-10">
                <div className="group">
                    <Label>Title</Label>
                    <input
                        type="text"
                        name="title"
                        value={formData.title}
                        onChange={handleChange}
                        className={commonInputStyles}
                        autoFocus
                    />
                </div>

                <div className="grid grid-cols-2 gap-8">
                    <div className="group relative" ref={dateRef}>
                        <Label>Date</Label>
                        <button
                            type="button"
                            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                            className={`text-left font-mono tracking-tight ${commonInputStyles}`}
                        >
                            {formData.date.replace(/-/g, '.')}
                        </button>

                        {/* Calendar Popup */}
                        {isCalendarOpen && (
                            <div className="absolute top-full left-0 mt-2 p-4 bg-[#FAF8F5] rounded-xl shadow-xl shadow-[#3f4a4e]/10 border border-[#3f4a4e]/5 z-50 animate-in fade-in slide-in-from-top-2 w-[280px]">
                                <div className="flex items-center justify-between mb-4">
                                    <button
                                        type="button"
                                        onClick={() => changeMonth(-1)}
                                        className="p-1 hover:bg-[#3f4a4e]/10 rounded-full text-[#3f4a4e] transition-colors"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <span className="font-bold text-[#3f4a4e]">
                                        {year}.{(month + 1).toString().padStart(2, '0')}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => changeMonth(1)}
                                        className="p-1 hover:bg-[#3f4a4e]/10 rounded-full text-[#3f4a4e] transition-colors"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                                <div className="grid grid-cols-7 mb-2">
                                    {WEEKDAYS.map((day) => (
                                        <div
                                            key={day}
                                            className="text-center text-[10px] font-extrabold text-[#3f4a4e]/40 uppercase"
                                        >
                                            {day}
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-7 gap-1">
                                    {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                                        <div key={`empty-${i}`} />
                                    ))}
                                    {Array.from({ length: daysInMonth }).map((_, i) => {
                                        const day = i + 1;
                                        const selected = isSelectedDate(day);
                                        return (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() => handleDateSelect(day)}
                                                className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                                                    selected
                                                        ? 'bg-[#3f4a4e] text-[#E5E0DC] shadow-md shadow-[#3f4a4e]/20'
                                                        : 'text-[#3f4a4e] hover:bg-[#3f4a4e]/10'
                                                }`}
                                            >
                                                {day}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Genre Section */}
                    <div className="group relative" ref={genreRef}>
                        <Label>Genre</Label>
                        <button
                            type="button"
                            onClick={() => setIsGenreOpen(!isGenreOpen)}
                            className={`flex items-center justify-between ${commonInputStyles}`}
                        >
                            <span>{currentGenre.label}</span>
                            <ChevronDown
                                size={18}
                                className={`text-[#3f4a4e]/40 transition-transform duration-300 ${
                                    isGenreOpen ? 'rotate-180' : ''
                                }`}
                            />
                        </button>

                        {/* Genre Dropdown */}
                        {isGenreOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-[#FAF8F5] rounded-xl shadow-xl shadow-[#3f4a4e]/10 border border-[#3f4a4e]/5 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
                                {GENRE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => handleGenreSelect(opt.value)}
                                        className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#E5E0DC]/50 transition-colors group/item"
                                    >
                                        <div className="flex flex-col items-start gap-0.5">
                                            <span className="text-base font-bold text-[#3f4a4e]">{opt.label}</span>
                                        </div>
                                        {formData.genre === opt.value && (
                                            <Check size={16} className="text-[#3f4a4e]" strokeWidth={3} />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="group">
                    <Label>Place</Label>
                    <input
                        type="text"
                        name="place"
                        value={formData.place}
                        onChange={handleChange}
                        className={commonInputStyles}
                    />
                </div>

                <div className="group grow">
                    <Label>Description</Label>
                    <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows={5}
                        className={`${commonInputStyles} resize-none leading-relaxed`}
                    />
                </div>

                {/* Submit Button */}
                <div className="pt-4 pb-8">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#3f4a4e] text-[#E5E0DC] rounded-2xl py-5 font-bold text-xl shadow-xl shadow-[#3f4a4e]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed hover:bg-[#2d3538]"
                    >
                        {loading ? (
                            <Loader2 className="animate-spin" size={24} />
                        ) : (
                            <>
                                <Save size={22} strokeWidth={2.5} />
                                <span className="tracking-wide">SAVE RECORD</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
