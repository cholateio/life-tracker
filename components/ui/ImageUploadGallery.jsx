// components/ui/ImageUploadGallery.jsx
'use client';

import { useState, useRef } from 'react';
import { ImagePlus, RefreshCw, Loader2 } from 'lucide-react';
import { Label } from './FormBase';

export default function ImageUploadGallery({ label = 'Upload to Gallery', onChange }) {
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // 1. 判斷是否為橫圖
                const isLandscape = img.width > img.height;

                // 2. 決定最終輸出的寬高 (永遠保持 短邊 : 長邊)
                const targetWidth = isLandscape ? img.height : img.width;
                const targetHeight = isLandscape ? img.width : img.height;

                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');

                // 3. 處理繪製與智慧旋轉邏輯
                if (isLandscape) {
                    // 若為橫圖：將畫布原點平移至右上角，然後順時針旋轉 90 度
                    ctx.translate(targetWidth, 0);
                    ctx.rotate(Math.PI / 2);
                    ctx.drawImage(img, 0, 0);
                } else {
                    // 若已是直圖：直接繪製
                    ctx.drawImage(img, 0, 0);
                }

                // 4. 轉換為 JPEG 格式 (品質設為 0.9，保留畫廊所需的高畫質)
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            // 產生預覽網址
                            const newPreviewUrl = URL.createObjectURL(blob);
                            setPreviewUrl(newPreviewUrl);

                            // 將 Blob 包裝成 File
                            const processedFile = new File([blob], 'gallery_image.jpg', {
                                type: 'image/jpeg',
                            });

                            // 🌟 關鍵差異：將 File 與 Metadata 包裝成 Object 回傳
                            onChange({
                                file: processedFile,
                                width: targetWidth,
                                height: targetHeight,
                                file_size: blob.size,
                            });
                        }
                        setIsProcessing(false);
                    },
                    'image/jpeg',
                    0.9,
                );
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };

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

            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

            {/* 預覽區塊：因為畫廊圖片比例不一，這裡改用 object-contain 來確保完整顯示原圖預覽 */}
            <div
                onClick={!isProcessing ? triggerFileSelect : undefined}
                className={`relative w-48 aspect-3/4 rounded-2xl overflow-hidden border-2 border-dashed transition-all flex items-center justify-center cursor-pointer bg-[#3f4a4e]/5 ${
                    previewUrl
                        ? 'border-[#3f4a4e]/20 shadow-xl shadow-[#3f4a4e]/10'
                        : 'border-[#3f4a4e]/40 hover:bg-[#3f4a4e]/10 active:scale-95'
                }`}
            >
                {isProcessing && (
                    <div className="absolute inset-0 bg-[#E5E0DC]/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 text-[#3f4a4e]">
                        <Loader2 className="animate-spin mb-2" size={32} />
                        <span className="text-sm font-bold tracking-wider">PROCESSING</span>
                    </div>
                )}

                {previewUrl ? (
                    <>
                        <img src={previewUrl} alt="Gallery Preview" className="w-full h-full object-contain p-3 rounded-2xl" />
                        <div className="absolute inset-0 bg-[#3f4a4e]/0 hover:bg-[#3f4a4e]/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100 group-hover:opacity-100">
                            <div className="bg-[#E5E0DC]/90 text-[#3f4a4e] p-3 rounded-full shadow-lg flex items-center gap-2 font-bold text-sm">
                                <RefreshCw size={18} />
                                <span>REPLACE</span>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center text-[#3f4a4e]/50 p-4 text-center">
                        <ImagePlus size={48} strokeWidth={1.5} className="mb-4 text-[#3f4a4e]/40" />
                        <span className="font-bold text-sm uppercase tracking-widest">Select Image</span>
                        <span className="text-xs mt-2 opacity-60">Auto Portrait (JPG)</span>
                    </div>
                )}
            </div>
        </div>
    );
}
