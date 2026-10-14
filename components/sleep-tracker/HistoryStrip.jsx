'use client';

import { lastNDates } from '@/lib/sleep-time';

const DAY_TYPE_COLOR = { WORKDAY: '#3f4a4e', HOLIDAY: '#c2785c' };

export default function HistoryStrip({ records, onSelectDate }) {
    const dates = lastNDates(7);
    // Multiple complete rows per wake date (e.g. naps) are summed; the latest row decides day_type.
    // Placeholders are skipped so their date still renders as an empty slot.
    const byDate = {};
    for (const r of records) {
        if (!r.wake_time) continue;
        const entry = byDate[r.date] || { total: 0, dayType: r.day_type };
        entry.total += r.total || 0;
        entry.dayType = r.day_type;
        byDate[r.date] = entry;
    }

    return (
        <section className="mt-8 mb-6">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-[#3f4a4e]/60">最近 7 天</h3>
            <div className="flex justify-between gap-1.5">
                {dates.map((dateStr) => {
                    const entry = byDate[dateStr];
                    return (
                        <button
                            type="button"
                            key={dateStr}
                            onClick={() => onSelectDate(dateStr)}
                            className={`flex flex-1 flex-col items-center rounded-lg py-2 active:scale-95 transition-transform ${
                                entry ? 'border-2 border-[#3f4a4e]' : 'border-2 border-dashed border-[#3f4a4e]/20'
                            }`}
                        >
                            <span className="text-xs font-bold text-[#3f4a4e]/60">{dateStr.slice(8, 10)}</span>
                            <span className="mt-1 text-sm font-extrabold text-[#3f4a4e]">
                                {entry ? (entry.total / 60).toFixed(1) : '–'}
                            </span>
                            <span
                                className="mt-1.5 h-2 w-2 rounded-full"
                                style={{ backgroundColor: entry ? DAY_TYPE_COLOR[entry.dayType] : 'transparent' }}
                            />
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
