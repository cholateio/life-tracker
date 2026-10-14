'use client';

import { formatClock, getTaipeiToday, onsetOffsetToClock, summarizeSleep } from '@/lib/sleep-time';

const INK = '#3f4a4e';
const BETTER = '#5f7f63';
const WORSE = '#c2785c';

// diff = recent - base. `lowerIsBetter` flips the direction; |diff| < flat reads as 持平.
const describeDelta = (diff, { flat, lowerIsBetter, up, down, format }) => {
    if (Math.abs(diff) < flat) return { text: '持平', color: `${INK}80` };
    const improved = lowerIsBetter ? diff < 0 : diff > 0;
    return { text: `${diff > 0 ? up : down} ${format(Math.abs(diff))}`, color: improved ? BETTER : WORSE };
};

const minutesText = (m) => `${Math.round(m)} 分`;

const buildTiles = ({ recent, base }) => {
    const tile = (label, value, unit, recentValue, baseValue, delta) => {
        if (recentValue == null) return { label, value: '–' };
        if (baseValue == null) return { label, value, unit };
        return { label, value, unit, delta: describeDelta(recentValue - baseValue, delta) };
    };

    return [
        tile(
            '入睡時間',
            recent.onsetOffset == null ? null : onsetOffsetToClock(recent.onsetOffset),
            null,
            recent.onsetOffset,
            base.onsetOffset,
            { flat: 10, lowerIsBetter: true, up: '晚', down: '早', format: minutesText }
        ),
        tile(
            '平日睡眠',
            recent.workdayHours?.toFixed(1),
            'h',
            recent.workdayHours,
            base.workdayHours,
            { flat: 0.2, lowerIsBetter: false, up: '多', down: '少', format: (h) => `${h.toFixed(1)} h` }
        ),
        tile(
            '少於 5 小時',
            recent.nights ? String(recent.shortCount) : null,
            '晚',
            recent.shortPerWeek,
            base.shortPerWeek,
            { flat: 0.3, lowerIsBetter: true, up: '每週多', down: '每週少', format: (n) => `${n.toFixed(1)} 晚` }
        ),
        tile(
            '假日起床',
            recent.holidayWake == null ? null : formatClock(recent.holidayWake),
            null,
            recent.holidayWake,
            base.holidayWake,
            { flat: 10, lowerIsBetter: true, up: '晚', down: '早', format: minutesText }
        ),
    ];
};

export default function SleepTrend({ records }) {
    const tiles = buildTiles(summarizeSleep(records, getTaipeiToday()));

    return (
        <section className="mb-6 border-t border-[#3f4a4e]/10 pt-6">
            <h3 className="mb-5 text-xs font-bold uppercase tracking-widest text-[#3f4a4e]/60">最近 7 天 vs 前 4 週</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-7">
                {tiles.map(({ label, value, unit, delta }) => (
                    <div key={label}>
                        <p className="text-xs font-bold tracking-widest text-[#3f4a4e]/50">{label}</p>
                        <p className="mt-1.5 text-3xl font-extrabold tabular-nums text-[#3f4a4e]">
                            {value}
                            {unit && value !== '–' && (
                                <span className="ml-1 text-base font-bold text-[#3f4a4e]/60">{unit}</span>
                            )}
                        </p>
                        {delta && (
                            <p className="mt-1 text-sm font-bold" style={{ color: delta.color }}>
                                {delta.text}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
