// components/layout/RecordPageLayout.jsx
'use client';

import { Toaster } from 'sonner';

/**
 * 紀錄頁面的共用 Layout 容器
 * 處理全域背景、Toast 通知機制、統一的返回 Header 與排版結構。
 * @param {string} title - 顯示於 Header 的頁面標題
 * @param {React.ReactNode} children - 內部表單或內容區塊
 */
export default function RecordPageLayout({ title = 'Record', children }) {
    return (
        // 外層容器：滿版高度、主背景色、彈性佈局
        <div className="min-h-screen p-6 flex flex-col" style={{ backgroundColor: '#E5E0DC' }}>
            {/* 全域通知元件：統一設定位置與豐富色彩主題 */}
            <Toaster position="top-center" richColors />

            {/* 共用 Header：包含返回按鈕與標題 */}
            <header className="flex items-center mb-8 mt-2">
                <h1 className="text-2xl font-extrabold tracking-wide text-[#3f4a4e]">{title}</h1>
            </header>

            {/* 主要內容區塊：使用 grow 讓內容自動撐開剩餘空間 */}
            <main className="flex flex-col grow">{children}</main>
        </div>
    );
}
