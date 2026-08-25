// lib/games.js
// Client-side data access for gaming-record v2 (spec docs/specs/gaming-record-v2.md).
// Every function returns the raw supabase { data, error } shape; callers toast.
import { supabase } from '@/lib/supabase';

export const DEFAULT_ACTIVITY_OPTIONS = ['推主線', '打 Boss', '練等', '收集', '亂晃'];

export const TEMPERATURES = [
    { code: 'high', label: '爽' },
    { code: 'stuck', label: '卡' },
    { code: 'lost', label: '迷路' },
    { code: 'wow', label: '驚豔' },
    { code: 'chill', label: '放空' },
];

export async function getAccessToken() {
    const {
        data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
}

export function slugify(title) {
    const slug = title
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\p{L}\p{N}-]/gu, '');
    return slug || `game-${Date.now()}`;
}

export async function fetchGamesOverview() {
    return supabase
        .from('portfolio_games_overview')
        .select('*')
        .order('last_played_at', { ascending: false, nullsFirst: false });
}

// Retries with -2, -3… suffixes on slug collision (unique_violation 23505).
// A user-supplied slug goes through slugify too — `/ ? #` in a slug cannot
// address /collection/game/[slug] reliably.
const MAX_SLUG_ATTEMPTS = 10;

export async function createGame(payload) {
    const baseSlug = slugify(payload.slug || payload.title);
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
        const result = await supabase
            .from('portfolio_games')
            .insert({ ...payload, slug })
            .select()
            .single();
        if (result.error?.code !== '23505') return result;
    }
    return { data: null, error: new Error(`slug「${baseSlug}」重試 ${MAX_SLUG_ATTEMPTS} 次仍衝突，請自訂 slug`) };
}

export async function updateGame(id, payload) {
    return supabase.from('portfolio_games').update(payload).eq('id', id).select().single();
}

// DB cascade wipes days/screenshots; GCS prefix purge is the caller's second
// step (DELETE /api/screenshots?game_id=).
export async function deleteGame(id) {
    return supabase.from('portfolio_games').delete().eq('id', id);
}

export async function fetchDay(gameId, date) {
    return supabase
        .from('portfolio_game_days')
        .select('*, portfolio_game_screenshots(*)')
        .eq('game_id', gameId)
        .eq('date', date)
        .maybeSingle();
}

// Bare row = spec's minimum savable unit; created on form entry so screenshot
// uploads have a day_id from the first second.
export async function createBareDay(gameId, date) {
    return supabase
        .from('portfolio_game_days')
        .insert({ game_id: gameId, date })
        .select('*, portfolio_game_screenshots(*)')
        .single();
}

export async function updateDay(id, fields) {
    return supabase.from('portfolio_game_days').update(fields).eq('id', id).select().single();
}

// Cleanup for rows auto-created by opening the form: deletes only rows still
// flagged is_draft (an explicit save or a screenshot insert clears the flag —
// so a deliberately saved zero-input day survives; codex review round 3) and
// with no screenshots (checked first: cascade must never take a shot with it).
export async function deleteDayIfDraft(id) {
    const { count, error: countError } = await supabase
        .from('portfolio_game_screenshots')
        .select('id', { count: 'exact', head: true })
        .eq('day_id', id);
    if (countError || (count ?? 0) > 0) return { data: null, error: countError || null };
    return supabase.from('portfolio_game_days').delete().eq('id', id).eq('is_draft', true);
}

export function sortScreenshots(shots) {
    return [...(shots || [])].sort((a, b) => {
        if (a.taken_at && b.taken_at && a.taken_at !== b.taken_at) {
            return a.taken_at < b.taken_at ? -1 : 1;
        }
        if (a.taken_at && !b.taken_at) return -1;
        if (!a.taken_at && b.taken_at) return 1;
        return a.id - b.id;
    });
}

export function daysAgo(dateStr) {
    if (!dateStr) return null;
    const diff = Date.now() - new Date(`${dateStr}T00:00:00`).getTime();
    return Math.max(0, Math.floor(diff / 86400000));
}

// Local-time formatting on purpose: toISOString() is UTC, which at 00:30 +08
// would label "yesterday" as two days ago.
export function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toDateStr(d);
}
