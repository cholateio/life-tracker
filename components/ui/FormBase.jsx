// components/ui/FormBase.jsx
'use client';

// 統一的標籤樣式元件
export const Label = ({ children }) => (
    <label className="text-xs font-black text-[#3f4a4e] opacity-60 uppercase tracking-widest mb-1 block">{children}</label>
);

// 統一的輸入框共用樣式 (Input, Textarea, Select, Date Picker 共用)
export const commonInputStyles =
    'w-full bg-transparent text-lg font-bold text-[#3f4a4e] border-b-2 border-[#3f4a4e]/20 focus:border-[#3f4a4e] outline-none transition-all py-2 placeholder:opacity-30';
