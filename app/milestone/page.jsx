// app/milestone-record/page.jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

import RecordPageLayout from '@/components/layout/RecordPageLayout';
import { FormInput } from '@/components/ui/FormInput';
import { FormTextarea } from '@/components/ui/FormTextarea';
import DropdownSelect from '@/components/ui/DropdownSelect';
import DatePicker from '@/components/ui/DatePicker';
import SubmitButton from '@/components/ui/SubmitButton';
import ImageUpload from '@/components/ui/ImageUpload';

const GENRE_OPTIONS = [
    { value: 'major', label: 'Major (重大突破)' },
    { value: 'minor', label: 'Minor (小成就)' },
    { value: 'growth', label: 'Growth (個人成長)' },
];

export default function MilestoneRecordPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    // 集中管理表單狀態
    const [formData, setFormData] = useState({
        title: '',
        genre: 'major',
        date: new Date().toISOString().split('T')[0],
        place: '',
        description: '',
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
            // 組合最終 Payload，確保資料型態轉換正確 (ParseInt) 以符合 DB 欄位要求
            const payload = {
                title: formData.title,
                genre: formData.genre,
                date: formData.date,
                place: formData.place,
                description: formData.description,
            };

            const { error } = await supabase.from('Milestone').insert([payload]);

            if (error) throw error;

            toast.success('里程碑紀錄已儲存！');
            setTimeout(() => router.push('/'), 1500);
        } catch (error) {
            console.error('Insert error:', error);
            toast.error('儲存失敗，請檢查資料庫設定或稍後再試。');
        } finally {
            setLoading(false);
        }
    };

    return (
        <RecordPageLayout title="Milestone">
            <form onSubmit={handleSubmit} className="flex flex-col gap-8 grow">
                {/* 使用抽離的元件，傳遞 state 與 setter */}
                <FormInput
                    label="Title"
                    name="title"
                    placeholder="里程碑名稱 (如: 第一次跑完半馬)"
                    value={formData.title}
                    onChange={handleChange}
                    required
                />

                <DropdownSelect
                    label="Genre"
                    options={GENRE_OPTIONS}
                    value={formData.genre}
                    // 自定義元件直接回傳 value，不需要 e.target
                    onChange={(val) => setFormData((prev) => ({ ...prev, genre: val }))}
                />

                <DatePicker
                    label="Date"
                    value={formData.date}
                    // DatePicker 會回傳格式化後的字串 (YYYY-MM-DD)
                    onChange={(val) => setFormData((prev) => ({ ...prev, date: val }))}
                />

                <FormInput
                    label="Place"
                    name="place"
                    placeholder="發生地點 (如: 台北市)"
                    value={formData.place}
                    onChange={handleChange}
                />

                <FormTextarea
                    label="Description"
                    name="description"
                    placeholder="寫下這個里程碑的心得或細節..."
                    value={formData.description}
                    onChange={handleChange}
                    rows={3}
                />

                {/* 佔位符，將按鈕推至底部 */}
                <div className="grow" />

                <SubmitButton loading={loading} text="SAVE MILESTONE" />
            </form>
        </RecordPageLayout>
    );
}
