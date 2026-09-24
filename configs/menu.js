import { Moon, Landmark, Flag, Bot, Gamepad2, Tv, ListTodo, Dices, FolderGit2 } from 'lucide-react';

const ALL_APPS = [
    {
        key: 'sleep-tracker',
        name: '睡眠紀錄',
        desc: 'Sleep Tracker',
        href: '/sleep-tracker',
        icon: Moon,
        color: '#3f4a4e',
    },
    {
        key: 'milestone',
        name: '人生里程碑',
        desc: 'Milestone',
        href: '/milestone',
        icon: Flag,
        color: '#c2785c',
    },
    {
        key: 'crawler',
        name: '巴哈日報',
        desc: 'Gamer Crawler',
        href: '/crawler',
        icon: Bot,
        color: '#166534',
    },
    {
        key: 'anime-record',
        name: '動漫紀錄',
        desc: 'Anime Record',
        href: '/anime-record',
        icon: Tv,
        color: '#6366f1',
    },
    {
        key: 'game-record',
        name: '電玩紀錄',
        desc: 'Game Record',
        href: '/game-record',
        icon: Gamepad2,
        color: '#1caad9',
    },
    {
        key: 'gallery',
        name: '我的圖庫',
        desc: 'Gallery',
        href: '/gallery',
        icon: Landmark,
        color: '#8c6b5d',
    },
    {
        key: 'todo',
        name: '待辦清單',
        desc: 'Todo List',
        href: '/todo',
        icon: ListTodo,
        color: '#FF4D4D',
    },
    {
        key: 'nocturne',
        name: '夜籤',
        desc: 'Nocturne',
        href: '/nocturne',
        icon: Dices,
        color: '#4a3f6b',
    },
    {
        key: 'project-record',
        name: '專案紀錄',
        desc: 'Project Record',
        href: '/project-record',
        icon: FolderGit2,
        color: '#0f766e',
    },
];

// Only game-record's schema ships in supabase/migrations/; the other eight
// pages query tables that exist solely in the maintainer's Supabase project.
// NEXT_PUBLIC_APPS (comma-separated keys) trims the home grid so a fork shows
// only what it can actually run. Unset = every app, i.e. the maintainer's own
// deployment is unaffected. Inlined at build time, so changing it needs a rebuild.
const enabledKeys = process.env.NEXT_PUBLIC_APPS?.split(',')
    .map((key) => key.trim())
    .filter(Boolean);

export const MENU_CONFIG = enabledKeys?.length ? ALL_APPS.filter((app) => enabledKeys.includes(app.key)) : ALL_APPS;
