// components/ui/SubmitButton.jsx
'use client';

import { Loader2, Save } from 'lucide-react';

export default function SubmitButton({ loading, text = 'SAVE RECORD' }) {
    return (
        <div className="pb-8 mt-4">
            <button
                type="submit"
                disabled={loading}
                // 處理 loading 狀態下的樣式變化與游標行為
                className="w-full bg-[#3f4a4e] text-[#E5E0DC] rounded-2xl py-5 font-bold text-xl shadow-xl shadow-[#3f4a4e]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
            >
                {loading ? (
                    <Loader2 className="animate-spin" size={24} />
                ) : (
                    <>
                        <Save size={22} strokeWidth={2.5} />
                        <span className="tracking-wide">{text}</span>
                    </>
                )}
            </button>
        </div>
    );
}
