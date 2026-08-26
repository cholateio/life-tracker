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
import { fetchDay, createBareDay, updateDay, deleteDayIfDraft, sortScreenshots, yesterdayStr } from '@/lib/games';

const EMPTY_FIELDS = {
    temperature: null,
    counter_value: null,
    progress_note: '',
    activities: [],
    one_line: '',
};

export default function DayForm({ game, onBack }) {
    const [date, setDate] = useState(yesterdayStr());
    const [day, setDay] = useState(null);
    const [fields, setFields] = useState(EMPTY_FIELDS);
    const [screenshots, setScreenshots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadsBusy, setUploadsBusy] = useState(false);
    // Synchronous mirror of `saving`: navigation handlers can fire inside the
    // same tick as submit, before the state update is visible (round 2).
    const savingRef = useRef(false);
    // Latest state mirror for the date-switch/back cleanup, which runs from
    // stale closures.
    const stateRef = useRef({ day: null, screenshots: [] });
    stateRef.current = { day, screenshots };
    // Everything below is keyed by (game, date): an in-flight create from a
    // previous date must never be handed to the new one, nor overwrite its
    // state (codex review 2026-08-27).
    const dayKey = `${game.id}|${date}`;
    const keyRef = useRef(dayKey);
    keyRef.current = dayKey;
    // Single-flight guard: three parallel uploads must not each insert a row
    // for the same (game, date). Shape: { key, promise }.
    const ensureInFlightRef = useRef(null);
    // Keys we tried to create a row for. If the INSERT committed but its
    // response was lost, this is the only trace that a draft may exist.
    const attemptedKeysRef = useRef(new Set());

    // The day row is created lazily — only when a screenshot upload or a save
    // actually needs a day_id. Browsing dates therefore leaves nothing behind.
    const ensureDay = useCallback(async () => {
        const key = `${game.id}|${date}`;
        const current = stateRef.current.day;
        if (current && current.game_id === game.id && current.date === date) return current;
        if (ensureInFlightRef.current?.key === key) return ensureInFlightRef.current.promise;

        attemptedKeysRef.current.add(key);
        const adopt = (row) => {
            // Adopt into view state only if the form is still on this date.
            if (keyRef.current === key) {
                stateRef.current = { ...stateRef.current, day: row };
                setDay(row);
            }
            return row;
        };
        const promise = createBareDay(game.id, date)
            .then(async ({ data, error }) => {
                if (data) return adopt(data);
                // The INSERT may have committed with its response lost. Look
                // the row up and adopt it instead of leaving an orphan draft;
                // a still-failing lookup rethrows, and the caller's retry runs
                // this reconciliation again.
                const { data: found } = await fetchDay(game.id, date);
                if (found) return adopt(found);
                throw error || new Error('建立日記錄失敗');
            })
            .finally(() => {
                if (ensureInFlightRef.current?.key === key) ensureInFlightRef.current = null;
            });
        ensureInFlightRef.current = { key, promise };
        return promise;
    }, [game.id, date]);

    // Safety net for a row created for an upload that then failed: the DB
    // decides — deleteDayIfDraft only removes rows still flagged is_draft with
    // no screenshots, so deliberately saved zero-input days survive.
    const cleanupIfEmpty = useCallback(async () => {
        const s = stateRef.current;
        if (s.day && s.screenshots.length === 0) {
            await deleteDayIfDraft(s.day.id);
            return;
        }
        // No row in hand, but we did try to create one for this date: the
        // INSERT may have committed with its response lost, so look it up
        // instead of leaving an invisible draft behind.
        if (!s.day && attemptedKeysRef.current.has(keyRef.current)) {
            const [gameId, date] = keyRef.current.split('|');
            const { data } = await fetchDay(Number(gameId), date);
            if (data?.is_draft && (data.portfolio_game_screenshots || []).length === 0) {
                await deleteDayIfDraft(data.id);
            }
        }
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
                const { data: row, error } = await fetchDay(game.id, date);
                if (error) throw error;
                if (cancelled) return;
                // No row yet is the normal case for an unrecorded date; the
                // form renders empty and creates one only on first real action.
                setDay(row || null);
                setFields({
                    temperature: row?.temperature ?? null,
                    counter_value: row?.counter_value ?? null,
                    progress_note: row?.progress_note || '',
                    activities: row?.activities || [],
                    one_line: row?.one_line || '',
                });
                setScreenshots(sortScreenshots(row?.portfolio_game_screenshots));
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
        if (uploadsBusy) {
            toast.error('截圖上傳中，請等它跑完再存');
            return;
        }
        savingRef.current = true;
        setSaving(true);
        try {
            // Save is one of the two actions that earn a row (the other is the
            // first screenshot); zero-input is still a legal record.
            const row = await ensureDay();
            // is_draft: false makes the save durable — cleanup never touches
            // non-draft rows, so a deliberate zero-input record is kept.
            const { error } = await updateDay(row.id, {
                temperature: fields.temperature,
                counter_value: fields.counter_value,
                progress_note: fields.progress_note.trim() || null,
                activities: fields.activities,
                one_line: fields.one_line.trim() || null,
                is_draft: false,
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
                        ensureDay={ensureDay}
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
