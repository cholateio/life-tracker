// [TAG: CODE_SESSION_OPTIONAL]
// app/login/page.jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Lock } from 'lucide-react'; // 加上一個小 icon 增加質感

import { FormInput } from '@/components/ui/FormInput';
import SubmitButton from '@/components/ui/SubmitButton';

export default function LoginPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    // 集中管理表單狀態
    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleLogin = async (e) => {
        e.preventDefault();

        // 防呆：確保信箱與密碼都有輸入
        if (!formData.email || !formData.password) {
            toast.error('請輸入信箱與密碼');
            return;
        }

        setLoading(true);
        toast.loading('Authenticating...', { id: 'auth-toast' });

        try {
            // 呼叫 Supabase 進行信箱密碼登入
            // 登入成功後，Supabase client 會自動將 Session Token 存入瀏覽器的 LocalStorage
            const { data, error } = await supabase.auth.signInWithPassword({
                email: formData.email,
                password: formData.password,
            });

            if (error) throw error;

            toast.success('登入成功！系統權限已解鎖。');

            // 登入成功後導回首頁
            setTimeout(() => router.push('/'), 1000);
        } catch (error) {
            console.error('Login Error:', error);
            // 為了資安，通常不特別區分是帳號錯還是密碼錯
            toast.error('登入失敗，請檢查信箱與密碼是否正確。');
        } finally {
            toast.dismiss('auth-toast');
            setLoading(false);
        }
    };

    return (
        // 刻意不使用 RecordPageLayout，給登入頁一個獨立、置中的沉浸式版面
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#E5E0DC] p-6">
            <div className="w-full max-w-sm bg-[#FAF8F5] p-8 rounded-3xl shadow-2xl shadow-[#3f4a4e]/10 border border-[#3f4a4e]/5 animate-in fade-in zoom-in-95 duration-500">
                {/* 標題區塊 */}
                <div className="flex flex-col items-center mb-8">
                    <div className="bg-[#3f4a4e]/10 p-4 rounded-full mb-4">
                        <Lock size={32} className="text-[#3f4a4e]" />
                    </div>
                    <h1 className="text-2xl font-extrabold text-[#3f4a4e] tracking-wide">SYSTEM LOGIN</h1>
                    <p className="text-sm font-bold text-[#3f4a4e]/50 mt-2 uppercase tracking-widest">Admin Access Only</p>
                </div>

                {/* 登入表單 */}
                <form onSubmit={handleLogin} className="flex flex-col gap-6">
                    <FormInput
                        label="Email"
                        type="email"
                        name="email"
                        placeholder="admin@domain.com"
                        value={formData.email}
                        onChange={handleChange}
                        required
                    />

                    <FormInput
                        label="Password"
                        type="password"
                        name="password"
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={handleChange}
                        required
                    />

                    <div className="mt-4">
                        <SubmitButton loading={loading} text="AUTHENTICATE" />
                    </div>
                </form>
            </div>
        </div>
    );
}
