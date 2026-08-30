// app/api/screenshots/route.js
// Screenshot pipeline (spec §3): one file per POST — hash dedup, sharp resize
// to 1920/640 WebP, GCS upload, DB insert — all server-side so the phone
// uploads each shot exactly once.
//
// Ordering: seq is the client's upload sequence within a day, stored
// verbatim. A missing seq (bundle cached before seq existed) is filled by the
// fill_seq trigger, which allocates max+1 under a per-day advisory lock — do
// NOT reintroduce a read-then-write max+1 here, it duplicates seq under the
// legacy client's 3-wide queue. Dedup hits return the existing row unmoved.
//
// Identity: (day_id, hash) is the primary key — there is no surrogate id. The
// same image recorded under two days is two rows, by design.
//
// Destructive-path invariants (codex adversarial review 2026-08-26, 2 rounds):
// - POST derives game_id from the day row; the client-supplied namespace is
//   never trusted, and nothing touches sharp/GCS until the day is confirmed.
// - Derived objects (_1920/_640 WebP) are keyed by (game, hash), so identical
//   bytes uploaded under different extensions share them. Any check-then-delete
//   of shared objects is a TOCTOU race against a concurrent POST, so single-row
//   DELETE and insert-failure paths NEVER touch GCS — orphaned objects wait for
//   the game-prefix purge, which only runs once the game row is confirmed gone.
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

// Upper bound for a client-supplied screenshot seq. Absurdly generous for a
// single day, yet small enough that seq and seq+1 stay well inside int4.
const SEQ_MAX = 1000000;

// Server writes hashes as sha256 hex, so anything else cannot match a row —
// reject before touching the DB.
const isHashString = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

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

// Clears is_draft and reports whether the day still existed. Returns false on
// error or zero matched rows — callers must not report success in that case.
async function promoteDay(db, dayId) {
    const { data, error } = await db
        .from('portfolio_game_days')
        .update({ is_draft: false })
        .eq('id', dayId)
        .select('id');
    if (error) {
        console.error('Day promotion failed:', error);
        return false;
    }
    return (data || []).length > 0;
}

async function saveToGcs(path, buffer, contentType) {
    await storage.bucket(BUCKET).file(path).save(buffer, {
        metadata: { contentType, cacheControl: 'public, max-age=31536000' },
    });
    return `${BASE_URL}${path}`;
}

export async function POST(req) {
    try {
        const token = await authenticate(req);
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const formData = await req.formData();
        const file = formData.get('file');
        const dayId = formData.get('day_id');
        const seqRaw = formData.get('seq');
        if (!file || typeof file === 'string' || !isIdString(dayId)) {
            return NextResponse.json({ error: 'file and numeric day_id are required' }, { status: 400 });
        }
        // Checked before any resize/GCS write: an out-of-range seq would
        // otherwise burn three uploads and then fail at the insert, stranding
        // the objects. The cap sits far below int4 max so the trigger's
        // max(seq)+1 can never overflow either (codex adversarial review
        // 2026-08-31); a day holds tens of shots, never a million.
        const seq = seqRaw === null ? null : Number(seqRaw);
        if (seqRaw !== null && (!isIdString(seqRaw) || !Number.isSafeInteger(seq) || seq < 1 || seq > SEQ_MAX)) {
            return NextResponse.json({ error: `seq must be an integer in [1, ${SEQ_MAX}]` }, { status: 400 });
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
        if (existing) {
            // Retry-heal: a prior attempt may have inserted the row but died
            // before promoting the day out of draft — promote here too.
            const promoted = await promoteDay(db, dayId);
            if (!promoted) return NextResponse.json({ error: 'day was removed during upload' }, { status: 409 });
            return NextResponse.json({ screenshot: existing, deduped: true }, { status: 200 });
        }

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
                seq,
            })
            .select()
            .single();

        if (insertError) {
            // 23505 = concurrent upload of the same file won the race; return
            // the winner — but only after promotion succeeds, like every other
            // success exit (the winner's own promotion may have died).
            if (insertError.code === '23505') {
                const { data: winner } = await db
                    .from('portfolio_game_screenshots')
                    .select('*')
                    .eq('day_id', dayId)
                    .eq('hash', hash)
                    .maybeSingle();
                if (winner) {
                    const promotedWinner = await promoteDay(db, dayId);
                    if (!promotedWinner) {
                        return NextResponse.json({ error: 'day was removed during upload' }, { status: 409 });
                    }
                    return NextResponse.json({ screenshot: winner, deduped: true }, { status: 200 });
                }
            }
            // If the insert failed because the game (and its days) were deleted
            // mid-flight, this upload may have landed AFTER the prefix purge —
            // re-purge now that the game is confirmed gone, so the last
            // finishing POST sweeps every straggler (codex review round 3).
            // For any other failure the objects stay (shared-hash TOCTOU).
            const { data: gameStillThere, error: gameCheckError } = await db
                .from('portfolio_games')
                .select('id')
                .eq('id', gameId)
                .maybeSingle();
            if (!gameCheckError && !gameStillThere) {
                // Failure here is logged, not swallowed: DELETE ?game_id= is
                // idempotent for a gone game, so the sweep can be re-run.
                await storage
                    .bucket(BUCKET)
                    .deleteFiles({ prefix: `games/${gameId}/` })
                    .catch((purgeError) => console.error(`Compensating purge failed for games/${gameId}/:`, purgeError));
            }
            throw insertError;
        }

        // First screenshot makes the day a real record: clear the draft flag so
        // bare-row cleanup can never cascade this shot away. The result is
        // checked — zero matched rows means a concurrent cleanup deleted the
        // day (and cascaded this row), so a success response would be a lie.
        const promoted = await promoteDay(db, dayId);
        if (!promoted) return NextResponse.json({ error: 'day was removed during upload' }, { status: 409 });

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
        const dayId = searchParams.get('day_id');
        const hash = searchParams.get('hash');
        const gameId = searchParams.get('game_id');
        const db = authedClient(token);

        // A bundle cached before the natural-key switch addresses rows by the
        // dropped surrogate id. Answer without querying that column, so this
        // branch behaves identically before and after the migration.
        if (searchParams.has('id')) {
            return NextResponse.json({ error: 'client outdated; reload the app' }, { status: 409 });
        }

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

        if (!isIdString(dayId) || !isHashString(hash)) {
            return NextResponse.json({ error: 'day_id + hash, or game_id, is required' }, { status: 400 });
        }

        // Row only — GCS objects stay until the game-prefix purge (see header
        // invariants for why immediate object deletion is a TOCTOU race).
        // (day_id, hash) is the primary key, so this matches at most one row;
        // the same image under another day is a different row and is untouched.
        const { error: deleteError } = await db
            .from('portfolio_game_screenshots')
            .delete()
            .eq('day_id', dayId)
            .eq('hash', hash);
        if (deleteError) throw deleteError;

        return NextResponse.json({ deleted: true }, { status: 200 });
    } catch (error) {
        console.error('Screenshot Delete Error:', error);
        return NextResponse.json({ error: 'Failed to delete screenshot' }, { status: 500 });
    }
}
