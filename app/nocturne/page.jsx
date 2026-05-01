'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Dices, Settings } from 'lucide-react';
import { toast } from 'sonner';

import RecordPageLayout from '@/components/layout/RecordPageLayout';
import { THEMES, THEMES_BY_ID } from '@/configs/nocturne-themes';
import {
    DEFAULT_WEIGHTS,
    drawTheme,
    lastNNightDates,
    loadDraws,
    loadWeights,
    recordDraw,
    saveWeights,
    tonightDate,
} from '@/lib/nocturne';

function PreNightPlaceholder({ now }) {
    const remaining = Math.max(0, 19 - now.getHours());
    return (
        <div className="my-8 flex flex-col items-center justify-center bg-[#3f4a4e]/5 border-2 border-dashed border-[#3f4a4e]/20 rounded-2xl p-12 text-center text-[#3f4a4e]/50">
            <p className="font-bold tracking-widest text-sm uppercase">尚未到開放時間</p>
            <p className="mt-3 text-sm">
                7pm 後解鎖今晚的籤
                {remaining > 0 ? `（還有約 ${remaining} 小時）` : ''}
            </p>
        </div>
    );
}

function DrawButton({ onDraw }) {
    return (
        <button
            type="button"
            onClick={onDraw}
            className="my-8 w-full bg-transparent border-2 border-[#3f4a4e] text-[#3f4a4e] rounded-2xl py-14 text-xl font-extrabold tracking-widest active:scale-[0.98] transition-all"
        >
            <Dices className="mx-auto mb-3" size={44} strokeWidth={2.5} />
            抽今晚
        </button>
    );
}

function ThemeCard({ theme }) {
    return (
        <article className="my-6 rounded-2xl border-2 border-[#3f4a4e] bg-transparent p-6">
            <h2 className="text-2xl font-extrabold tracking-wide" style={{ color: theme.color }}>
                {theme.name}
            </h2>

            {theme.entry && (
                <section className="mt-5 rounded-xl bg-[#3f4a4e] p-4 text-white">
                    <h3 className="text-xs font-bold uppercase tracking-widest opacity-70">入場動作</h3>
                    <p className="mt-2 text-base font-semibold leading-relaxed">{theme.entry}</p>
                </section>
            )}

            {theme.mainRule && (
                <section className="mt-5">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#3f4a4e]/60">主場規則</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#3f4a4e]">{theme.mainRule}</p>
                </section>
            )}
        </article>
    );
}

function FreeNightPoster({ theme }) {
    return (
        <article className="my-16 flex flex-col items-center text-center">
            <div className="w-12 border-t-2 border-dashed border-[#3f4a4e]/30" />
            <h2 className="mt-10 text-4xl font-extrabold tracking-[0.3em] text-[#3f4a4e]">{theme.name}</h2>
            <p className="mx-auto mt-10 max-w-md text-base leading-relaxed text-[#3f4a4e]/80">{theme.mainRule}</p>
            <div className="mt-10 w-12 border-t-2 border-dashed border-[#3f4a4e]/30" />
        </article>
    );
}

function HistoryStrip({ draws, now }) {
    const dates = lastNNightDates(7, now);
    const drawsByDate = {};
    for (const d of draws) drawsByDate[d.night_date] = d;

    return (
        <section className="mt-2 mb-6">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-[#3f4a4e]/60">最近 7 晚</h3>
            <div className="flex justify-between gap-1.5">
                {dates.map((dateStr) => {
                    const draw = drawsByDate[dateStr];
                    const theme = draw ? THEMES_BY_ID[draw.theme] : null;
                    const day = dateStr.slice(8, 10);
                    return (
                        <div
                            key={dateStr}
                            title={theme ? theme.name : '未抽'}
                            className={`flex flex-1 flex-col items-center rounded-lg py-2 ${
                                draw ? 'border-2 border-[#3f4a4e]' : 'border-2 border-dashed border-[#3f4a4e]/20'
                            }`}
                        >
                            <span className="text-xs font-bold text-[#3f4a4e]/60">{day}</span>
                            <span
                                className="mt-1.5 h-2 w-2 rounded-full"
                                style={{
                                    backgroundColor: draw && theme ? theme.color : 'transparent',
                                }}
                            />
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function WeightSettings({ weights, onChange }) {
    const [open, setOpen] = useState(false);
    const sum = THEMES.reduce((acc, t) => acc + (Number(weights[t.id]) || 0), 0);

    return (
        <section className="mt-auto border-t border-[#3f4a4e]/10 pt-4">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between text-sm font-bold uppercase tracking-widest text-[#3f4a4e]/60"
            >
                <span className="flex items-center gap-2">
                    <Settings size={16} strokeWidth={2.5} />
                    權重設定
                </span>
                {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {open && (
                <div className="mt-4 space-y-3">
                    {THEMES.map((theme) => (
                        <div key={theme.id} className="flex items-center justify-between gap-3">
                            <span className="flex-1 text-sm font-semibold" style={{ color: theme.color }}>
                                {theme.name}
                            </span>
                            <input
                                type="number"
                                min={0}
                                step={1}
                                value={weights[theme.id] ?? 0}
                                onChange={(e) => {
                                    const v = Number(e.target.value);
                                    onChange(theme.id, Number.isFinite(v) && v >= 0 ? v : 0);
                                }}
                                className="w-20 rounded-lg border-2 border-[#3f4a4e]/30 bg-transparent px-2 py-1 text-right text-sm font-bold text-[#3f4a4e] focus:border-[#3f4a4e] focus:outline-none"
                            />
                        </div>
                    ))}
                    <div className="flex justify-between border-t border-dashed border-[#3f4a4e]/20 pt-2 text-xs font-bold uppercase tracking-widest text-[#3f4a4e]/60">
                        <span>總和</span>
                        <span>{sum}</span>
                    </div>
                </div>
            )}
        </section>
    );
}

export default function NocturnePage() {
    const [mounted, setMounted] = useState(false);
    const [now] = useState(() => new Date());
    const [weights, setWeights] = useState(() => (typeof window === 'undefined' ? DEFAULT_WEIGHTS : loadWeights()));
    const [draws, setDraws] = useState(() => (typeof window === 'undefined' ? [] : loadDraws()));

    useEffect(() => {
        const init = () => setMounted(true);
        init();
    }, []);

    if (!mounted) {
        return (
            <RecordPageLayout title="夜籤">
                <div />
            </RecordPageLayout>
        );
    }

    const tonight = tonightDate(now);
    const tonightDraw = draws.find((d) => d.night_date === tonight) || null;
    const tonightTheme = tonightDraw ? THEMES_BY_ID[tonightDraw.theme] : null;

    const handleDraw = () => {
        const themeId = drawTheme(weights);
        const next = recordDraw(themeId, new Date());
        setDraws(next);
        toast.success('籤已抽出');
    };

    const handleWeightChange = (themeId, value) => {
        setWeights((prev) => {
            const next = { ...prev, [themeId]: Math.max(0, value) };
            saveWeights(next);
            return next;
        });
    };

    let mainArea;
    if (tonightTheme) {
        mainArea = tonightTheme.id === 'free' ? <FreeNightPoster theme={tonightTheme} /> : <ThemeCard theme={tonightTheme} />;
    } else if (now.getHours() >= 0) {
        mainArea = <DrawButton onDraw={handleDraw} />;
    } else {
        mainArea = <PreNightPlaceholder now={now} />;
    }

    return (
        <RecordPageLayout title="夜籤">
            {mainArea}
            <HistoryStrip draws={draws} now={now} />
            <WeightSettings weights={weights} onChange={handleWeightChange} />
        </RecordPageLayout>
    );
}
