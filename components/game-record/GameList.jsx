// components/game-record/GameList.jsx
'use client';

import { Plus, Settings2, Gamepad2 } from 'lucide-react';
import { daysAgo } from '@/lib/games';

function lastPlayedText(game) {
    const n = daysAgo(game.last_played_at);
    if (n === null) return '尚未開始';
    if (n === 0) return '今天玩過';
    return `已隔 ${n} 天`;
}

export default function GameList({ games, onSelect, onNew, onEdit }) {
    return (
        <div className="flex flex-col gap-3 grow">
            <p className="text-sm font-bold text-[#3f4a4e]/60 uppercase tracking-wider mb-1">My Games</p>

            {games.length === 0 && (
                <div className="text-center py-10 text-[#3f4a4e]/40 font-bold">還沒有遊戲，先新增一款吧</div>
            )}

            {games.map((game) => (
                <div
                    key={game.id}
                    onClick={() => onSelect(game)}
                    className="w-full bg-transparent border-2 border-[#3f4a4e] rounded-2xl p-3 flex items-center gap-3 active:scale-[0.98] transition-all cursor-pointer"
                >
                    {game.cover_resolved ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={game.cover_resolved}
                            alt={game.title}
                            className="w-12 h-16 rounded-lg object-cover shrink-0 bg-[#3f4a4e]/10"
                        />
                    ) : (
                        <div className="w-12 h-16 rounded-lg bg-[#3f4a4e]/10 flex items-center justify-center shrink-0">
                            <Gamepad2 size={20} className="text-[#3f4a4e]/40" />
                        </div>
                    )}

                    <div className="flex flex-col gap-1 overflow-hidden grow text-left">
                        <span className="font-extrabold text-[#3f4a4e] text-lg truncate">{game.title}</span>
                        <div className="flex items-center gap-2 text-xs font-bold text-[#3f4a4e]/50">
                            {game.platform && (
                                <span className="px-2 py-0.5 rounded-full border border-[#3f4a4e]/30">{game.platform}</span>
                            )}
                            <span>{lastPlayedText(game)}</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        aria-label={`編輯 ${game.title}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit(game);
                        }}
                        className="p-2 rounded-full text-[#3f4a4e]/50 hover:bg-[#3f4a4e]/10 active:scale-90 transition-all shrink-0"
                    >
                        <Settings2 size={20} />
                    </button>
                </div>
            ))}

            <div className="my-3 border-b-2 border-[#3f4a4e]/10 border-dashed" />

            <button
                onClick={onNew}
                className="w-full bg-transparent border-2 border-[#3f4a4e] text-[#3f4a4e] rounded-2xl py-5 font-bold text-lg active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
                <Plus size={22} strokeWidth={2.5} />
                <span className="tracking-wide uppercase">New Game</span>
            </button>
        </div>
    );
}
