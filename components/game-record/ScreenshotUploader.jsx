// components/game-record/ScreenshotUploader.jsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Loader2, RotateCw, X } from 'lucide-react';
import { Label } from '@/components/ui/FormBase';
import { getAccessToken, nextSeq } from '@/lib/games';

const MAX_CONCURRENT = 3;

// Batch uploader (spec §3.4): pick many, no per-image flow. Files go through a
// 3-wide queue to /api/screenshots; the server dedups by (day_id, hash) and
// derives the game itself from day_id. ensureDay() creates the day row on
// demand (single-flight in the parent) so browsing dates leaves no rows behind.
// onBusyChange tells the parent whether uploads are still in flight so it can
// block date-switch/back navigation.
export default function ScreenshotUploader({ ensureDay, screenshots, onAdd, onRemove, onBusyChange }) {
    const inputRef = useRef(null);
    // Pending/failed uploads only; finished ones live in the parent's list.
    const [items, setItems] = useState([]);
    const [deletingId, setDeletingId] = useState(null);
    const busyRef = useRef(0);
    const queueRef = useRef([]);

    const setItemStatus = (key, patch) =>
        setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

    const uploadOne = async (item) => {
        setItemStatus(item.key, { status: 'uploading' });
        try {
            const day = await ensureDay();
            const token = await getAccessToken();
            const formData = new FormData();
            formData.append('file', item.file);
            formData.append('day_id', day.id);
            formData.append('seq', String(item.seq));
            const res = await fetch('/api/screenshots', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token ?? ''}` },
                body: formData,
            });
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `HTTP ${res.status}`);
            const { screenshot } = await res.json();
            onAdd(screenshot);
            setItems((prev) => prev.filter((it) => it.key !== item.key));
        } catch (error) {
            console.error('Screenshot upload failed:', error);
            setItemStatus(item.key, { status: 'error' });
        }
    };

    const pump = () => {
        while (busyRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
            const item = queueRef.current.shift();
            busyRef.current += 1;
            uploadOne(item).finally(() => {
                busyRef.current -= 1;
                pump();
            });
        }
    };

    const enqueue = (newItems) => {
        queueRef.current.push(...newItems);
        pump();
    };

    const handleSelect = (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length === 0) return;
        // Filename order approximates the user's intended order within one pick.
        files.sort((a, b) => a.name.localeCompare(b.name));
        // Base spans committed rows AND still-listed items (pending, uploading,
        // error) so a second pick mid-batch continues the sequence instead of
        // reusing numbers an in-flight upload already claimed.
        const base = nextSeq([...screenshots, ...items]);
        const newItems = files.map((file, i) => ({
            key: `${Date.now()}-${i}-${file.name}`,
            file,
            seq: base + i,
            status: 'pending',
        }));
        // Report busy synchronously: the effect below only runs after render,
        // and the parent must block date-switch/back from this instant on.
        onBusyChange?.(true);
        setItems((prev) => [...prev, ...newItems]);
        enqueue(newItems);
    };

    const retry = (item) => {
        setItemStatus(item.key, { status: 'pending' });
        enqueue([{ ...item, status: 'pending' }]);
    };

    const handleDelete = async (shot) => {
        if (!window.confirm('刪除這張截圖？')) return;
        setDeletingId(shot.hash);
        try {
            const token = await getAccessToken();
            const res = await fetch(`/api/screenshots?day_id=${shot.day_id}&hash=${shot.hash}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token ?? ''}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            onRemove(shot.hash);
        } catch (error) {
            console.error('Screenshot delete failed:', error);
            toast.error('刪除失敗');
        } finally {
            setDeletingId(null);
        }
    };

    const uploadingCount = items.filter((it) => it.status !== 'error').length;
    const errorItems = items.filter((it) => it.status === 'error');
    const total = screenshots.length + items.length;

    useEffect(() => {
        onBusyChange?.(uploadingCount > 0);
    }, [uploadingCount, onBusyChange]);

    return (
        <div>
            <div className="flex items-baseline justify-between">
                <Label>截圖</Label>
                {uploadingCount > 0 && (
                    <span className="text-xs font-bold text-[#3f4a4e]/60">
                        上傳中 {screenshots.length}/{total}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-2">
                {screenshots.map((shot) => (
                    <div key={shot.hash} className="relative aspect-video rounded-lg overflow-hidden bg-[#3f4a4e]/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={shot.thumb_url} alt={shot.caption || ''} loading="lazy" className="w-full h-full object-cover" />
                        <button
                            type="button"
                            aria-label="刪除截圖"
                            disabled={deletingId === shot.hash}
                            onClick={() => handleDelete(shot)}
                            className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white active:scale-90"
                        >
                            {deletingId === shot.hash ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                        </button>
                    </div>
                ))}

                {items.map((item) => (
                    <div
                        key={item.key}
                        className="aspect-video rounded-lg bg-[#3f4a4e]/10 flex items-center justify-center"
                    >
                        {item.status === 'error' ? (
                            <button
                                type="button"
                                onClick={() => retry(item)}
                                className="flex flex-col items-center text-red-800/70 text-xs font-bold gap-1"
                            >
                                <RotateCw size={18} />
                                重試
                            </button>
                        ) : (
                            <Loader2 size={18} className="animate-spin text-[#3f4a4e]/40" />
                        )}
                    </div>
                ))}

                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="aspect-video rounded-lg border-2 border-dashed border-[#3f4a4e]/40 flex flex-col items-center justify-center text-[#3f4a4e]/50 active:scale-95 transition-all"
                >
                    <ImagePlus size={22} strokeWidth={1.5} />
                    <span className="text-xs font-bold mt-1">加截圖</span>
                </button>
            </div>

            {errorItems.length > 0 && (
                <p className="text-xs font-bold text-red-800/70 mt-2">{errorItems.length} 張上傳失敗，點縮圖重試</p>
            )}

            <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleSelect} className="hidden" />
        </div>
    );
}
