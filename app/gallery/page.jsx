// [TAG: CODE_SESSION_OPTIONAL]
// app/gallery-upload/page.jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

import RecordPageLayout from '@/components/layout/RecordPageLayout';
import { FormInput } from '@/components/ui/FormInput';
import SubmitButton from '@/components/ui/SubmitButton';
import ImageUploadGallery from '@/components/ui/ImageUploadGallery';
import { useAuth } from '@/hooks/useAuth';
import { Lock } from 'lucide-react';

export default function GalleryUploadPage() {
    const { isAuthenticated, isChecking } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    // 儲存文字輸入的表單狀態
    const [formData, setFormData] = useState({
        tags: '',
        source: '',
    });

    // 儲存從 ImageUploadGallery 傳回來的檔案與 Metadata 物件
    // 包含: { file, width, height, file_size }
    const [imageMeta, setImageMeta] = useState(null);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // 防呆：確保使用者有選取圖片
        if (!imageMeta || !imageMeta.file) {
            toast.error('請先選擇並處理一張圖片！');
            return;
        }

        setLoading(true);

        try {
            toast.loading('Uploading image to GCP...', { id: 'upload-toast' });

            // 🌟 1. 準備上傳到 GCP
            const apiData = new FormData();
            apiData.append('file', imageMeta.file);
            apiData.append('bucketType', 'gallery');

            const uploadRes = await fetch('/api/upload', {
                method: 'POST',
                body: apiData,
            });

            if (!uploadRes.ok) throw new Error('圖片上傳 GCP 失敗');

            const result = await uploadRes.json();
            const gcsUrl = result.url; // 拿到的網址會長這樣：https://.../cholate-gallery/gallery/a7de...34d0a8.jpg

            // 🌟 2. 巧妙萃取 Hash (從網址擷取)
            // split('/') 取得最後一段 "a7de...34d0a8.jpg"
            // split('.') 取得第一個元素，也就是 Hash 本體
            const fileName = gcsUrl.split('/').pop();
            const hash = fileName.split('.')[0];

            toast.dismiss('upload-toast');
            toast.loading('Saving Metadata to Supabase...', { id: 'db-toast' });

            const formattedTags = formData.tags
                .split(',') // 1. 用逗號將字串切成陣列
                .map((tag) => tag.trim()) // 2. 把每個標籤前後的空白濾掉 (例如 " a " 變成 "a")
                .filter((tag) => tag.length > 0); // 3. 濾掉空字串 (防止使用者多打了一個逗號結尾)

            // 🌟 3. 組合要寫入 Supabase Gallery 資料表的 Payload
            const payload = {
                hash: hash,
                tags: formattedTags,
                width: imageMeta.width,
                height: imageMeta.height,
                file_size: imageMeta.file_size,
                gcs_url: gcsUrl,
                source: formData.source,
            };

            // 🌟 4. 寫入 Supabase
            const { error } = await supabase.from('Gallery').insert([payload]);

            if (error) {
                // 如果 hash 被設定為 Unique (唯一鍵)，抓取重複上傳的錯誤
                if (error.code === '23505') {
                    throw new Error('這張圖片已經存在於畫廊中了！(Hash 重複)');
                }
                throw error;
            }

            toast.success('畫廊圖片上傳成功！');
            setTimeout(() => router.push('/'), 1500);
        } catch (error) {
            console.error('Gallery upload error:', error);
            toast.error(error.message || '儲存失敗，請稍後再試。');
        } finally {
            toast.dismiss('upload-toast');
            toast.dismiss('db-toast');
            setLoading(false);
        }
    };

    return (
        <RecordPageLayout title="Upload to Gallery">
            <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-8 grow animate-in fade-in slide-in-from-bottom-4 duration-500"
            >
                {/* 接收 ImageUploadGallery 回傳的物件 */}
                <ImageUploadGallery label="Select Artwork" onChange={(meta) => setImageMeta(meta)} />
                <FormInput
                    label="Tags (標籤)"
                    name="tags"
                    placeholder="例如: 原創, 風景, 二次元 (用逗號分隔)"
                    value={formData.tags}
                    onChange={handleChange}
                    required
                />
                <FormInput
                    label="Source (來源)"
                    name="source"
                    placeholder="例如: Pixiv, Twitter, 或網址"
                    value={formData.source}
                    onChange={handleChange}
                />
                {/* 自動擷取的 Metadata 資訊展示 (讓使用者確認解析度與大小) */}
                {imageMeta && (
                    <div className="bg-[#3f4a4e]/5 p-4 rounded-xl flex flex-col gap-1.5 border border-[#3f4a4e]/10">
                        <span className="text-[10px] font-black text-[#3f4a4e] opacity-60 uppercase tracking-widest">
                            Image Metadata
                        </span>
                        <div className="flex justify-between text-sm font-bold text-[#3f4a4e]">
                            <span>Dimensions</span>
                            <span>
                                {imageMeta.width} x {imageMeta.height} px
                            </span>
                        </div>
                        <div className="flex justify-between text-sm font-bold text-[#3f4a4e]">
                            <span>File Size</span>
                            <span>{(imageMeta.file_size / 1024).toFixed(2)} KB</span>
                        </div>
                    </div>
                )}
                <div className="grow" />
                {/* 🌟 權限控制區塊 */}
                {isChecking ? (
                    <div className="h-15 flex items-center justify-center opacity-50">檢查權限中...</div>
                ) : isAuthenticated ? (
                    <SubmitButton loading={loading} text="UPLOAD" />
                ) : (
                    <div className="flex items-center justify-center bg-[#3f4a4e]/5 text-[#3f4a4e]/50 border-2 border-dashed border-[#3f4a4e]/20 p-4 rounded-2xl font-bold tracking-widest text-sm uppercase">
                        <span>Admin Login Required</span>
                    </div>
                )}{' '}
            </form>
        </RecordPageLayout>
    );
}
