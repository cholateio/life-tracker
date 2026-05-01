const STORAGE_KEY_WEIGHTS = 'nocturne:weights';
const STORAGE_KEY_DRAWS = 'nocturne:draws';
const RETENTION_DAYS = 30;

export const THEME_IDS = ['dev', 'study', 'play', 'solo', 'free'];
export const DEFAULT_WEIGHTS = { dev: 25, study: 20, play: 20, solo: 20, free: 15 };

function isBrowser() {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function toLocalDateString(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function tonightDate(now = new Date()) {
    if (now.getHours() >= 19) {
        return toLocalDateString(now);
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return toLocalDateString(yesterday);
}

export function drawTheme(weights, rng = Math.random) {
    const entries = THEME_IDS.map((id) => {
        const raw = Number(weights?.[id] ?? 0);
        return [id, Number.isFinite(raw) && raw > 0 ? raw : 0];
    });
    const sum = entries.reduce((acc, [, w]) => acc + w, 0);
    if (sum === 0) {
        return THEME_IDS[Math.floor(rng() * THEME_IDS.length)];
    }
    const r = rng() * sum;
    let cumulative = 0;
    for (const [id, w] of entries) {
        cumulative += w;
        if (r < cumulative) return id;
    }
    return entries[entries.length - 1][0];
}

export function loadWeights() {
    if (!isBrowser()) return { ...DEFAULT_WEIGHTS };
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY_WEIGHTS);
        if (!raw) return { ...DEFAULT_WEIGHTS };
        const parsed = JSON.parse(raw);
        const merged = { ...DEFAULT_WEIGHTS };
        for (const id of THEME_IDS) {
            const v = Number(parsed?.[id]);
            if (Number.isFinite(v) && v >= 0) merged[id] = v;
        }
        return merged;
    } catch {
        return { ...DEFAULT_WEIGHTS };
    }
}

export function saveWeights(weights) {
    if (!isBrowser()) return;
    const cleaned = {};
    for (const id of THEME_IDS) {
        const v = Number(weights?.[id]);
        cleaned[id] = Number.isFinite(v) && v >= 0 ? v : 0;
    }
    try {
        window.localStorage.setItem(STORAGE_KEY_WEIGHTS, JSON.stringify(cleaned));
    } catch {
        // storage write failed (quota / private mode) — silently skip persistence
    }
}

export function loadDraws() {
    if (!isBrowser()) return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY_DRAWS);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((d) => d && typeof d.night_date === 'string' && THEME_IDS.includes(d.theme))
            .sort((a, b) => (a.night_date < b.night_date ? 1 : -1));
    } catch {
        return [];
    }
}

export function recordDraw(themeId, now = new Date()) {
    if (!THEME_IDS.includes(themeId)) {
        throw new Error(`Unknown theme id: ${themeId}`);
    }
    const nightDate = tonightDate(now);
    const cutoffBase = new Date(`${nightDate}T12:00:00`);
    cutoffBase.setDate(cutoffBase.getDate() - RETENTION_DAYS);
    const cutoffString = toLocalDateString(cutoffBase);

    const existing = loadDraws();
    const pruned = existing.filter((d) => d.night_date >= cutoffString && d.night_date < nightDate);
    const next = [{ night_date: nightDate, theme: themeId, drawn_at: now.toISOString() }, ...pruned].sort((a, b) =>
        a.night_date < b.night_date ? 1 : -1,
    );

    if (isBrowser()) {
        try {
            window.localStorage.setItem(STORAGE_KEY_DRAWS, JSON.stringify(next));
        } catch {
            // storage write failed — return the new array but skip persistence
        }
    }
    return next;
}

export function lastNNightDates(n, now = new Date()) {
    const tonight = tonightDate(now);
    const base = new Date(`${tonight}T12:00:00`);
    const dates = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(base);
        d.setDate(d.getDate() - i);
        dates.push(toLocalDateString(d));
    }
    return dates;
}
