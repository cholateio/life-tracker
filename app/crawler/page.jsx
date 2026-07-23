'use client';

import { useState, useRef, useEffect } from 'react';
import { Loader2, ExternalLink, Trash2 } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { supabase } from '@/lib/supabase';

const THEME = {
    primary: '#00bba3',
    hover: '#00a38e',
    bg: '#ede6e1',
    text: '#2d3538',
};

// --- 滑動刪除組件 ---
const SwipeablePost = ({ children, onDelete }) => {
    const [startX, setStartX] = useState(null);
    const [offsetX, setOffsetX] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const elementRef = useRef(null);

    const handleTouchStart = (e) => {
        setStartX(e.touches[0].clientX);
    };

    const handleTouchMove = (e) => {
        if (startX === null) return;
        const currentX = e.touches[0].clientX;
        const diff = currentX - startX;

        // 限制只能向左滑 (diff < 0)
        if (diff < 0) {
            setOffsetX(diff);
        }
    };

    const handleTouchEnd = () => {
        // 滑動超過 200px 觸發刪除
        if (offsetX < -200) {
            setIsDeleting(true);
            setOffsetX(-500); // 滑出動畫
            setTimeout(onDelete, 300);
        } else {
            setOffsetX(0); // 回彈
        }
        setStartX(null);
    };

    if (isDeleting) return null;

    return (
        <div className="relative overflow-hidden mb-6">
            {/* 背景層 (紅色垃圾桶) */}
            <div
                className="absolute inset-0 rounded-lg flex items-center justify-end pr-6"
                style={{
                    backgroundColor: '#ffe4e6', // bg-rose-100
                    opacity: Math.min(Math.abs(offsetX) / 200, 1),
                }}
            >
                <Trash2 className="text-red-500" size={24} />
            </div>

            {/* 前景層 (文章內容) */}
            <div
                ref={elementRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="relative bg-[#ede6e1] transition-transform duration-200 ease-out rounded-lg"
                style={{
                    transform: `translateX(${offsetX}px)`,
                    transition: startX !== null ? 'none' : 'transform 0.3s ease-out',
                }}
            >
                {children}
            </div>
        </div>
    );
};

// --- 子組件: 看板區塊 ---
const BoardSection = ({ title, boards, onPostClick, onPostDelete }) => {
    if (!boards || boards.length === 0) return null;

    return (
        <div className="w-full mb-8">
            <h2 className="text-xl font-black text-[#2d3538] mb-4 flex items-center gap-2 border-b-4 border-[#00bba3]/20 pb-2">
                {title}
            </h2>

            {boards.map((board) => (
                <div key={board.name} className="mb-6 animate-in fade-in duration-500">
                    <div className="sticky top-0 z-10 bg-[#ede6e1]/95 backdrop-blur-sm py-2 mb-3 border-b border-white/20">
                        <div className="inline-flex items-center gap-1 bg-[#cbd7d6] text-[#2c3e3c] px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                            🏷️ {board.name}
                        </div>
                    </div>

                    <div className="flex flex-col">
                        {board.posts.length > 0 ? (
                            board.posts.map((post, index) => (
                                <SwipeablePost key={`${post.url}-${index}`} onDelete={() => onPostDelete(post.url)}>
                                    <div className="group pb-2">
                                        <div className="flex justify-between items-baseline gap-3">
                                            <a
                                                href={
                                                    post.url.startsWith('http')
                                                        ? post.url
                                                        : `https://forum.gamer.com.tw/${post.url}`
                                                }
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={() => onPostClick(post.url)}
                                                className={`text-[14px] font-bold transition-colors truncate min-w-0 flex-1 block ${
                                                    post.isRead
                                                        ? 'text-[#c2410c] hover:text-[#9a3412]'
                                                        : 'text-[#2d3538] group-hover:text-[#00bba3]'
                                                }`}
                                                title={post.title}
                                            >
                                                {post.title}
                                            </a>
                                            <span className="shrink-0 text-[12px] font-mono font-medium text-gray-400 whitespace-nowrap">
                                                {post.time}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-[12px] text-[#555] leading-relaxed line-clamp-2">{post.brief}</p>
                                    </div>
                                </SwipeablePost>
                            ))
                        ) : (
                            <p className="text-sm text-gray-400 italic py-2">無近期熱門文章</p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

// --- 主頁面組件 ---
export default function CrawlerPage() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);

    // 初始化：讀取靜態 JSON + Supabase 紀錄
    useEffect(() => {
        const initData = async () => {
            try {
                // 1. 讀取 GitHub Actions 生成的靜態資料
                const jsonRes = await fetch('/daily-news.json');
                if (!jsonRes.ok) {
                    // 如果檔案不存在 (例如第一次部署尚未執行 Actions)，給一個空資料或提示
                    console.warn('daily-news.json not found');
                    throw new Error('日報尚未生成，請稍後再試');
                }
                const jsonData = await jsonRes.json();

                // 2. 讀取 Supabase 的個人紀錄 (最近 3 天)
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 3);

                const { data: historyData, error } = await supabase
                    .from('life_bahamut')
                    .select('url, status')
                    .gte('created_at', thirtyDaysAgo.toISOString());

                if (error) console.error('Supabase fetch error:', error);

                const readSet = new Set();
                const deleteSet = new Set();

                if (historyData) {
                    historyData.forEach((row) => {
                        if (row.status === 'read') readSet.add(row.url);
                        if (row.status === 'deleted') deleteSet.add(row.url);
                    });
                }

                const processedBoards = jsonData.boards.map((board) => ({
                    ...board,
                    posts: board.posts
                        .filter((post) => !deleteSet.has(post.url))
                        .map((post) => ({
                            ...post,
                            isRead: readSet.has(post.url),
                        })),
                }));

                setData({
                    ...jsonData,
                    boards: processedBoards,
                });
            } catch (error) {
                console.error(error);
                toast.error('讀取資料失敗，請確認日報是否已生成');
            } finally {
                setLoading(false);
            }
        };

        initData();
    }, []);

    // 處理點擊 (已讀)
    const handlePostClick = async (url) => {
        if (!data) return;

        setData((prev) => ({
            ...prev,
            boards: prev.boards.map((board) => ({
                ...board,
                posts: board.posts.map((post) => (post.url === url ? { ...post, isRead: true } : post)),
            })),
        }));

        try {
            // supabase query builder 在 DB 錯誤(RLS/constraint)時 resolve 帶 error 而非 reject，
            // 不解構檢查 error 會讓失敗靜默通過，UI 已樂觀標為已讀但實際沒同步。
            const { error } = await supabase
                .from('life_bahamut')
                .upsert({ url, status: 'read', created_at: new Date().toISOString() }, { onConflict: 'url' });
            if (error) throw error;
        } catch (e) {
            console.error('Failed to mark read:', e);
            toast.error('標記已讀同步失敗，但已在本地更新');
        }
    };

    // 處理刪除 (隱藏)
    const handlePostDelete = async (url) => {
        if (!data) return;

        setData((prev) => ({
            ...prev,
            boards: prev.boards.map((board) => ({
                ...board,
                posts: board.posts.filter((post) => post.url !== url),
            })),
        }));

        toast.success('已隱藏文章');

        try {
            // 同 handlePostClick：需解構 error，否則 DB 層失敗被靜默吞掉。
            const { error } = await supabase
                .from('life_bahamut')
                .upsert({ url, status: 'deleted', created_at: new Date().toISOString() }, { onConflict: 'url' });
            if (error) throw error;
        } catch (e) {
            console.error('Failed to delete:', e);
            toast.error('同步失敗，但已在本地隱藏');
        }
    };

    return (
        <div
            className="min-h-screen flex flex-col items-center p-4 transition-colors duration-500 overflow-y-auto font-sans"
            style={{ backgroundColor: THEME.bg, overflowX: 'hidden' }}
        >
            <Toaster position="top-center" richColors />

            <div className="w-full max-w-xl mt-4 mb-8">
                {/* 靜態標題區塊 */}
                <div
                    className="w-full text-white rounded-xl py-3 font-bold text-base shadow-lg shadow-[#00bba3]/20 flex items-center justify-center gap-2"
                    style={{ backgroundColor: THEME.primary }}
                >
                    <span>📅 巴哈日報</span>
                </div>
            </div>

            {loading && (
                <div className="py-20 flex flex-col items-center text-gray-400 gap-2">
                    <Loader2 className="animate-spin" />
                    <span>載入今日快訊...</span>
                </div>
            )}

            {!loading && data && (
                <div className="w-full max-w-xl pb-20 animate-in slide-in-from-bottom-4 duration-500">
                    {/* 頭條區域 */}
                    {data.headlines.length > 0 && (
                        <div className="mb-8">
                            <h2 className="text-xl font-black text-[#2d3538] mb-4 border-b-4 border-[#00bba3]/20 pb-2">
                                🏠 首頁頭條
                            </h2>
                            <div className="bg-white/60 rounded-xl p-1 border border-white/50 shadow-sm">
                                {data.headlines.map((news, i) => (
                                    <a
                                        key={i}
                                        href={news.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 p-3 border-b border-gray-100 last:border-0 hover:bg-white/80 transition-colors rounded-lg group"
                                    >
                                        <ExternalLink
                                            size={14}
                                            className="text-[#00bba3] shrink-0 group-hover:scale-110 transition-transform"
                                        />
                                        <span className="text-[#2d3538] text-sm font-bold truncate">{news.title}</span>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 看板區域 */}
                    <BoardSection
                        title="📌 追蹤看板動態"
                        boards={data.boards}
                        onPostClick={handlePostClick}
                        onPostDelete={handlePostDelete}
                    />

                    <div className="text-center text-xs text-gray-400 mt-8 mb-4 font-mono">
                        Last Generated: {data.generatedAt}
                    </div>
                </div>
            )}
        </div>
    );
}
