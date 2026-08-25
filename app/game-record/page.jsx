// app/game-record/page.jsx
// Gaming-record v2 (docs/specs/gaming-record-v2.md): recording side only —
// game list -> daily entry form / game create-edit. Viewing lives in portfolio.
'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import RecordPageLayout from '@/components/layout/RecordPageLayout';
import GameList from '@/components/game-record/GameList';
import GameForm from '@/components/game-record/GameForm';
import DayForm from '@/components/game-record/DayForm';
import { useAuth } from '@/hooks/useAuth';
import { fetchGamesOverview } from '@/lib/games';

const TITLES = {
    list: 'Game Record',
    'game-form': 'Game Setup',
    'day-form': 'Daily Log',
};

export default function GameRecordPage() {
    const { isAuthenticated, isChecking } = useAuth();
    const [view, setView] = useState('list');
    const [games, setGames] = useState([]);
    const [fetching, setFetching] = useState(true);
    const [activeGame, setActiveGame] = useState(null);
    const [editingGame, setEditingGame] = useState(null);

    // Bumping reloadKey re-runs the fetch; `fetching` is set back to true by
    // the caller (backToList) so the effect body stays free of sync setState.
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const { data, error } = await fetchGamesOverview();
            if (cancelled) return;
            if (error) {
                console.error('Fetch games error:', error);
                toast.error('無法載入遊戲清單');
            }
            setGames(data || []);
            setFetching(false);
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    const backToList = () => {
        setView('list');
        setActiveGame(null);
        setEditingGame(null);
        setFetching(true);
        setReloadKey((k) => k + 1);
    };

    return (
        <RecordPageLayout title={TITLES[view]}>
            {isChecking || (fetching && view === 'list') ? (
                <div className="flex flex-col items-center justify-center grow text-[#3f4a4e]/60">
                    <Loader2 className="animate-spin mb-4" size={32} />
                    <span className="font-bold tracking-widest text-sm uppercase">Loading...</span>
                </div>
            ) : !isAuthenticated ? (
                <div className="flex items-center justify-center grow">
                    <div className="bg-[#3f4a4e]/5 text-[#3f4a4e]/50 border-2 border-dashed border-[#3f4a4e]/20 p-6 rounded-2xl font-bold tracking-widest text-sm uppercase">
                        Admin Login Required
                    </div>
                </div>
            ) : view === 'list' ? (
                <GameList
                    games={games}
                    onSelect={(game) => {
                        setActiveGame(game);
                        setView('day-form');
                    }}
                    onNew={() => {
                        setEditingGame(null);
                        setView('game-form');
                    }}
                    onEdit={(game) => {
                        setEditingGame(game);
                        setView('game-form');
                    }}
                />
            ) : view === 'game-form' ? (
                <GameForm game={editingGame} onDone={backToList} onCancel={backToList} />
            ) : (
                <DayForm game={activeGame} onBack={backToList} />
            )}
        </RecordPageLayout>
    );
}
