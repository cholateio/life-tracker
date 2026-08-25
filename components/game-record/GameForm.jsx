// components/game-record/GameForm.jsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { X, Plus, Trash2, ChevronLeft } from 'lucide-react';

import { FormInput } from '@/components/ui/FormInput';
import { FormTextarea } from '@/components/ui/FormTextarea';
import DatePicker from '@/components/ui/DatePicker';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import SubmitButton from '@/components/ui/SubmitButton';
import ImageUpload from '@/components/ui/ImageUpload';
import { Label, commonInputStyles } from '@/components/ui/FormBase';
import { createGame, updateGame, deleteGame, getAccessToken, DEFAULT_ACTIVITY_OPTIONS } from '@/lib/games';

// Edits the option list itself (unlike TagPicker, which picks FROM a list).
function OptionChipsEditor({ value, onChange }) {
    const [draft, setDraft] = useState('');

    const add = () => {
        const raw = draft.trim();
        if (!raw) return;
        if (!value.includes(raw)) onChange([...value, raw]);
        setDraft('');
    };

    return (
        <div>
            <Label>做了什麼的選項</Label>
            <div className="flex flex-wrap gap-2 mt-2">
                {value.map((opt) => (
                    <span
                        key={opt}
                        className="pl-3 pr-1.5 py-1.5 rounded-full text-sm font-bold bg-[#3f4a4e] text-[#E5E0DC] flex items-center gap-1"
                    >
                        {opt}
                        <button
                            type="button"
                            aria-label={`移除 ${opt}`}
                            onClick={() => onChange(value.filter((o) => o !== opt))}
                            className="p-0.5 rounded-full hover:bg-[#E5E0DC]/20"
                        >
                            <X size={14} />
                        </button>
                    </span>
                ))}
            </div>
            <div className="flex items-center gap-3 mt-3">
                <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            add();
                        }
                    }}
                    placeholder="新增選項"
                    className={commonInputStyles}
                />
                <button
                    type="button"
                    onClick={add}
                    aria-label="新增選項"
                    className="shrink-0 p-2 rounded-full bg-[#3f4a4e]/10 text-[#3f4a4e] active:scale-95 transition-all"
                >
                    <Plus size={20} />
                </button>
            </div>
        </div>
    );
}

const detailsCls = 'border-2 border-dashed border-[#3f4a4e]/20 rounded-2xl px-4 py-3';
const summaryCls = 'text-sm font-bold text-[#3f4a4e]/60 uppercase tracking-wider cursor-pointer select-none';

export default function GameForm({ game, onDone, onCancel }) {
    const isEdit = !!game;
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({
        title: game?.title || '',
        platform: game?.platform || '',
        counter_label: game?.counter_label || '',
        activity_options: game?.activity_options?.length ? game.activity_options : DEFAULT_ACTIVITY_OPTIONS,
        slug: game?.slug || '',
        studio: game?.studio || '',
        release_date: game?.release_date || '',
        purchase_date: game?.purchase?.date || '',
        purchase_price: game?.purchase?.price ?? '',
        purchase_currency: game?.purchase?.currency || 'TWD',
        rating: game?.rating ?? '',
        total_hours: game?.total_hours ?? '',
        is_favorite: game?.is_favorite || false,
        final_note: game?.final_note || '',
        bm_where: game?.bookmark?.where || '',
        bm_next: game?.bookmark?.next_step || '',
        bm_controls: game?.bookmark?.controls_note || '',
        coverFile: null,
    });

    const set = (key) => (val) => setForm((prev) => ({ ...prev, [key]: val }));
    const setInput = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            let coverUrl = game?.cover_image || null;
            if (form.coverFile) {
                const apiData = new FormData();
                apiData.append('file', form.coverFile);
                apiData.append('folder', 'games-cover');
                const token = await getAccessToken();
                const res = await fetch('/api/upload', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token ?? ''}` },
                    body: apiData,
                });
                if (!res.ok) throw new Error('封面上傳失敗');
                coverUrl = (await res.json()).url;
            }

            const purchase =
                form.purchase_date || form.purchase_price
                    ? {
                          date: form.purchase_date || null,
                          price: form.purchase_price === '' ? null : Number(form.purchase_price),
                          currency: form.purchase_currency || 'TWD',
                      }
                    : null;
            const bookmark =
                form.bm_where || form.bm_next || form.bm_controls
                    ? {
                          saved_at: game?.bookmark?.saved_at || new Date().toISOString().split('T')[0],
                          where: form.bm_where || null,
                          next_step: form.bm_next || null,
                          controls_note: form.bm_controls || null,
                      }
                    : null;

            const payload = {
                title: form.title.trim(),
                platform: form.platform.trim() || null,
                counter_label: form.counter_label.trim() || null,
                activity_options: form.activity_options,
                studio: form.studio.trim() || null,
                release_date: form.release_date || null,
                cover_image: coverUrl,
                purchase,
                bookmark,
                rating: form.rating === '' ? null : parseInt(form.rating, 10),
                total_hours: form.total_hours === '' ? null : Number(form.total_hours),
                is_favorite: form.is_favorite,
                final_note: form.final_note.trim() || null,
            };

            const { data, error } = isEdit
                ? await updateGame(game.id, { ...payload, slug: form.slug.trim() || game.slug })
                : await createGame({ ...payload, slug: form.slug.trim() || undefined });
            if (error) throw error;

            toast.success(isEdit ? '遊戲已更新' : '遊戲已建立');
            onDone(data);
        } catch (error) {
            console.error('GameForm submit error:', error);
            toast.error(error.message || '儲存失敗');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(`確定刪除「${game.title}」？所有日記錄與截圖會一併刪除，無法復原。`)) return;
        setLoading(true);
        try {
            const { error } = await deleteGame(game.id);
            if (error) throw error;
            // DB rows cascade; this purges the GCS prefix.
            const token = await getAccessToken();
            const res = await fetch(`/api/screenshots?game_id=${game.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token ?? ''}` },
            });
            if (!res.ok) toast.warning('DB 已刪除，但 GCS 清理失敗（可稍後重試）');
            toast.success('遊戲已刪除');
            onDone(null);
        } catch (error) {
            console.error('GameForm delete error:', error);
            toast.error(error.message || '刪除失敗');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-7 grow animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button
                type="button"
                onClick={onCancel}
                className="flex items-center gap-1 text-sm font-bold text-[#3f4a4e]/60 uppercase tracking-wider self-start"
            >
                <ChevronLeft size={18} /> Back
            </button>

            <FormInput label="Title" name="title" placeholder="遊戲名稱" value={form.title} onChange={setInput} required />
            <FormInput
                label="Platform"
                name="platform"
                placeholder="PS5 / Steam / Switch…"
                value={form.platform}
                onChange={setInput}
            />
            <FormInput
                label="這款要數什麼？（可留空）"
                name="counter_label"
                placeholder="死了幾次 / 遊戲內第幾天 / 第幾章…"
                value={form.counter_label}
                onChange={setInput}
            />
            <OptionChipsEditor value={form.activity_options} onChange={set('activity_options')} />
            <ImageUpload label="封面（可跳過，之後自動用第一張截圖）" width={500} height={700} onChange={set('coverFile')} />

            <details className={detailsCls}>
                <summary className={summaryCls}>更多（studio / 日期 / 購買資訊 / slug）</summary>
                <div className="flex flex-col gap-6 pt-5">
                    <FormInput label="Studio" name="studio" value={form.studio} onChange={setInput} />
                    <DatePicker label="Release Date" value={form.release_date} onChange={set('release_date')} />
                    <DatePicker label="購入日期" value={form.purchase_date} onChange={set('purchase_date')} />
                    <div className="grid grid-cols-2 gap-6">
                        <FormInput
                            label="價格"
                            name="purchase_price"
                            type="number"
                            value={form.purchase_price}
                            onChange={setInput}
                        />
                        <FormInput
                            label="幣別"
                            name="purchase_currency"
                            value={form.purchase_currency}
                            onChange={setInput}
                        />
                    </div>
                    <FormInput label="Slug（網址用，留空自動產生）" name="slug" value={form.slug} onChange={setInput} />
                </div>
            </details>

            {isEdit && (
                <details className={detailsCls}>
                    <summary className={summaryCls}>評價與心得（隨時可填）</summary>
                    <div className="flex flex-col gap-6 pt-5">
                        <div className="grid grid-cols-2 gap-6">
                            <FormInput
                                label="Rating (1-10)"
                                name="rating"
                                type="number"
                                min="1"
                                max="10"
                                value={form.rating}
                                onChange={setInput}
                            />
                            <FormInput
                                label="總時數"
                                name="total_hours"
                                type="number"
                                value={form.total_hours}
                                onChange={setInput}
                            />
                        </div>
                        <ToggleSwitch label="Favorite" checked={form.is_favorite} onChange={set('is_favorite')} />
                        <FormTextarea
                            label="通關 / 棄坑心得"
                            name="final_note"
                            rows={6}
                            value={form.final_note}
                            onChange={setInput}
                        />
                    </div>
                </details>
            )}

            {isEdit && (
                <details className={detailsCls}>
                    <summary className={summaryCls}>暫停書籤（回坑用，隨時可填）</summary>
                    <div className="flex flex-col gap-6 pt-5">
                        <FormInput label="玩到哪、卡在哪" name="bm_where" value={form.bm_where} onChange={setInput} />
                        <FormInput label="下一步打算做什麼" name="bm_next" value={form.bm_next} onChange={setInput} />
                        <FormInput
                            label="操作提醒"
                            name="bm_controls"
                            placeholder="回坑最容易忘的東西"
                            value={form.bm_controls}
                            onChange={setInput}
                        />
                    </div>
                </details>
            )}

            <div className="grow" />
            <SubmitButton loading={loading} text={isEdit ? 'UPDATE' : 'CREATE'} />

            {isEdit && (
                <button
                    type="button"
                    onClick={handleDelete}
                    disabled={loading}
                    className="mb-8 -mt-4 flex items-center justify-center gap-2 text-sm font-bold text-red-800/70 uppercase tracking-wider py-3"
                >
                    <Trash2 size={16} /> 刪除這款遊戲
                </button>
            )}
        </form>
    );
}
