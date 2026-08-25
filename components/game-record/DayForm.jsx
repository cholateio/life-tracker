// components/game-record/DayForm.jsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, Loader2 } from 'lucide-react';

import { FormInput } from '@/components/ui/FormInput';
import DatePicker from '@/components/ui/DatePicker';
import SubmitButton from '@/components/ui/SubmitButton';
import TagPicker from '@/components/ui/TagPicker';
import { Label, commonInputStyles } from '@/components/ui/FormBase';
import TemperaturePicker from './TemperaturePicker';
import CounterStepper from './CounterStepper';
import ScreenshotUploader from './ScreenshotUploader';
import { fetchDay, createBareDay, updateDay, deleteDayIfBare, sortScreenshots, yesterdayStr } from '@/lib/games';

const EMPTY_FIELDS = {
    temperature: null,
    counter_value: null,
    progress_note: '',
    activities: [],
    one_line: '',
};

function isDayEmpty(fields, screenshots) {
    return (
        screenshots.length === 0 &&
        !fields.temperature &&
        fields.counter_value === null &&
        !fields.progress_note &&
        fields.activities.length === 0 &&
        !fields.one_line
    );
}

export default function DayForm({ game, onBack }) {
    const [date, setDate] = useState(yesterdayStr());
    const [day, setDay] = useState(null);
    const [fields, setFields] = useState(EMPTY_FIELDS);
    const [screenshots, setScreenshots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadsBusy, setUploadsBusy] = useState(false);
    // Whether the row was bare IN THE DB when loaded/created. Cleanup keys off
    // persisted state, not the local field snapshot: unsaved typing must not
    // preserve a phantom play day (codex review 2026-08-26).
    const loadedBareRef = useRef(false);
    // Synchronous mirror of `saving`: navigation handlers can fire inside the
    // same tick as submit, before the state update is visible (round 2).
    const savingRef = useRef(false);
    // Latest state mirror for the date-switch/back cleanup, which runs from
    // stale closures.
    const stateRef = useRef({ day: null, screenshots: [] });
    stateRef.current = { day, screenshots };

    // A bare row that stayed bare is junk from browsing dates — remove it.
    // deleteDayIfBare re-checks bareness in the DB, so a save that slipped in
    // anyway cannot be wiped by a stale local snapshot.
    const cleanupIfEmpty = useCallback(async () => {
        const s = stateRef.current;
        if (s.day && loadedBareRef.current && s.screenshots.length === 0) await deleteDayIfBare(s.day.id);
    }, []);

    const navBlocked = () => {
        if (savingRef.current) {
            toast.error('儲存中，請稍候');
            return true;
        }
        if (uploadsBusy) {
            toast.error('截圖上傳中，請等它跑完');
            return true;
        }
        return false;
    };

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const { data: existing, error } = await fetchDay(game.id, date);
                if (error) throw error;
                let row = existing;
                if (!row) {
                    // Spec §4.3: the row exists from the moment the form opens,
                    // so screenshot uploads have their day_id immediately.
                    const { data: created, error: createError } = await createBareDay(game.id, date);
                    if (createError) throw createError;
                    row = created;
                }
                if (cancelled) return;
                loadedBareRef.current = isDayEmpty(
                    {
                        temperature: row.temperature ?? null,
                        counter_value: row.counter_value ?? null,
                        progress_note: row.progress_note || '',
                        activities: row.activities || [],
                        one_line: row.one_line || '',
                    },
                    row.portfolio_game_screenshots || [],
                );
                setDay(row);
                setFields({
                    temperature: row.temperature ?? null,
                    counter_value: row.counter_value ?? null,
                    progress_note: row.progress_note || '',
                    activities: row.activities || [],
                    one_line: row.one_line || '',
                });
                setScreenshots(sortScreenshots(row.portfolio_game_screenshots));
            } catch (error) {
                console.error('DayForm load error:', error);
                if (!cancelled) toast.error('載入日記錄失敗');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [game.id, date]);

    const changeDate = async (newDate) => {
        if (newDate === date) return;
        if (navBlocked()) return;
        await cleanupIfEmpty();
        setDay(null);
        setFields(EMPTY_FIELDS);
        setScreenshots([]);
        setDate(newDate);
    };

    const handleBack = async () => {
        if (navBlocked()) return;
        await cleanupIfEmpty();
        onBack();
    };

    const set = (key) => (val) => setFields((prev) => ({ ...prev, [key]: val }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!day) return;
        if (uploadsBusy) {
            toast.error('截圖上傳中，請等它跑完再存');
            return;
        }
        savingRef.current = true;
        setSaving(true);
        try {
            const { error } = await updateDay(day.id, {
                temperature: fields.temperature,
                counter_value: fields.counter_value,
                progress_note: fields.progress_note.trim() || null,
                activities: fields.activities,
                one_line: fields.one_line.trim() || null,
            });
            if (error) throw error;
            toast.success('已存起來');
            onBack();
        } catch (error) {
            console.error('DayForm save error:', error);
            toast.error(error.message || '儲存失敗');
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-7 grow animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1 text-sm font-bold text-[#3f4a4e]/60 uppercase tracking-wider self-start"
            >
                <ChevronLeft size={18} /> {game.title}
            </button>

            <DatePicker label="補記日期（遊玩當日）" value={date} onChange={changeDate} />

            {loading ? (
                <div className="flex items-center justify-center py-16 text-[#3f4a4e]/50">
                    <Loader2 className="animate-spin" size={28} />
                </div>
            ) : (
                <>
                    <ScreenshotUploader
                        dayId={day?.id}
                        screenshots={screenshots}
                        onAdd={(row) => setScreenshots((prev) => sortScreenshots([...prev.filter((s) => s.id !== row.id), row]))}
                        onRemove={(id) => setScreenshots((prev) => prev.filter((s) => s.id !== id))}
                        onBusyChange={setUploadsBusy}
                    />

                    <div>
                        <Label>今天的溫度</Label>
                        <div className="mt-2">
                            <TemperaturePicker value={fields.temperature} onChange={set('temperature')} />
                        </div>
                    </div>

                    {game.counter_label && (
                        <div>
                            <Label>{game.counter_label}</Label>
                            <div className="mt-3">
                                <CounterStepper value={fields.counter_value} onChange={set('counter_value')} />
                            </div>
                        </div>
                    )}

                    <div>
                        <Label>進度短註</Label>
                        <input
                            type="text"
                            value={fields.progress_note}
                            onChange={(e) => set('progress_note')(e.target.value)}
                            placeholder="地名、Boss、章節、備註…"
                            className={commonInputStyles}
                        />
                    </div>

                    <TagPicker
                        label="做了什麼"
                        value={fields.activities}
                        options={game.activity_options || []}
                        onChange={set('activities')}
                    />

                    <FormInput
                        label="一句話（選填）"
                        name="one_line"
                        placeholder="不小心玩到兩點"
                        value={fields.one_line}
                        onChange={(e) => set('one_line')(e.target.value.slice(0, 120))}
                    />

                    <div className="grow" />
                    <SubmitButton loading={saving} text="存起來" />
                </>
            )}
        </form>
    );
}
