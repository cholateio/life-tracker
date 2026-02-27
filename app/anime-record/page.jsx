// app/anime-record/page.jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

import RecordPageLayout from '@/components/layout/RecordPageLayout';
import { FormInput } from '@/components/ui/FormInput';
import DatePicker from '@/components/ui/DatePicker';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import SubmitButton from '@/components/ui/SubmitButton';
import ImageUpload from '@/components/ui/ImageUpload';

export default function AnimeRecordPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    // 集中管理表單狀態
    const [formData, setFormData] = useState({
        title: '',
        studio: '',
        date: new Date().toISOString().split('T')[0],
        rating: 5,
        favorite_ep: 1,
        favorite: false,
        thumbnail: null,
    });

    // 處理標準 Input / Textarea 的變更
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    // 處理資料庫提交
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            let uploadedImageUrl = null;

            // 如果有選擇圖片，先呼叫 API 上傳到 GCP
            if (formData.imageFile) {
                toast.loading('Uploading image...', { id: 'upload-toast' });

                // 準備要傳給 API 的 FormData
                const apiData = new FormData();
                apiData.append('file', formData.imageFile);
                apiData.append('folder', 'anime'); // 告訴 API 放進 milestone 資料夾

                const uploadRes = await fetch('/api/upload', {
                    method: 'POST',
                    body: apiData,
                });

                if (!uploadRes.ok) {
                    throw new Error('圖片上傳失敗');
                }

                // 取得回傳的 GCP 公開網址
                const result = await uploadRes.json();
                uploadedImageUrl = result.url;

                toast.dismiss('upload-toast');
            }
            // 組合最終 Payload，確保資料型態轉換正確 (ParseInt) 以符合 DB 欄位要求
            const payload = {
                title: formData.title,
                studio: formData.studio,
                first_date: formData.date,
                last_date: formData.date,
                view: 1, // 預設強制寫入 1
                rating: parseInt(formData.rating, 10),
                favorite_ep: parseInt(formData.favorite_ep, 10),
                favorite: formData.favorite,
                thumbnail: uploadedImageUrl,
            };

            const { error } = await supabase.from('Anime').insert([payload]);

            if (error) throw error;

            toast.success('動漫紀錄已儲存！');
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
        <RecordPageLayout title="Anime Record">
            <form onSubmit={handleSubmit} className="flex flex-col gap-8 grow">
                <ImageUpload label="Milestone Photo" onChange={(file) => setFormData((prev) => ({ ...prev, imageFile: file }))} />

                <FormInput
                    label="Title"
                    name="title"
                    placeholder="動畫名稱 (如: 葬送的芙莉蓮)"
                    value={formData.title}
                    onChange={handleChange}
                    required
                />

                <FormInput
                    label="Studio"
                    name="studio"
                    placeholder="製作公司 (可選)"
                    value={formData.studio}
                    onChange={handleChange}
                />

                <DatePicker
                    label="Watch Date"
                    value={formData.date}
                    onChange={(val) => setFormData((prev) => ({ ...prev, date: val }))}
                />

                {/* 排版：將評分與集數放在同一列 */}
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
                        label="Favorite EP"
                        type="number"
                        name="favorite_ep"
                        min="1"
                        value={formData.favorite_ep}
                        onChange={handleChange}
                        required
                    />
                </div>

                <ToggleSwitch
                    label="Add to Favorites"
                    checked={formData.favorite}
                    // ToggleSwitch 回傳 boolean
                    onChange={(val) => setFormData((prev) => ({ ...prev, favorite: val }))}
                />

                <div className="grow" />

                <SubmitButton loading={loading} text="SAVE RECORD" />
            </form>
        </RecordPageLayout>
    );
}
