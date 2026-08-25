// app/api/screenshots/route.js
// Screenshot pipeline (spec §3): one file per POST — hash dedup, sharp resize
// to 1920/640 WebP, GCS upload, DB insert — all server-side so the phone
// uploads each shot exactly once.
//
// Destructive-path invariants (codex adversarial review 2026-08-26):
// - POST derives game_id from the day row; the client-supplied namespace is
//   never trusted, and nothing touches sharp/GCS until the day is confirmed.
// - Derived objects (_1920/_640 WebP) are keyed by (game, hash), so identical
//   bytes uploaded under different extensions share them — reference counting
//   is done on (game, hash), never on original_url alone.
// - Every reference-count/verify failure fails CLOSED (skip GCS deletion;
//   orphan objects are cheaper than broken albums).
import { NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { supabase } from '@/lib/supabase';

const storage = new Storage({
    projectId: process.env.GCP_PROJECT_ID,
    credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
});

const BUCKET = process.env.GCP_GALLERY_BUCKET_NAME || 'cholate-gallery';
const BASE_URL = `https://storage.googleapis.com/${BUCKET}/`;

const isIdString = (v) => typeof v === 'string' && /^\d+$/.test(v);

// Auth gate identical to /api/upload: session lives in client localStorage, so
// the token travels as a Bearer header; getUser(token) never touches the shared
// module-level client's state.
async function authenticate(req) {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return null;
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return token;
}

// RLS write policies require the authenticated role, so DB writes go through a
// per-request client carrying the user's token.
function authedClient(token) {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
    });
}

function extractTakenAt(exifBuffer) {
    if (!exifBuffer) return null;
    try {
        const exif = exifReader(exifBuffer);
        // EXIF carries no timezone; the Date is only used for ordering.
        const dt = exif?.Photo?.DateTimeOriginal || exif?.Image?.DateTime;
        return dt instanceof Date && !isNaN(dt) ? dt.toISOString() : null;
    } catch {
        return null;
    }
}

async function saveToGcs(path, buffer, contentType) {
    await storage.bucket(BUCKET).file(path).save(buffer, {
        metadata: { contentType, cacheControl: 'public, max-age=31536000' },
    });
    return `${BASE_URL}${path}`;
}

// Remaining rows that reference this (game, hash) object set. Returns null on
// query failure so callers can fail closed.
async function countHashRefs(db, gameId, hash) {
    const { count, error } = await db
        .from('portfolio_game_screenshots')
        .select('id, portfolio_game_days!inner(game_id)', { count: 'exact', head: true })
        .eq('hash', hash)
        .eq('portfolio_game_days.game_id', gameId);
    return error ? null : (count ?? 0);
}

export async function POST(req) {
    try {
        const token = await authenticate(req);
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const formData = await req.formData();
        const file = formData.get('file');
        const dayId = formData.get('day_id');
        if (!file || typeof file === 'string' || !isIdString(dayId)) {
            return NextResponse.json({ error: 'file and numeric day_id are required' }, { status: 400 });
        }

        const db = authedClient(token);
        const { data: dayRow, error: dayError } = await db
            .from('portfolio_game_days')
            .select('id, game_id')
            .eq('id', dayId)
            .maybeSingle();
        if (dayError) throw dayError;
        if (!dayRow) return NextResponse.json({ error: 'day not found' }, { status: 400 });
        const gameId = dayRow.game_id;

        const buffer = Buffer.from(await file.arrayBuffer());
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');

        const { data: existing, error: dupError } = await db
            .from('portfolio_game_screenshots')
            .select('*')
            .eq('day_id', dayId)
            .eq('hash', hash)
            .maybeSingle();
        if (dupError) throw dupError;
        if (existing) return NextResponse.json({ screenshot: existing, deduped: true }, { status: 200 });

        // rotate() bakes in EXIF orientation so the derived WebPs render upright.
        const base = sharp(buffer).rotate();
        let meta;
        try {
            meta = await base.metadata();
        } catch {
            return NextResponse.json({ error: 'Not a supported image' }, { status: 400 });
        }
        const takenAt = extractTakenAt(meta.exif);

        const [viewBuf, thumbBuf] = await Promise.all([
            base.clone().resize(1920, 1920, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
            base.clone().resize(640, 640, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(),
        ]);

        const ext = (file.name?.match(/\.[a-zA-Z0-9]+$/)?.[0] || '.jpg').toLowerCase();
        const prefix = `games/${gameId}/${hash}`;
        const objectPaths = [`${prefix}${ext}`, `${prefix}_1920.webp`, `${prefix}_640.webp`];
        const [originalUrl, viewUrl, thumbUrl] = await Promise.all([
            saveToGcs(objectPaths[0], buffer, file.type || 'image/jpeg'),
            saveToGcs(objectPaths[1], viewBuf, 'image/webp'),
            saveToGcs(objectPaths[2], thumbBuf, 'image/webp'),
        ]);

        const { data: row, error: insertError } = await db
            .from('portfolio_game_screenshots')
            .insert({
                day_id: dayId,
                original_url: originalUrl,
                view_url: viewUrl,
                thumb_url: thumbUrl,
                hash,
                taken_at: takenAt,
            })
            .select()
            .single();

        if (insertError) {
            // 23505 = concurrent upload of the same file won the race; return the winner.
            if (insertError.code === '23505') {
                const { data: winner } = await db
                    .from('portfolio_game_screenshots')
                    .select('*')
                    .eq('day_id', dayId)
                    .eq('hash', hash)
                    .maybeSingle();
                if (winner) return NextResponse.json({ screenshot: winner, deduped: true }, { status: 200 });
            } else {
                // Insert failed after upload: remove the fresh objects unless a
                // sibling row (same game+hash, other day) still references them.
                const refs = await countHashRefs(db, gameId, hash);
                if (refs === 0) {
                    await Promise.allSettled(
                        objectPaths.map((p) => storage.bucket(BUCKET).file(p).delete({ ignoreNotFound: true })),
                    );
                }
            }
            throw insertError;
        }

        return NextResponse.json({ screenshot: row }, { status: 201 });
    } catch (error) {
        console.error('Screenshot Upload Error:', error);
        return NextResponse.json({ error: 'Failed to process screenshot' }, { status: 500 });
    }
}

export async function DELETE(req) {
    try {
        const token = await authenticate(req);
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const gameId = searchParams.get('game_id');
        const db = authedClient(token);

        // game_id mode purges the whole GCS prefix, but only for a game that is
        // confirmed gone from the DB — a stale/forged call on a live game is
        // rejected instead of destroying its album.
        if (gameId) {
            if (!isIdString(gameId)) return NextResponse.json({ error: 'Invalid game_id' }, { status: 400 });
            const { data: game, error: gameError } = await db
                .from('portfolio_games')
                .select('id')
                .eq('id', gameId)
                .maybeSingle();
            if (gameError) throw gameError;
            if (game) {
                return NextResponse.json({ error: 'game still exists; delete the game first' }, { status: 409 });
            }
            await storage.bucket(BUCKET).deleteFiles({ prefix: `games/${gameId}/` });
            return NextResponse.json({ deleted: true }, { status: 200 });
        }

        if (!isIdString(id)) return NextResponse.json({ error: 'numeric id or game_id is required' }, { status: 400 });

        const { data: row, error: fetchError } = await db
            .from('portfolio_game_screenshots')
            .select('*, portfolio_game_days(game_id)')
            .eq('id', id)
            .maybeSingle();
        if (fetchError) throw fetchError;
        if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        const ownerGameId = row.portfolio_game_days?.game_id;

        const { error: deleteError } = await db.from('portfolio_game_screenshots').delete().eq('id', id);
        if (deleteError) throw deleteError;

        const refs = ownerGameId != null ? await countHashRefs(db, ownerGameId, row.hash) : null;
        if (refs === 0) {
            const paths = [row.original_url, row.view_url, row.thumb_url]
                .filter((u) => u?.startsWith(BASE_URL))
                .map((u) => u.slice(BASE_URL.length));
            await Promise.all(paths.map((p) => storage.bucket(BUCKET).file(p).delete({ ignoreNotFound: true })));
        }
        // refs === null (count query failed) or unknown owner: fail closed and
        // keep the objects — orphans beat broken albums.

        return NextResponse.json({ deleted: true }, { status: 200 });
    } catch (error) {
        console.error('Screenshot Delete Error:', error);
        return NextResponse.json({ error: 'Failed to delete screenshot' }, { status: 500 });
    }
}
