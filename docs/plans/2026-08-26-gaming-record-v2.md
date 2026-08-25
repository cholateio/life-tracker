# 遊戲回憶相簿 v2 (P0+P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依 `docs/specs/gaming-record-v2.md` 完成 P0（DB 三表 + life-tracker 記錄端 + 截圖管線）與 P1（portfolio 呈現端書架 + 相簿頁）。

**Architecture:** 兩專案共用 Supabase；life-tracker 負責全部寫入（client 直寫 + `/api/screenshots` server 管線），portfolio 只讀（`services/` + `executeQuery`）。衍生欄位全收在 `portfolio_games_overview` view。

**Tech Stack:** Next.js 16 / React 19 / Supabase / GCS / sharp / exif-reader / Tailwind 4

**Spec:** `docs/specs/gaming-record-v2.md`（本計畫的唯一需求來源）

## Global Constraints

- life-tracker：JS only、`@/*` alias、無測試框架（驗證 = `npm run lint` + `npm run build` + dev 手動）、4-space、繁中回報。
- portfolio：查詢一律 `services/portfolio.js` + `executeQuery`（`result?.data || []`）；gate 只走 `lib/access.js isValidToken()`；無 `2xl:` breakpoint；顏色用既有 token；改 gate 讀取路徑屬 sensitive → review 不可跳。
- 代碼內註解一律英文；只寫不變量/跨檔耦合/非顯然 why。
- DB 無法由本機執行 DDL（無 service key / CLI / MCP auth）→ migration 產出為 SQL 檔，交付時附使用者一鍵執行說明；若本機有 docker 則以本地 postgres 驗證 SQL。
- 溫度五值 `high/stuck/lost/wow/chill` 固定；UI 不得排成好壞漸層。
- 截圖顯示排序固定 `taken_at asc nulls last, id asc`。

---

### Task 1: Migration SQL

**Files:**
- Create: `supabase/migrations/20260826_gaming_record_v2.sql`

**Interfaces:**
- Produces: 三表 + `portfolio_games_overview` view + RLS（欄位定義 = spec §2 全文照抄，此處不重複）。
- 重點：`drop view/table` 舊物件；`unique(game_id,date)`、`unique(day_id,hash)`；RLS select→anon+authenticated、寫→authenticated；`moddatetime` trigger 維護 updated_at；view 用 spec §2.4 原文 SQL。

- [ ] **Step 1:** 寫 SQL 檔（spec §2.1–2.5 逐字轉成可執行 SQL；開頭 `drop view if exists portfolio_games_overview; drop table if exists portfolio_games cascade;`）
- [ ] **Step 2:** `docker run postgres:15` 可用則灌入驗證：建表無錯、insert 假資料、view 查詢欄位齊全（`cover_resolved` fallback 生效）、`(game_id,date)` 衝突報錯。docker 不可用則標記 SQL 為 changed-but-unverified，交由 review。
- [ ] **Step 3:** Commit（life-tracker repo）。

### Task 2: `/api/screenshots` route（POST + DELETE）

**Files:**
- Create: `app/api/screenshots/route.js`
- Modify: `package.json`（`npm i sharp exif-reader`）

**Interfaces:**
- Consumes: GCS env（同 `/api/upload`）、`GCP_GALLERY_BUCKET_NAME`。
- Produces:
  - `POST` multipart：`file, day_id, game_id` → `201 {screenshot: row}`；重複 `(day_id, hash)` → `200 {screenshot: row, deduped: true}`。
  - `DELETE ?id=` → `200 {deleted: true}`。
  - 兩者皆需 `Authorization: Bearer`，驗證同 `/api/upload` 的 `getUser` 模式。

- [ ] **Step 1:** 安裝依賴。
- [ ] **Step 2:** 實作 POST：

```js
// 核心流程（完整版依此骨架）：
const buffer = Buffer.from(await file.arrayBuffer());
const hash = crypto.createHash('sha256').update(buffer).digest('hex');
const authed = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
// dedup：select 既有 (day_id, hash) → 有就直接回傳
const base = sharp(buffer).rotate();
const meta = await base.metadata();
let takenAt = null; // exif-reader(meta.exif)?.Photo?.DateTimeOriginal（JS Date；EXIF 無時區，僅供排序）
const view  = await base.clone().resize(1920, 1920, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
const thumb = await base.clone().resize(640, 640, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
// gallery bucket: games/{game_id}/{hash}.jpg | _1920.webp | _640.webp（原檔副檔名照舊檔名推斷，預設 .jpg）
// insert row with authed client → return row
```

- [ ] **Step 3:** 實作 DELETE：讀 row → delete row → `select count` 同 `original_url` 其他引用 → 0 才刪 GCS 三物件（從 URL 去掉 `https://storage.googleapis.com/{bucket}/` 前綴得 object path）。
- [ ] **Step 4:** 寫一次性 smoke script（`/tmp/test-pipeline.mjs`）：sharp 產生測試圖 → 跑 resize → 實際上傳 GCS `games/_smoke/` → 驗證 URL 200 → 刪除物件。實跑通過（GCS 憑證 + sharp 鏈路的真驗證）。
- [ ] **Step 5:** `npm run lint` + commit。

### Task 3: life-tracker 資料層 + 遊戲清單/新增/設定

**Files:**
- Create: `lib/games.js`（client 查詢集中：`fetchGamesOverview()`, `upsertGame()`, `deleteGame()`, `fetchDay(gameId, date)`, `upsertDay()`, `updateDay()`）
- Create: `components/game-record/GameList.jsx`
- Create: `components/game-record/GameForm.jsx`
- Modify: `app/game-record/page.jsx`（重寫為 view coordinator：`list | game-form | day-form`）

**Interfaces:**
- Consumes: `supabase`（lib）、`useAuth`、UI kit（FormInput/FormTextarea/DatePicker/DropdownSelect/ToggleSwitch/SubmitButton/ImageUpload/TagPicker、`Label`/`commonInputStyles`）。
- Produces: `GameList({ games, onSelect, onNew, onEdit })`；`GameForm({ game|null, onDone, onCancel })` — null=新增（title/platform/counter_label/activity_options/封面 + 收合 studio/release_date/purchase/slug override），編輯模式加 rating/total_hours/is_favorite/final_note/bookmark 三欄/刪除（confirm 對話 → 呼叫 `deleteGame` + `DELETE /api/screenshots` 不需逐張——DB cascade；GCS prefix 清理由 route `DELETE /api/screenshots?game_id=` 支援【併入 Task 2 的 DELETE：帶 `game_id` 時走 prefix 刪除】）。
- slug 規則：`title.toLowerCase().trim().replace(/\s+/g,'-').replace(/[^\p{L}\p{N}-]/gu,'')`，空→`game-${Date.now()}`；衝突（unique violation 23505）自動 `-2`、`-3` 重試。
- activity 預設組：`['推主線','打 Boss','練等','收集','亂晃']`。

- [ ] **Step 1:** `lib/games.js`（每個函式 `{ data, error }` 直傳，呼叫端 toast）。
- [ ] **Step 2:** `GameList`：封面 48px 圓角圖（無則灰塊）、標題、platform badge、`已隔 N 天`（`last_played_at` null 顯示「尚未開始」）。
- [ ] **Step 3:** `GameForm`：新增/編輯共用；封面走既有 `/api/upload`（bucketType thumbnail、folder `games-cover`）。
- [ ] **Step 4:** `page.jsx` coordinator + 權限鎖（沿用現頁 `isAuthenticated` 樣式）。
- [ ] **Step 5:** `npm run lint` + `npm run build` + commit。

### Task 4: 補記表單 + 截圖上傳佇列

**Files:**
- Create: `components/game-record/DayForm.jsx`
- Create: `components/game-record/ScreenshotUploader.jsx`
- Create: `components/game-record/TemperaturePicker.jsx`
- Create: `components/game-record/CounterStepper.jsx`

**Interfaces:**
- Consumes: Task 2 API、Task 3 `lib/games.js`、TagPicker。
- Produces:
  - `DayForm({ game, onBack })`：日期預設昨天（DatePicker）；日期變更→`fetchDay` 有 row 載入否則 `upsertDay({game_id, date})` 先建；②溫度 ③counter+progress_note ④activities ⑤one_line；「存起來」= `updateDay` 後 onBack。
  - `ScreenshotUploader({ dayId, gameId, screenshots, onChange })`：`<input multiple accept="image/*">`（選取後按檔名排序進佇列）、並發 3、`n/total` 進度、失敗項「重試」鈕、縮圖網格（thumb_url）+ 長按/點刪除單張（confirm → DELETE API）。
  - `TemperaturePicker({ value, onChange })`：五個等寬按鈕（爽/卡/迷路/驚豔/放空），再點取消；**排列順序照 spec 定義序，不做顏色漸層**。
  - `CounterStepper({ label, value, onChange })`：−/＋ step 1 + 可點數字直接鍵入；value null 起始 0。

- [ ] **Step 1:** 四元件實作。
- [ ] **Step 2:** `page.jsx` 接上 day-form 視圖。
- [ ] **Step 3:** `npm run lint` + `npm run build`；dev server 起來人工過一遍三視圖渲染（無 DB 時 fetch 失敗 → 確認 toast 而非白屏）。
- [ ] **Step 4:** Commit。

### Task 5: portfolio 書架查詢改版

**Files:**
- Modify: `services/portfolio.js`（`getGamesCollection` 改讀 view + alias；新增 `getGameBySlug`）
- Modify: `components/WaveList.jsx`（item 有 `slug` 時包 `<a href="/collection/game/{slug}">`）

**Interfaces:**
- Produces:

```js
// alias 讓 GameContent/Marquee/WaveList 零修改：
client.from('portfolio_games_overview')
  .select('title, favorite:is_favorite, slug, thumbnail:cover_resolved, platform, last_played_at')
  .order('last_played_at', { ascending: false, nullsFirst: false })

export async function getGameBySlug(slug) // →
client.from('portfolio_games')
  .select('*, portfolio_game_days(*, portfolio_game_screenshots(*))')
  .eq('slug', slug).single()
// days 排序 desc 用 .order('date', { referencedTable: 'portfolio_game_days', ascending: false })
// screenshots 排序在 JS：taken_at asc nulls last, id asc
```

- [ ] **Step 1:** service 改動；**getHomeStats 的 `getTableCount('portfolio_games')` 不動**。
- [ ] **Step 2:** WaveList 條件連結（AnimeContent 的 data 無 slug → 維持 div）。
- [ ] **Step 3:** `npm run lint` + `npm run test`（既有 lib 測試不能紅）+ commit。

### Task 6: portfolio 相簿頁 `/collection/game/[slug]`

**Files:**
- Create: `app/collection/game/[slug]/page.jsx`（server：gate → `notFound()`，同 `app/gallery/page.jsx` 模式；`getGameBySlug` 無資料也 `notFound()`；`export const metadata` 動態 title）
- Create: `components/collection/GameAlbum.jsx`（server 可渲染的展示層）
- Create: `components/collection/ScreenshotGrid.jsx`（'use client'：網格 + 點開 lightbox 看 view_url + caption 點按浮現）

**Interfaces:**
- Consumes: Task 5 `getGameBySlug`。
- Produces: spec §5.2 版面——標頭兩行、metadata 收合（`<details>` 即可）、日期分組（新→舊）：date + 溫度中文標籤 + `counter_label counter_value` + activities 小標籤 + 網格（`grid-cols-2 md:grid-cols-3 lg:grid-cols-4`、`aspect-auto` 等比、lazy、`bg-black/5` 佔位）+ one_line + progress_note（弱化樣式）。無截圖日正常渲染。溫度標籤中英對照表寫成常數 `TEMPERATURE_LABELS = { high:'爽', stuck:'卡', lost:'迷路', wow:'驚豔', chill:'放空' }`。

- [ ] **Step 1:** 三檔實作（樣式用既有 token：`bg-main`/`text-contrast`/`text-stress`）。
- [ ] **Step 2:** `npm run lint` + `npm run build` + commit。

### Task 7: 整合驗證 + review + push

- [ ] **Step 1:** 兩專案 `npm run build` 全綠；life-tracker dev server 對三視圖、portfolio dev server 對 `/collection`（gate off/on）與 `/collection/game/xxx`（404 路徑）人工驗證。
- [ ] **Step 2:** `/kit-review`（cross-model codex）：範圍 = 兩 repo 全部改動 + migration SQL。portfolio gate 讀取路徑屬 sensitive。修 findings → scoped re-review。
- [ ] **Step 3:** 兩 repo `git push`。
- [ ] **Step 4:** 更新 life-tracker `CLAUDE.md` file layout 事實區（新檔案）+ `PROJECT.toml` status_note；交付訊息附 migration SQL 執行說明（Supabase Dashboard SQL editor 貼上執行，或給我 MCP OAuth）。

## Self-Review

- Spec 覆蓋：§2→T1、§3→T2/T4、§4→T3/T4、§5→T5/T6、§6 P0+P1 全含、§7 不做清單無誤入、§8→T7。P2 項目（前情提要/caption 編輯/溫度分布）確認**不在**本計畫。
- 型別一致：`fetchDay/upsertDay/updateDay` 簽名 T3 定義 T4 消費；`getGameBySlug` T5 定義 T6 消費；DELETE API 的 `game_id` prefix 模式已回寫進 T2 範圍。
- 無 placeholder。
