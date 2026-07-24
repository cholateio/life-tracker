// app/project-record/page.jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

import RecordPageLayout from '@/components/layout/RecordPageLayout';
import { FormInput } from '@/components/ui/FormInput';
import { FormTextarea } from '@/components/ui/FormTextarea';
import DatePicker from '@/components/ui/DatePicker';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import SubmitButton from '@/components/ui/SubmitButton';
import ImageUpload from '@/components/ui/ImageUpload';
import TagPicker from '@/components/ui/TagPicker';
import { useAuth } from '@/hooks/useAuth';

// portfolio's ProjectItem renders the thumbnail with only w-full — no object-cover,
// no fixed height — so the stored file's own ratio decides that card's grid height.
const THUMB_WIDTH = 1280;
const THUMB_HEIGHT = 720;

const slugify = (s) =>
    s
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

export default function ProjectRecordPage() {
    const { isAuthenticated, isChecking } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [stackOptions, setStackOptions] = useState([]);
    const [slugTouched, setSlugTouched] = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        slug: '',
        intro: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        stack: [],
        github: '',
        demo: '',
        featured: false,
        imageFile: null,
    });

    useEffect(() => {
        const loadStackOptions = async () => {
            const { data, error } = await supabase.from('portfolio_projects').select('stack');
            // Failure leaves options empty; custom tags still work, so don't block the form.
            if (error) return;
            const tags = [...new Set((data ?? []).flatMap((row) => row.stack ?? []))];
            setStackOptions(tags.sort((a, b) => a.localeCompare(b)));
        };
        loadStackOptions();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => {
            if (name === 'title' && !slugTouched) {
                return { ...prev, title: value, slug: slugify(value) };
            }
            return { ...prev, [name]: value };
        });
    };

    const handleSlugChange = (e) => {
        setSlugTouched(true);
        setFormData((prev) => ({ ...prev, slug: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const slug = formData.slug.trim();
            if (!slug) throw new Error('Slug 不可為空');

            // portfolio's getProjectBySlug uses .single(), and the column has no
            // unique constraint — a duplicate slug breaks that project's detail page.
            const { data: clash, error: clashError } = await supabase
                .from('portfolio_projects')
                .select('slug')
                .eq('slug', slug);
            if (clashError) throw clashError;
            if (clash.length > 0) throw new Error(`Slug「${slug}」已存在，請換一個`);

            let uploadedImageUrl = null;

            if (formData.imageFile) {
                toast.loading('Uploading image...', { id: 'upload-toast' });

                const apiData = new FormData();
                apiData.append('file', formData.imageFile);
                apiData.append('folder', 'projects');

                const {
                    data: { session },
                } = await supabase.auth.getSession();
                const uploadRes = await fetch('/api/upload', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
                    body: apiData,
                });

                if (!uploadRes.ok) {
                    throw new Error('圖片上傳失敗');
                }

                const result = await uploadRes.json();
                uploadedImageUrl = result.url;

                toast.dismiss('upload-toast');
            }

            const payload = {
                title: formData.title.trim(),
                slug,
                // Always an array: portfolio's detail page maps over stack with no null guard.
                stack: formData.stack,
                intro: formData.intro.trim() || null,
                description: formData.description.trim() || null,
                date: formData.date,
                thumbnail: uploadedImageUrl,
                github: formData.github.trim() || null,
                demo: formData.demo.trim() || null,
                featured: formData.featured,
            };

            const { error } = await supabase.from('portfolio_projects').insert([payload]);

            if (error) throw error;

            toast.success('專案紀錄已儲存！');
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
        <RecordPageLayout title="Project Record">
            <form onSubmit={handleSubmit} className="flex flex-col gap-8 grow">
                <ImageUpload
                    label="Project Thumbnail"
                    width={THUMB_WIDTH}
                    height={THUMB_HEIGHT}
                    onChange={(file) => setFormData((prev) => ({ ...prev, imageFile: file }))}
                />
                <FormInput
                    label="Title"
                    name="title"
                    placeholder="專案名稱 (如: Life Tracker)"
                    value={formData.title}
                    onChange={handleChange}
                    required
                />
                <FormInput
                    label="Slug"
                    name="slug"
                    placeholder="life-tracker"
                    value={formData.slug}
                    onChange={handleSlugChange}
                    required
                />
                <FormInput
                    label="Intro"
                    name="intro"
                    placeholder="卡片上的一句話介紹"
                    value={formData.intro}
                    onChange={handleChange}
                />
                <FormTextarea
                    label="Description"
                    name="description"
                    placeholder="詳情頁的說明段落"
                    rows={4}
                    value={formData.description}
                    onChange={handleChange}
                />
                <DatePicker
                    label="Date"
                    value={formData.date}
                    onChange={(val) => setFormData((prev) => ({ ...prev, date: val }))}
                />
                <TagPicker
                    label="Stack"
                    value={formData.stack}
                    options={stackOptions}
                    onChange={(tags) => setFormData((prev) => ({ ...prev, stack: tags }))}
                />
                <FormInput
                    label="GitHub"
                    name="github"
                    placeholder="https://github.com/... (可選)"
                    value={formData.github}
                    onChange={handleChange}
                />
                <FormInput
                    label="Demo"
                    name="demo"
                    placeholder="https://... (可選)"
                    value={formData.demo}
                    onChange={handleChange}
                />
                <ToggleSwitch
                    label="Featured"
                    checked={formData.featured}
                    onChange={(val) => setFormData((prev) => ({ ...prev, featured: val }))}
                />
                <div className="grow" />
                {isChecking ? (
                    <div className="h-15 flex items-center justify-center opacity-50">檢查權限中...</div>
                ) : isAuthenticated ? (
                    <SubmitButton loading={loading} text="UPLOAD" />
                ) : (
                    <div className="flex items-center justify-center bg-[#3f4a4e]/5 text-[#3f4a4e]/50 border-2 border-dashed border-[#3f4a4e]/20 p-4 rounded-2xl font-bold tracking-widest text-sm uppercase">
                        <span>Admin Login Required</span>
                    </div>
                )}
            </form>
        </RecordPageLayout>
    );
}
