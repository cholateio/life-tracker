// lib/sleep.js
// Data access for life_sleep. Every function returns the raw supabase { data, error } shape; callers toast.
//
// Row states are derived from nullable columns (there is no status column):
//   session      sleep_time set,  wake_time null — opened by 睡覺, closed by 起床 or the editor
//   placeholder  sleep_time null, wake_time null — user-made slot for a date (e.g. id 291 for 2026-10-14);
//                code must never delete one on its own
//   complete     wake_time set
// `date` is the WAKE date (Taipei); a session normally has no date until it is closed.
import { supabase } from '@/lib/supabase';

const COLUMNS = 'id, date, sleep_time, wake_time, total, day_type, created_at';

export const isPlaceholder = (row) => !row.sleep_time && !row.wake_time;

// Under RLS an expired login, or a row changed elsewhere, makes update/delete match 0 rows
// WITHOUT an error; every mutation must confirm exactly one affected row.
async function expectOneRow(query) {
    const { data, error } = await query.select('id');
    if (error) return { data: null, error };
    if (!data || data.length !== 1) {
        return { data: null, error: new Error('紀錄已被變更或登入已過期，請重新整理後再試。') };
    }
    return { data: data[0], error: null };
}

export async function fetchRecordsInRange(fromDate, toDate) {
    return supabase
        .from('life_sleep')
        .select(COLUMNS)
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('created_at', { ascending: true });
}

// Placeholders are excluded: they have no sleep_time to measure from, so 起床 must never close one.
export async function fetchOpenSession() {
    return supabase
        .from('life_sleep')
        .select(COLUMNS)
        .not('sleep_time', 'is', null)
        .is('wake_time', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
}

export async function startSession(sleepTime, dayType) {
    return expectOneRow(supabase.from('life_sleep').insert([{ sleep_time: sleepTime, day_type: dayType }]));
}

// created_at is moved too: it is the session-start ordering key for fetchOpenSession and the banner date.
// The wake_time filter keeps a session closed on another device from being rewritten.
export async function restartSession(id, sleepTime, dayType) {
    return expectOneRow(
        supabase
            .from('life_sleep')
            .update({ sleep_time: sleepTime, day_type: dayType, created_at: new Date().toISOString() })
            .eq('id', id)
            .is('wake_time', null)
    );
}

// Without an id, a placeholder already holding fields.date is filled instead of inserting a
// second row beside it (2026-10-13 duplicate incident). The fill re-asserts the row is still
// empty, so a placeholder filled meanwhile errors out instead of being overwritten or duplicated.
export async function saveCompleteRecord(id, fields) {
    if (id != null) return expectOneRow(supabase.from('life_sleep').update(fields).eq('id', id));

    const { data: placeholder, error } = await supabase
        .from('life_sleep')
        .select('id')
        .eq('date', fields.date)
        .is('sleep_time', null)
        .is('wake_time', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
    if (error) return { data: null, error };
    if (placeholder) {
        return expectOneRow(
            supabase
                .from('life_sleep')
                .update(fields)
                .eq('id', placeholder.id)
                .is('sleep_time', null)
                .is('wake_time', null)
        );
    }

    return expectOneRow(supabase.from('life_sleep').insert([fields]));
}

export async function deleteRecord(id) {
    return expectOneRow(supabase.from('life_sleep').delete().eq('id', id));
}
