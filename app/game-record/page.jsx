// [TAG: CODE_SESSION_OPTIONAL]
// app/game-record/page.jsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, Plus, Edit3 } from 'lucide-react'; // 引入額外的 Icons

import RecordPageLayout from '@/components/layout/RecordPageLayout';
import { FormInput } from '@/components/ui/FormInput';
import { FormTextarea } from '@/components/ui/FormTextarea';
import DatePicker from '@/components/ui/DatePicker';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import SubmitButton from '@/components/ui/SubmitButton';
import ImageUpload from '@/components/ui/ImageUpload';

// 定義表單的預設空狀態，方便在「新建紀錄」時重置
const DEFAULT_FORM_DATA = {
    title: '',
    slug: '',
    studio: '',
    release_date: new Date().toISOString().split('T')[0],
    last_date: new Date().toISOString().split('T')[0],
    total_time: '',
    rating: 5,
    favorite: false,
    journal: '',
    thumbnail: null,
    imageFile: null,
};

export default function GameRecordPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [initialFetching, setInitialFetching] = useState(true);

    // --- 新增的視圖與資料狀態 ---
    const [viewMode, setViewMode] = useState('select'); // 'select' | 'form'
    const [recentGames, setRecentGames] = useState([]);
    const [editingId, setEditingId] = useState(null); // 記錄當前編輯的 ID，若為 null 則是新建

    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);

    // 1. 初次載入時抓取最近 3 筆紀錄
    useEffect(() => {
        const fetchRecentGames = async () => {
            try {
                // 抓取 Game table 最新 3 筆資料 (依建立時間或更新時間排序)
                const { data, error } = await supabase
                    .from('Games')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(3);

                if (error) throw error;
                setRecentGames(data || []);
            } catch (error) {
                console.error('Fetch recent games error:', error);
                toast.error('無法載入近期紀錄');
            } finally {
                setInitialFetching(false);
            }
        };

        fetchRecentGames();
    }, []);

    // 2. 進入新建模式
    const handleCreateNew = () => {
        setFormData(DEFAULT_FORM_DATA);
        setEditingId(null);
        setViewMode('form');
    };

    // 3. 進入編輯模式並帶入舊資料
    const handleEditExisting = (game) => {
        setFormData({
            title: game.title || '',
            slug: game.slug || '',
            studio: game.studio || '',
            release_date: game.release_date || DEFAULT_FORM_DATA.release_date,
            last_date: game.last_date || DEFAULT_FORM_DATA.last_date,
            total_time: game.total_time || '',
            rating: game.rating || 5,
            favorite: game.favorite || false,
            journal: game.journal || '',
            thumbnail: game.thumbnail || null,
            imageFile: null, // 清空本機圖片暫存
        });
        setEditingId(game.id); // 標記為編輯狀態
        setViewMode('form');
    };

    // 處理標準 Input / Textarea 的變更
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    // 4. 處理資料庫提交 (Insert 或 Update)
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // 預設使用原本的 thumbnail 網址 (如果是編輯舊資料且沒換圖片的話)
            let finalImageUrl = formData.thumbnail;

            // 若使用者有選取"新"圖片，則上傳至 GCP 並覆蓋網址
            if (formData.imageFile) {
                toast.loading('Uploading image...', { id: 'upload-toast' });

                const apiData = new FormData();
                apiData.append('file', formData.imageFile);
                apiData.append('folder', 'games');

                const uploadRes = await fetch('/api/upload', {
                    method: 'POST',
                    body: apiData,
                });

                if (!uploadRes.ok) throw new Error('圖片上傳失敗');

                const result = await uploadRes.json();
                finalImageUrl = result.url; // 更新為新網址
                toast.dismiss('upload-toast');
            }

            // 組合最終 Payload
            const payload = {
                title: formData.title,
                slug: formData.slug,
                studio: formData.studio,
                release_date: formData.release_date,
                last_date: formData.last_date,
                total_time: formData.total_time,
                rating: parseInt(formData.rating, 10),
                favorite: formData.favorite,
                journal: formData.journal,
                thumbnail: finalImageUrl,
            };

            // 根據 editingId 決定是更新還是新增
            let dbError;
            if (editingId) {
                const { error } = await supabase.from('Games').update(payload).eq('id', editingId);
                dbError = error;
            } else {
                const { error } = await supabase.from('Games').insert([payload]);
                dbError = error;
            }

            if (dbError) throw dbError;

            toast.success(editingId ? '遊戲紀錄已更新！' : '遊戲紀錄已儲存！');
            setTimeout(() => router.push('/'), 1500);
        } catch (error) {
            console.error('Submit error:', error);
            toast.dismiss('upload-toast');
            toast.error(error.message || '儲存失敗，請稍後再試。');
        } finally {
            setLoading(false);
        }
    };

    return (
        <RecordPageLayout title={viewMode === 'select' ? 'Select Record' : editingId ? 'Edit Game' : 'New Game'}>
            {/* 視圖 A：載入中 */}
            {initialFetching ? (
                <div className="flex flex-col items-center justify-center grow text-[#3f4a4e]/60">
                    <Loader2 className="animate-spin mb-4" size={32} />
                    <span className="font-bold tracking-widest text-sm uppercase">Loading Records...</span>
                </div>
            ) : viewMode === 'select' ? (
                /* 視圖 B：前置選擇清單 */
                <div className="flex flex-col gap-4 grow">
                    <p className="text-sm font-bold text-[#3f4a4e]/60 uppercase tracking-wider mb-2">Recent Games</p>

                    {recentGames.length === 0 ? (
                        <div className="text-center py-8 text-[#3f4a4e]/40 font-bold">尚無近期紀錄</div>
                    ) : (
                        recentGames.map((game) => (
                            <button
                                key={game.id}
                                onClick={() => handleEditExisting(game)}
                                className="w-full bg-transparent border-2 border-[#3f4a4e] text-[#3f4a4e] rounded-2xl py-5 font-bold text-lg active:scale-[0.98] transition-all gap-3"
                            >
                                <div className="flex flex-col gap-1 overflow-hidden">
                                    <span className="font-extrabold text-[#3f4a4e] text-lg truncate">{game.title}</span>
                                    <span className="text-xs font-bold text-[#3f4a4e]/50">Last played: {game.last_date}</span>
                                </div>
                            </button>
                        ))
                    )}

                    <div className="my-4 border-b-2 border-[#3f4a4e]/10 border-dashed" />

                    <button
                        onClick={handleCreateNew}
                        className="w-full bg-transparent border-2 border-[#3f4a4e] text-[#3f4a4e] rounded-2xl py-5 font-bold text-lg active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                    >
                        <Plus size={22} strokeWidth={2.5} />
                        <span className="tracking-wide uppercase">Create New Record</span>
                    </button>
                </div>
            ) : (
                /* 視圖 C：主要表單 */
                <form
                    onSubmit={handleSubmit}
                    className="flex flex-col gap-8 grow animate-in fade-in slide-in-from-bottom-4 duration-500"
                >
                    {!editingId && (
                        <>
                            <ImageUpload
                                label="Game Photo"
                                // 如果有舊圖片網址且還沒選新檔案，可以考慮在 ImageUpload 內支援預設網址預覽 (視需求擴充)
                                onChange={(file) => setFormData((prev) => ({ ...prev, imageFile: file }))}
                            />

                            <FormInput
                                label="Title"
                                name="title"
                                placeholder="遊戲名稱"
                                value={formData.title}
                                onChange={handleChange}
                                required
                            />

                            <div className="grid grid-cols-2 gap-6">
                                <FormInput label="Slug" name="slug" value={formData.slug} onChange={handleChange} />
                                <FormInput label="Studio" name="studio" value={formData.studio} onChange={handleChange} />
                            </div>
                        </>
                    )}

                    {/* 👇 根據模式調整日期的排版 */}
                    {!editingId ? (
                        <div className="grid grid-cols-2 gap-6">
                            <DatePicker
                                label="Release Date"
                                value={formData.release_date}
                                onChange={(val) => setFormData((prev) => ({ ...prev, release_date: val }))}
                            />
                            <DatePicker
                                label="Last Date"
                                value={formData.last_date}
                                onChange={(val) => setFormData((prev) => ({ ...prev, last_date: val }))}
                            />
                        </div>
                    ) : (
                        <DatePicker
                            label="Last Played Date"
                            value={formData.last_date}
                            onChange={(val) => setFormData((prev) => ({ ...prev, last_date: val }))}
                        />
                    )}

                    <div className="grid grid-cols-2 gap-6">
                        <FormInput
                            label="Rating (1-10)"
                            type="number"
                            name="rating"
                            min="1"
                            max="10"
                            value={formData.rating}
                            onChange={handleChange}
                            required
                        />
                        <FormInput
                            label="Total Time"
                            type="number"
                            name="total_time"
                            value={formData.total_time}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <ToggleSwitch
                        label="Add to Favorites"
                        checked={formData.favorite}
                        onChange={(val) => setFormData((prev) => ({ ...prev, favorite: val }))}
                    />

                    <FormTextarea
                        label="Journal"
                        name="journal"
                        placeholder={`💰 2026-03-05 | Steam 購入 (NT$398)\n\n--- 日誌 ---\n📅 2026-03-06\n- [進度] ...\n- [心得] ...\n\n--- 總評 ---\n這款遊戲...`}
                        value={formData.journal}
                        onChange={handleChange}
                        rows={editingId ? 14 : 3}
                    />

                    <div className="grow" />

                    <SubmitButton loading={loading} text={editingId ? 'UPDATE RECORD' : 'SAVE RECORD'} />
                </form>
            )}
        </RecordPageLayout>
    );
}
