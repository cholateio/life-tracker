'use client';

import { useState, useRef } from 'react';
import { RefreshCw, Loader2, Link as LinkIcon, ExternalLink, Trash2 } from 'lucide-react';
import { Toaster, toast } from 'sonner';

// --- 型別與常數 ---
interface Post {
    title: string;
    url: string;
    time: string;
    brief: string;
    isRead?: boolean;
}

interface BoardData {
    name: string;
    posts: Post[];
}

interface CrawlerResult {
    headlines: { title: string; url: string }[];
    boards: BoardData[];
    generatedAt: string;
}

const THEME = {
    primary: '#00bba3',
    hover: '#00a38e',
    bg: '#ede6e1',
    text: '#2d3538',
};

// --- [新增] 滑動刪除組件 ---
const SwipeablePost = ({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) => {
    const [startX, setStartX] = useState<number | null>(null);
    const [offsetX, setOffsetX] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const elementRef = useRef<HTMLDivElement>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        setStartX(e.touches[0].clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (startX === null) return;
        const currentX = e.touches[0].clientX;
        const diff = currentX - startX;

        // 限制只能向左滑 (diff < 0)，且不超過螢幕太多
        if (diff < 0) {
            setOffsetX(diff);
        }
    };

    const handleTouchEnd = () => {
        // [修改 1] 提高刪除門檻：從 -100 改為 -200，需要滑動更遠才會觸發
        if (offsetX < -400) {
            setIsDeleting(true);
            setOffsetX(-500); // 滑出螢幕的動畫
            setTimeout(onDelete, 300); // 等待動畫結束後呼叫刪除函數
        } else {
            setOffsetX(0); // 未達門檻，回彈至原位
        }
        setStartX(null);
    };

    if (isDeleting) return null; // 刪除後不渲染 (實際上會由父層的狀態更新來移除)

    return (
        <div className="relative overflow-hidden mb-6">
            {/* [修改 2] 背景層樣式調整 */}
            <div
                className="absolute inset-0 rounded-lg flex items-center justify-end pr-6" // 將 bg-red-500 改為更柔和的 bg-rose-100
                style={{
                    // 根據滑動距離動態調整透明度，讓提示效果更平滑
                    opacity: Math.min(Math.abs(offsetX) / 200, 1),
                }}
            >
                <Trash2 className="text-red-500" size={24} /> {/* 垃圾桶圖示維持紅色，以示警示 */}
            </div>

            {/* 前景層 (文章內容) */}
            <div
                ref={elementRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="relative bg-[#ede6e1] transition-transform duration-200 ease-out rounded-lg" // 增加 rounded-lg 讓前景與背景的圓角一致
                style={{
                    transform: `translateX(${offsetX}px)`,
                    // 拖曳時不延遲 (none)，放手回彈時有過渡動畫 (transform 0.3s ease-out)
                    transition: startX !== null ? 'none' : 'transform 0.3s ease-out',
                }}
            >
                {children}
            </div>
        </div>
    );
};
// --- 子組件 ---
const BoardSection = ({
    title,
    boards,
    onPostClick,
    onPostDelete, // [新增]
}: {
    title: string;
    boards: BoardData[];
    onPostClick: (url: string) => void;
    onPostDelete: (url: string) => void; // [新增]
}) => {
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
                                // [修改] 包裹 SwipeablePost
                                <SwipeablePost key={`${post.url}-${index}`} onDelete={() => onPostDelete(post.url)}>
                                    <div className="group pb-2">
                                        {' '}
                                        {/* 增加 pb-2 讓滑動手勢好操作一點 */}
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
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<CrawlerResult | null>(null);

    // 處理點擊 (已讀)
    const handlePostClick = async (url: string) => {
        if (!data) return;

        const newData = { ...data };
        let found = false;

        newData.boards = newData.boards.map((board) => ({
            ...board,
            posts: board.posts.map((post) => {
                if (post.url === url) {
                    found = true;
                    return { ...post, isRead: true };
                }
                return post;
            }),
        }));

        if (found) setData(newData);

        try {
            await fetch('/api/crawl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, action: 'read' }), // [修改] 加入 action
            });
        } catch (e) {
            console.error('Failed to mark as read', e);
        }
    };

    // [新增] 處理刪除
    const handlePostDelete = async (url: string) => {
        if (!data) return;

        // 1. 樂觀更新：直接從 UI 移除
        const newData = {
            ...data,
            boards: data.boards.map((board) => ({
                ...board,
                posts: board.posts.filter((post) => post.url !== url),
            })),
        };

        setData(newData);
        toast.success('已隱藏文章');

        // 2. 背景 API 請求
        try {
            await fetch('/api/crawl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, action: 'delete' }), // 指定 action: delete
            });
        } catch (e) {
            console.error('Failed to delete post', e);
            toast.error('隱藏失敗');
        }
    };

    const handleCrawl = async () => {
        setLoading(true);
        const toastId = toast.loading('正在爬取巴哈姆特資料...');

        try {
            const res = await fetch('/api/crawl');
            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Unknown Error');

            setData(json.data as CrawlerResult);
            toast.success('更新完成', { id: toastId });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '爬取失敗，請稍後再試';
            console.error(error);
            toast.error(errorMessage, { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen flex flex-col items-center p-4 transition-colors duration-500 overflow-y-auto font-sans"
            style={{ backgroundColor: THEME.bg, overflowX: 'hidden' }} // 增加 overflowX: hidden 避免滑動時頁面晃動
        >
            <Toaster position="top-center" richColors />

            <div className="w-full max-w-xl mt-4 mb-8">
                <button
                    onClick={handleCrawl}
                    disabled={loading}
                    className="w-full text-white rounded-xl py-3 font-bold text-base shadow-lg shadow-[#00bba3]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    style={{ backgroundColor: loading ? THEME.hover : THEME.primary }}
                >
                    {loading ? (
                        <Loader2 size={20} className="animate-spin" />
                    ) : (
                        <RefreshCw
                            size={20}
                            strokeWidth={2.5}
                            className="group-hover:rotate-180 transition-transform duration-700"
                        />
                    )}
                    <span>{loading ? '資料同步中...' : '更新日報'}</span>
                </button>
            </div>

            {data && (
                <div className="w-full max-w-xl pb-20 animate-in slide-in-from-bottom-4 duration-500">
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

                    {/* [修改] 傳入 onPostDelete */}
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
