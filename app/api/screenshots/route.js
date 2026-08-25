// app/api/screenshots/route.js
// Screenshot pipeline (spec §3): one file per POST — hash dedup, sharp resize
// to 1920/640 WebP, GCS upload, DB insert — all server-side so the phone
// uploads each shot exactly once.
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

export async function POST(req) {
    try {
        const token = await authenticate(req);
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const formData = await req.formData();
        const file = formData.get('file');
        const dayId = formData.get('day_id');
        const gameId = formData.get('game_id');
        if (!file || !dayId || !gameId) {
            return NextResponse.json({ error: 'file, day_id, game_id are required' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        const db = authedClient(token);

        const { data: existing } = await db
            .from('portfolio_game_screenshots')
            .select('*')
            .eq('day_id', dayId)
            .eq('hash', hash)
            .maybeSingle();
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
        const [originalUrl, viewUrl, thumbUrl] = await Promise.all([
            saveToGcs(`${prefix}${ext}`, buffer, file.type || 'image/jpeg'),
            saveToGcs(`${prefix}_1920.webp`, viewBuf, 'image/webp'),
            saveToGcs(`${prefix}_640.webp`, thumbBuf, 'image/webp'),
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

        // game_id mode: DB rows are already gone via ON DELETE CASCADE — this
        // call only purges the game's whole GCS prefix.
        if (gameId) {
            if (!/^\d+$/.test(gameId)) return NextResponse.json({ error: 'Invalid game_id' }, { status: 400 });
            await storage.bucket(BUCKET).deleteFiles({ prefix: `games/${gameId}/` });
            return NextResponse.json({ deleted: true }, { status: 200 });
        }

        if (!id) return NextResponse.json({ error: 'id or game_id is required' }, { status: 400 });

        const { data: row, error: fetchError } = await db
            .from('portfolio_game_screenshots')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (fetchError) throw fetchError;
        if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        const { error: deleteError } = await db.from('portfolio_game_screenshots').delete().eq('id', id);
        if (deleteError) throw deleteError;

        // Hash-named objects are shared when the same file was uploaded on
        // another day — only delete from GCS once nothing references them.
        const { count } = await db
            .from('portfolio_game_screenshots')
            .select('id', { count: 'exact', head: true })
            .eq('original_url', row.original_url);
        if ((count || 0) === 0) {
            const paths = [row.original_url, row.view_url, row.thumb_url]
                .filter((u) => u?.startsWith(BASE_URL))
                .map((u) => u.slice(BASE_URL.length));
            await Promise.all(paths.map((p) => storage.bucket(BUCKET).file(p).delete({ ignoreNotFound: true })));
        }

        return NextResponse.json({ deleted: true }, { status: 200 });
    } catch (error) {
        console.error('Screenshot Delete Error:', error);
        return NextResponse.json({ error: 'Failed to delete screenshot' }, { status: 500 });
    }
}
