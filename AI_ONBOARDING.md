# AI_ONBOARDING.md

> Context AI needs for daily code changes. NOT a project doc.
> See `CLAUDE.md` for workflow rules, `README.md` / `USAGE.md` for humans.

## Architecture in 5 sentences

- Next.js 16 App Router monolith — one feature = one `app/<feature>/page.jsx`. No nested routes, no service layer, no `src/`.
- Frontend is the heavy side: image compression / rotation / SHA-256 hashing all happen client-side via Canvas before any upload.
- Backend is intentionally thin — `app/api/upload/route.js` is the only API route, and it just writes the already-hashed buffer to GCS.
- Supabase (PostgreSQL + Auth) holds structured data; pages call it directly via `lib/supabase.js` from the client.
- Daily crawler runs offline (GH Actions → `scripts/crawl-to-file.mjs` → commit `public/daily-news.json`) and `app/crawler/page.jsx` reads that static file. No live scraping in the app.

## Entry points & data flow

- **App entry**: `app/layout.jsx` → `app/page.jsx` (grid menu driven by `configs/menu.js`) → feature pages.
- **Auth**: `hooks/useAuth.js` wraps `supabase.auth.getSession()` + `onAuthStateChange`. Pages opt in by calling the hook.
- **Image upload**: feature page → client-side Canvas resize/rotate/hash → `POST /api/upload` (multipart, includes a `bucketType` field) → returns GCS public URL → page persists URL into Supabase row.
- **Crawler read path**: `app/crawler/page.jsx` fetches the static `/daily-news.json` (refreshed twice daily by CI).
- **Path alias**: `@/*` resolves to **repo root** (e.g. `import '@/lib/supabase'`). There is no `src/`.

## Coding conventions (observed)

- **No TypeScript.** Source is `.jsx` / `.js` / `.mjs`. Don't introduce `.ts`.
- **Indent: 4 spaces, single quotes** (consistent in every file read).
- **`'use client'` at top** of any page that uses hooks or event handlers — that's almost every page.
- **One file per feature page** (`app/<feature>/page.jsx`); shared UI lives only in `components/`, never co-located.
- **Compose, don't custom-build forms**: every record page wraps `<RecordPageLayout>` and uses `components/ui/{FormBase, FormInput, FormTextarea, DatePicker, DropdownSelect, ToggleSwitch, SubmitButton, ImageUpload, ImageUploadGallery}`. Reach for these before writing a new input.
- **Toasts via `sonner`**, already mounted inside `RecordPageLayout`. Don't add another toast lib.
- **Icons via `lucide-react`** only.
- **Styling**: Tailwind 4 first. For per-instance dynamic colors, the codebase uses arbitrary-value classes (`text-[#3f4a4e]`) and inline `style` with CSS custom properties — see `app/page.jsx` for the canonical pattern.
- **Comments are in 中文** when present; default to none per CLAUDE.md.
- **Naming**: `PascalCase.jsx` for components, `useCamelCase.js` for hooks, lowercase for configs/scripts.

## Testing

No automated tests, **intentionally**. Verify a change with:

1. `npm run lint`
2. `npm run build` (catches most import / JSX / syntax errors)
3. `npm run dev` and exercise the affected page in a **desktop browser** — that's sufficient to claim "tested", no real-phone check required despite the project being a mobile-first PWA.

This is the project's accepted form of "evidence before completion". Do NOT propose adding vitest / jest / playwright.

## Build / dev commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server (Next + **webpack**, not Turbopack — explicit) |
| `npm run build` | Production build; also generates `public/sw.js` via Serwist |
| `npm run start` | Serve the production build (needed to actually test the PWA / service worker — SW is disabled in dev) |
| `npm run lint` | ESLint with `eslint-config-next` |
| `node scripts/crawl-to-file.mjs` | Run the crawler locally; same script runs in CI twice daily |

## Schema changes (Supabase)

There is no migrations folder in the repo — schema lives in Supabase Studio and the user owns it. Workflow when a feature needs new columns / tables:

1. Ask the user for the existing table shape (or wait for them to paste it).
2. Write a self-contained SQL snippet (`ALTER TABLE ...` for the common case of adding columns; `CREATE TABLE ...` if a new entity).
3. The user runs it in Studio. The AI does not execute DDL and does not introduce a migrations directory.

After SQL is approved, code the page assuming the change has been applied.
