// lib/games.js
// Client-side data access for gaming-record v2 (spec docs/specs/gaming-record-v2.md).
// Every function returns the raw supabase { data, error } shape; callers toast.
import { supabase } from '@/lib/supabase';

export const DEFAULT_ACTIVITY_OPTIONS = ['主線', '支線', '收集', '亂晃', '備戰'];

// Codes are the stored values and never change; labels are display-only, so
// renaming one is free. Order follows the spec's definition order and is NOT a
// good-to-bad scale.
export const TEMPERATURES = [
    { code: 'high', label: '開心' },
    { code: 'stuck', label: '卡關' },
    { code: 'lost', label: '枯燥' },
    { code: 'wow', label: '驚艷' },
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

// Created lazily — only when the first screenshot upload or an explicit save
// needs a day_id. Browsing dates therefore leaves no rows behind. Falls back to
// the existing row on unique violation (concurrent uploads racing to create it).
export async function createBareDay(gameId, date) {
    const result = await supabase
        .from('portfolio_game_days')
        .insert({ game_id: gameId, date })
        .select('*, portfolio_game_screenshots(*)')
        .single();
    if (result.error?.code === '23505') return fetchDay(gameId, date);
    return result;
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

// Order is the client-assigned upload sequence; taken_at is unreliable for
// app-exported screenshots (export time, 1s resolution, heavy collisions) and
// is not consulted. seq is null only during the expand->contract rollout.
export function sortScreenshots(shots) {
    return [...(shots || [])].sort(
        (a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity) || a.id - b.id,
    );
}

// Next seq for a day: max over committed rows AND in-flight uploads, so two
// selections made while the queue is still draining don't collide.
export function nextSeq(rows) {
    return (rows || []).reduce((m, r) => Math.max(m, r.seq ?? 0), 0) + 1;
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
