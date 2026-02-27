import { Moon, Dumbbell, Flag, Bot, Gamepad2, Tv } from 'lucide-react';

export const MENU_CONFIG = [
    {
        name: '睡眠紀錄',
        desc: 'Sleep Tracker',
        href: '/sleep-tracker',
        icon: Moon,
        color: '#3f4a4e',
    },
    {
        name: '人生里程碑',
        desc: 'Milestone',
        href: '/milestone',
        icon: Flag,
        color: '#c2785c',
    },
    {
        name: '巴哈日報',
        desc: 'Gamer Crawler',
        href: '/crawler',
        icon: Bot,
        color: '#166534',
    },
    {
        name: '動漫紀錄',
        desc: 'Anime Record',
        href: '/anime-record',
        icon: Tv,
        color: '#6366f1',
    },
    {
        name: '電玩紀錄',
        desc: 'Game Record',
        href: '/game-record',
        icon: Gamepad2,
        color: '#1caad9',
    },
];
