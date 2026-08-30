# Screenshot Upload-Order (`seq`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 截圖顯示順序改為「使用者上傳順序」（client 指定的 `seq`），不再依賴 EXIF `taken_at`。

**Architecture:** `portfolio_game_screenshots` 加 `seq integer`，由 client 在選檔時決定（同一 day 內遞增），隨 multipart 送到 `/api/screenshots`；server 驗證後寫入，client 未帶時（PWA 快取的舊 bundle）server 以該 day `max(seq)+1` 補位。所有排序點（life-tracker `sortScreenshots`、`portfolio_games_overview` view 封面挑選、portfolio repo `services/portfolio.js`）改為 `seq asc, id asc`。`taken_at` 保留存 DB 但退出排序。上線採 expand → deploy → contract 三段，任一時刻新舊程式都能寫入。

**Tech Stack:** Next.js 16 App Router、Supabase（Postgres 17，migration 手動貼 SQL editor 或 MCP `apply_migration`）、React 19、Serwist PWA。

**Spec:** `docs/specs/gaming-record-v2.md`（§2.3 排序規則、§2.4 view 本 plan 會修訂；Task 1 內含）。

## 背景（為什麼不用 EXIF）

截圖一律從遊戲平台 App 匯出到手機，EXIF `DateTimeOriginal` 是匯出時間、秒級精度、31 張中 14 張撞秒，且無 Make/Model/SubSec（2026-08-31 實測 GCS 原圖）。撞秒後落到 `id` 決定，而 uploader 3 路並發讓 `id` 順序隨機；刪除重傳又拿到新 id。結論：EXIF 不是可靠的排序鍵。

## Global Constraints

- 無自動測試框架（CLAUDE.md 刻意決定）：驗證 = `npm run lint` + `npm run build` + `npm run dev` 手動操作 + SQL 查 DB。**不要新增 test framework。**
- 本機無 DDL 權限：migration 寫成檔案，由使用者貼 Supabase SQL editor 執行（或經 MCP `apply_migration`，project `ukmcixycjqrznctudzrx`，需使用者當下同意）。
- 代碼內註解一律英文、只寫不變量／跨檔耦合／非顯然 why。
- Package manager 是 pnpm；本 plan 不新增依賴。
- 敏感路徑：migration/schema → phase-level review 必跑（kit-workflow）。
- **上線順序是硬約束**：Migration A（Task 1）→ 部署 life-tracker（Task 2–4）→ portfolio（Task 5）→ Migration B（Task 6）。Migration B 之前 DB 允許 `seq` 為 null，所有排序程式必須 null-safe。
- 跨 repo：`~/portfolio`（獨立 git repo，`services/portfolio.js:52-57` 自己用 `taken_at` 排截圖）是本 plan 的 ship boundary 一部分，Task 5 處理，獨立 commit。

## 設計決策（已與使用者確認 2026-08-31；codex adversarial review round 1 修訂）

| 決策 | 選擇 | 理由 |
|------|------|------|
| 欄位名 | `seq integer`（Migration B 後 `not null`） | 「同 day 內上傳序號」；不加 unique，多裝置同時傳撞號時以 `id` 補位即可 |
| 誰決定 seq | client（uploader） | 只有 client 知道使用者選檔順序；server 端 `max+1` 在 3 路並發下有 race 且仍丟失順序 |
| client 未帶 seq | server 以 `max(seq)+1` 補位，不回 400 | PWA 舊 bundle 可能存活到下次 SW 更新；補位比斷上傳好（codex round 1 high） |
| 既有 30 列回填 | `row_number() over (partition by day_id order by taken_at asc nulls last, id asc)` | 沿用目前顯示順序，使用者已看過、不會突變 |
| dedup 命中 | 保留既有列的 seq | 重傳同一檔不該搬動位置 |
| 排序 | `seq asc nulls last, id asc` | `taken_at` 完全退出排序；nulls last 只為 Migration A→B 窗口 |
| 手動拖曳排序 | 仍不做 | spec non-goal 維持；`seq` 是日後做它的基礎 |
| Rollback | 程式回滾：Migration B 前任何時刻都可（舊 route 不寫 seq，nullable 合法）；Migration B 之後要先跑 `ALTER TABLE portfolio_game_screenshots ALTER COLUMN seq DROP NOT NULL;` 再回滾程式 | 見 Task 6 |

---

### Task 1: Migration A（expand）+ spec 修訂

**Files:**
- Create: `supabase/migrations/20260831_screenshot_seq_a.sql`
- Modify: `docs/specs/gaming-record-v2.md:100-114`（schema + 排序規則）、`:116-143`（§2.4 view 整段）、`:298`（non-goals 措辭）

**Interfaces:**
- Produces: 欄位 `portfolio_game_screenshots.seq integer`（nullable，既有列已回填）；view `portfolio_games_overview` 封面挑選改為 `seq` 排序。後續 Task 全部依賴此欄位存在。

- [ ] **Step 1: 寫 migration A**

```sql
-- supabase/migrations/20260831_screenshot_seq_a.sql
-- Screenshot ordering moves from EXIF taken_at to a client-assigned upload
-- sequence: exported screenshots carry export time (1s resolution, heavy
-- collisions), so taken_at cannot order them.
-- Part A (expand): nullable column + backfill + view. Safe to run BEFORE the
-- app deploy — the old route inserts without seq and still succeeds.
-- Part B (20260831_screenshot_seq_b.sql) enforces NOT NULL after deploy.

alter table portfolio_game_screenshots add column seq integer;

-- Backfill with the order users currently see (taken_at asc nulls last, id).
update portfolio_game_screenshots s
set seq = r.rn
from (
  select id,
         row_number() over (partition by day_id order by taken_at asc nulls last, id asc) as rn
  from portfolio_game_screenshots
) r
where r.id = s.id;

-- Cover pick must follow the same order as the album. Body is byte-identical
-- to 20260826_gaming_record_v2.sql except the screenshot order by.
create or replace view portfolio_games_overview as
select
  g.*,
  d.first_played_at,
  d.last_played_at,
  d.days_count,
  coalesce(g.cover_image, s.first_thumb) as cover_resolved
from portfolio_games g
left join lateral (
  select min(date) as first_played_at,
         max(date) as last_played_at,
         count(*)  as days_count
  from portfolio_game_days where game_id = g.id and is_draft = false
) d on true
left join lateral (
  select sc.thumb_url as first_thumb
  from portfolio_game_days dd
  join portfolio_game_screenshots sc on sc.day_id = dd.id
  where dd.game_id = g.id
  order by dd.date asc, sc.seq asc nulls last, sc.id asc
  limit 1
) s on true;
```

注意：view 本體與 `20260826_gaming_record_v2.sql:78-95` 現行定義逐字一致（含 `is_draft = false`），只改 `order by`——`create or replace view` 不允許改欄位集合。執行前先 `select pg_get_viewdef('portfolio_games_overview')` 比對一次。

- [ ] **Step 2: 執行 migration A**

使用者貼 Supabase SQL editor；或 MCP `apply_migration`（需使用者同意）。

- [ ] **Step 3: 驗證 DB**

MCP `execute_sql`：

```sql
select day_id, string_agg(id || ':' || seq, ' ' order by seq) from portfolio_game_screenshots group by day_id order by day_id;
select count(*) filter (where seq is null) as null_seq from portfolio_game_screenshots;
select id, cover_resolved from portfolio_games_overview order by id;
```

Expected：每個 day 的 seq 為 1..n 連續；`null_seq = 0`；`cover_resolved` 與 migration 前相同（回填順序 = 原顯示順序）。

- [ ] **Step 4: 修 spec**

`docs/specs/gaming-record-v2.md`：
- schema 區塊 `taken_at` 下一行加：`seq          integer not null,             -- client 指定的上傳序號（同 day 內遞增；rollout 期間暫為 nullable）`
- 把 `:113-114` 兩行換成：
  ```
  - **顯示排序**：`seq asc nulls last, id asc`。`taken_at` 僅保存不參與排序——截圖一律由平台 App 匯出，
    EXIF 時間是匯出時間（秒級、大量撞秒），不可靠（2026-08-31 實測）。
    （client 選檔時依檔名排序後配發 seq = 該 day 目前最大 seq + 1 起遞增；逐張上傳自然遞增；
    dedup 命中保留既有 seq；client 未帶 seq 時 server 以 max+1 補位。）
  ```
- §2.4 view 的整段 SQL 換成 Step 1 的 `create or replace view` 全文（含 `is_draft = false`——現行 spec 漏了這個 filter，與已部署定義不符；codex round 1 medium）。
- `:298` 改為 `- ❌ 截圖手動拖曳排序與 is_highlight（`seq` 只記上傳順序，無 UI 調整）`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260831_screenshot_seq_a.sql docs/specs/gaming-record-v2.md
git commit -m "feat(game-record): add screenshot seq column (expand), order view by seq"
```

- [ ] **Step 6: Phase-level review（schema = 敏感路徑，size-blind）** — `/kit-review`

**模型建議**：Fable 5 / medium（migration 不可逆、view 需逐字對齊）。升級觸發：review 對回填或 view 提出 critical。

---

### Task 2: `lib/games.js` 排序與 seq 配發 helper

**Files:**
- Modify: `lib/games.js:110-119`

**Interfaces:**
- Produces: `sortScreenshots(shots)` 改為 `seq asc nulls last, id asc`；新 export `nextSeq(rows)`：回傳 `max(seq) + 1`（空陣列或全 null 回 1），rows 為任何帶 `seq` 的物件陣列。Task 4 消費。

- [ ] **Step 1: 改 `sortScreenshots`，新增 `nextSeq`**

把 `lib/games.js:110-119` 換成：

```js
// Order is the client-assigned upload sequence; taken_at is unreliable for
// app-exported screenshots (export time, 1s resolution) and is not consulted.
// seq may be null only during the expand->contract rollout window.
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
```

（`Infinity - Infinity` 是 `NaN`，`NaN || (a.id - b.id)` 會落到 id——JS 中 `NaN` 為 falsy，這正是要的行為。）

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 無錯誤。

- [ ] **Step 3: Commit**

```bash
git add lib/games.js
git commit -m "feat(game-record): sort screenshots by seq, add nextSeq helper"
```

---

### Task 3: `/api/screenshots` POST 接收 seq（帶 server fallback）

**Files:**
- Modify: `app/api/screenshots/route.js:96-101`（參數驗證）、`:163-172`（insert）、檔頭註解

**Interfaces:**
- Consumes: FormData 欄位 `seq`（十進位正整數字串，**選填**）。
- Produces: insert 時寫 `seq`；`seq` 存在但非法（非數字、<1）→ 400；缺席 → server 查該 day `max(seq)` 補 `+1`。dedup / 23505 路徑回傳既有列（其 seq 不變）。

- [ ] **Step 1: 參數驗證**

`route.js:96-101` 改為：

```js
        const formData = await req.formData();
        const file = formData.get('file');
        const dayId = formData.get('day_id');
        const seqRaw = formData.get('seq');
        if (!file || typeof file === 'string' || !isIdString(dayId)) {
            return NextResponse.json({ error: 'file and numeric day_id are required' }, { status: 400 });
        }
        if (seqRaw !== null && (!isIdString(seqRaw) || Number(seqRaw) < 1)) {
            return NextResponse.json({ error: 'seq must be a positive integer' }, { status: 400 });
        }
```

- [ ] **Step 2: 缺 seq 時 server 補位**

在 dedup 查詢（`const { data: existing, error: dupError }`）之後、`const base = sharp(buffer)` 之前插入：

```js
        // Clients built before seq existed (PWA-cached bundles) send none;
        // append to the day rather than fail. Racy under concurrency, but
        // only the legacy client hits this path.
        let seq = seqRaw === null ? null : Number(seqRaw);
        if (seq === null) {
            const { data: maxRow, error: maxError } = await db
                .from('portfolio_game_screenshots')
                .select('seq')
                .eq('day_id', dayId)
                .order('seq', { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle();
            if (maxError) throw maxError;
            seq = (maxRow?.seq ?? 0) + 1;
        }
```

- [ ] **Step 3: insert 加欄位**

insert 物件 `taken_at: takenAt,` 之後加一行 `seq,`：

```js
            .insert({
                day_id: dayId,
                original_url: originalUrl,
                view_url: viewUrl,
                thumb_url: thumbUrl,
                hash,
                taken_at: takenAt,
                seq,
            })
```

- [ ] **Step 4: 檔頭註解補不變量**

在 `// Destructive-path invariants` 段落之前加：

```js
// Ordering: seq is the client's upload sequence within a day, stored
// verbatim; missing seq (legacy client) appends at max+1. Dedup hits return
// the existing row and never move it.
```

- [ ] **Step 5: Lint + build**

Run: `npm run lint && npm run build`
Expected: 兩者成功。

- [ ] **Step 6: Commit**

```bash
git add app/api/screenshots/route.js
git commit -m "feat(api/screenshots): accept client seq, append at max+1 when absent"
```

---

### Task 4: Uploader 配發 seq

**Files:**
- Modify: `components/game-record/ScreenshotUploader.jsx:8`（import）、`:29-50`（uploadOne）、`:68-84`（handleSelect）

**Interfaces:**
- Consumes: `nextSeq` from `@/lib/games`（Task 2）；`/api/screenshots` 的 `seq` 欄位（Task 3）。
- Item 形狀新增 `seq: number`；retry 沿用原 item 的 seq（`retry()` 展開 `...item`，不必改）。

- [ ] **Step 1: import**

`:8` 改為 `import { getAccessToken, nextSeq } from '@/lib/games';`

- [ ] **Step 2: uploadOne 帶 seq**

`:36` `formData.append('day_id', day.id);` 之後加：

```js
            formData.append('seq', String(item.seq));
```

- [ ] **Step 3: handleSelect 配發 seq**

`:72-78` 換成：

```js
        // Filename order approximates the user's intended order within one pick.
        files.sort((a, b) => a.name.localeCompare(b.name));
        // Base covers committed rows and still-pending items so a second pick
        // during an in-flight batch continues the sequence instead of reusing it.
        const base = nextSeq([...screenshots, ...items]);
        const newItems = files.map((file, i) => ({
            key: `${Date.now()}-${i}-${file.name}`,
            file,
            seq: base + i,
            status: 'pending',
        }));
```

不變量：pending item 在 `uploadOne` 成功前不會離開 `items`，成功後 parent 經 `onAdd` 放進 `screenshots`；兩者聯集永遠涵蓋所有已配發的 seq。error 狀態的 item 也留在 `items`，其 seq 被保留，retry 用同號。

- [ ] **Step 4: Lint + build**

Run: `npm run lint && npm run build`
Expected: 成功。

- [ ] **Step 5: 手動驗證（dev，需 Migration A 已執行）**

Run: `npm run dev`，登入後進 game-record → 任一遊戲 → 今天：
1. 一次選 3 張（檔名 a、b、c）→ 顯示順序 a b c。
2. 再逐張上傳 d、e → 顯示 a b c d e。
3. 刪 b，重傳 b → 顯示 a c d e b（新上傳排最後）。
4. 重整頁面 → 順序不變。
5. MCP `execute_sql`：`select id, seq, right(hash,8) from portfolio_game_screenshots where day_id = <該 day> order by seq;` → seq 與畫面一致，且為 1..n（b 重傳得 6）。
6. Legacy 路徑：`curl -X POST -H "Authorization: Bearer <token>" -F file=@new.jpg -F day_id=<id> http://localhost:3000/api/screenshots` → 201 且回傳列 `seq = 7`。
7. 非法：同上加 `-F seq=0` → 400。

- [ ] **Step 6: Commit + 部署**

```bash
git add components/game-record/ScreenshotUploader.jsx
git commit -m "feat(game-record): assign upload seq per selection"
git push   # Vercel auto-deploy
```

部署後在手機上開一次 app 確認 SW 更新（新 bundle 才會帶 seq；舊 bundle 走 server 補位，不會壞）。

---

### Task 5: portfolio repo 排序同步（另一個 repo）

**Files:**
- Modify: `~/portfolio/services/portfolio.js:25-26`（註解）、`:52-57`（sort）

**Interfaces:**
- Consumes: DB 欄位 `seq`（Task 1）。`select('*, portfolio_game_days(*, portfolio_game_screenshots(*))')` 已是 `*`，不必改 select。

- [ ] **Step 1: 改 sort**

`~/portfolio/services/portfolio.js:52-57` 目前是 taken_at 三段比較 + id；換成：

```js
        // seq = upload order assigned by life-tracker; null only during its
        // rollout window. taken_at is EXIF export time and is not consulted.
        day.portfolio_game_screenshots?.sort(
            (a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity) || a.id - b.id,
        );
```

並把 `:25-26` 註解裡的 `(taken_at asc nulls last, id asc)` 改成 `(seq asc nulls last, id asc)`。

- [ ] **Step 2: 該 repo 的 lint/build**

Run（在 `~/portfolio`）：檢查 `package.json` scripts 後跑對應的 lint 與 build。
Expected: 成功。

- [ ] **Step 3: 驗證**

在 portfolio dev server 開 game album 頁，順序與 life-tracker Task 4 Step 5 的畫面一致。

- [ ] **Step 4: Commit（portfolio repo）+ 部署**

```bash
cd ~/portfolio && git add services/portfolio.js && git commit -m "feat(game): order screenshots by seq (synced with life-tracker)" && git push
```

---

### Task 6: Migration B（contract）+ 收尾

**Files:**
- Create: `supabase/migrations/20260831_screenshot_seq_b.sql`
- Append: `docs/LESSONS.md`

前提：Task 4 與 Task 5 都已部署，且手機 PWA 已拿到新 bundle（開 app 後看 network 有帶 `seq`，或 DB 最近一筆上傳 seq 不是走 max+1 也無所謂——不 null 即可）。

- [ ] **Step 1: 寫 migration B**

```sql
-- supabase/migrations/20260831_screenshot_seq_b.sql
-- Part B (contract): run only after every writer sends or server-fills seq.
-- App rollback past this point: first
--   ALTER TABLE portfolio_game_screenshots ALTER COLUMN seq DROP NOT NULL;
-- then redeploy the old app.

-- Rows the old route wrote during the rollout window have null seq and were
-- displayed nulls-last by id; append them after each day's current max so
-- the visible order does not change.
update portfolio_game_screenshots s
set seq = r.base + r.rn
from (
  select n.id,
         coalesce((select max(seq) from portfolio_game_screenshots m where m.day_id = n.day_id), 0) as base,
         row_number() over (partition by n.day_id order by n.id asc) as rn
  from portfolio_game_screenshots n
  where n.seq is null
) r
where r.id = s.id and s.seq is null;

alter table portfolio_game_screenshots alter column seq set not null;
```

- [ ] **Step 2: 執行前快照、執行、驗證**

執行前先存下目前顯示順序：
```sql
select day_id, string_agg(id::text, ' ' order by seq asc nulls last, id asc) as before_order
from portfolio_game_screenshots group by day_id order by day_id;
```
執行 migration B 後：
```sql
select day_id, string_agg(id::text, ' ' order by seq asc, id asc) as after_order,
       count(*) = count(distinct seq) as seq_unique
from portfolio_game_screenshots group by day_id order by day_id;
select is_nullable from information_schema.columns
where table_name = 'portfolio_game_screenshots' and column_name = 'seq';
```
Expected：每個 day 的 `after_order` 與 `before_order` 逐字相同；`seq_unique = true`；`is_nullable = NO`。

- [ ] **Step 3: LESSONS**

`docs/LESSONS.md` append：

```markdown
### 2026-08-31 App 匯出截圖的 EXIF 時間不可當排序鍵
- Context: game-record 截圖依 EXIF DateTimeOriginal 排序，使用者截圖全由平台 App 匯出到手機
- Error: 31 張中 14 張撞秒、無 Make/Model/SubSec；平手落到 id，3 路並發上傳讓 id 隨機 → 通關圖排在 Boss 圖前
- Solution: 加 client 配發的 seq 欄位（expand → deploy → contract），排序改 seq asc, id asc；portfolio repo 同步
- Rule: 使用者提供的媒體，排序鍵用「使用者動作順序」而非檔案內嵌時間；schema 改動先問「舊 client 還能寫嗎」再定 NOT NULL
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260831_screenshot_seq_b.sql docs/LESSONS.md
git commit -m "chore(game-record): enforce seq not null (contract), record lesson"
```

- [ ] **Step 5: Final review** — `/kit-review`（Task 2–4、6 批次；Task 1 已單獨審過；Task 5 在 portfolio repo 另審或由使用者目視——5 行 sort 改動）。

**模型建議**：Task 2–5 為 spec-locked 小改（介面已凍結）→ Opus 4.8 / medium；Task 1、6 與 review 用 Fable 5 / medium。升級觸發：任一 review 提出無法從 context 解的 high。
