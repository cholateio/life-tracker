// components/ui/ImageUpload.jsx
'use client';

import { useState, useRef } from 'react';
import { ImagePlus, RefreshCw, Loader2 } from 'lucide-react';
import { Label } from './FormBase';

/**
 * Picks an image, cover-crops it to width x height via Canvas, re-encodes it as
 * JPEG, and hands the resulting File to onChange. Defaults to 720x1280 (9:16).
 */
export default function ImageUpload({ label = 'Photo Record', onChange, width = 720, height = 1280 }) {
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef(null);

    // 處理檔案選取與 Canvas 轉換
    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);

        // 1. 使用 FileReader 讀取本地端檔案
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                // Cover crop, not stretch: consumers render the stored file without
                // object-cover (portfolio ProjectItem uses only w-full), so the file's
                // own ratio drives their layout and any distortion ships to production.
                const scale = Math.max(width / img.width, height / img.height);
                const drawW = img.width * scale;
                const drawH = img.height * scale;
                ctx.drawImage(img, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);

                // 2. 將 Canvas 轉換為 JPEG 格式的 Blob (0.85 為壓縮品質，平衡畫質與檔案大小)
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            // 產生給畫面預覽用的暫時 URL
                            const newPreviewUrl = URL.createObjectURL(blob);
                            setPreviewUrl(newPreviewUrl);

                            // 將 Blob 包裝回 File 物件，確保副檔名與 MIME type 正確
                            // 以便後續能無縫放入 FormData 中送給 Next.js API
                            const processedFile = new File([blob], 'upload_image.jpg', {
                                type: 'image/jpeg',
                            });

                            // 將處理好的 File 傳回給父層 (頁面表單)
                            onChange(processedFile);
                        }
                        setIsProcessing(false);
                    },
                    'image/jpeg',
                    0.85,
                );
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };

    // 觸發隱藏的 input 點擊
    const triggerFileSelect = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    return (
        <div className="group flex flex-col items-center">
            <div className="w-full mb-2">
                <Label>{label}</Label>
            </div>

            {/* 隱藏的檔案輸入框，限制只能選取圖片 */}
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

            {/* 上傳與預覽區塊 - 針對手機版設計的大觸控目標 */}
            <div
                onClick={!isProcessing ? triggerFileSelect : undefined}
                /* Inline style, not a Tailwind class: aspect-[w/h] can't be composed from
                   runtime values — Tailwind extracts class names statically at build time. */
                style={{ aspectRatio: `${width} / ${height}` }}
                className={`relative ${
                    height > width ? 'w-48' : 'w-full max-w-sm'
                } rounded-2xl overflow-hidden border-2 border-dashed transition-all flex items-center justify-center cursor-pointer ${
                    previewUrl
                        ? 'border-[#3f4a4e]/20 shadow-xl shadow-[#3f4a4e]/10'
                        : 'border-[#3f4a4e]/40 hover:bg-[#3f4a4e]/5 active:scale-95'
                }`}
            >
                {/* 狀態 1: 正在處理圖片 */}
                {isProcessing && (
                    <div className="absolute inset-0 bg-[#E5E0DC]/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 text-[#3f4a4e]">
                        <Loader2 className="animate-spin mb-2" size={32} />
                        <span className="text-sm font-bold tracking-wider">PROCESSING</span>
                    </div>
                )}

                {/* 狀態 2: 顯示預覽圖 */}
                {previewUrl ? (
                    <>
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                        {/* 重新上傳的半透明覆蓋按鈕 */}
                        <div className="absolute inset-0 bg-[#3f4a4e]/0 hover:bg-[#3f4a4e]/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100 group-hover:opacity-100">
                            <div className="bg-[#E5E0DC]/90 text-[#3f4a4e] p-3 rounded-full shadow-lg flex items-center gap-2 font-bold text-sm">
                                <RefreshCw size={18} />
                                <span>REPLACE</span>
                            </div>
                        </div>
                    </>
                ) : (
                    /* 狀態 3: 尚未選擇圖片的空狀態 */
                    <div className="flex flex-col items-center justify-center text-[#3f4a4e]/50 p-4 text-center">
                        <ImagePlus size={48} strokeWidth={1.5} className="mb-4 text-[#3f4a4e]/40" />
                        <span className="font-bold text-sm uppercase tracking-widest">Tap to Upload</span>
                        <span className="text-xs mt-2 opacity-60">
                            {width} x {height} (JPG)
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
