# Screenshot Natural Key `(day_id, hash)` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 `portfolio_game_screenshots.id` 這個冗餘的代理鍵，主鍵改為現成的自然鍵 `(day_id, hash)`。

**Architecture:** `UNIQUE (day_id, hash)` 已存在且兩欄皆 NOT NULL，直接升格為 PK。所有原本以 `id` 定位單張截圖的地方（DELETE endpoint、React key、client 端去重／移除、排序 tiebreak、`deleteDayIfDraft` 的 count 查詢）改用 `hash`（在單一 day 的作用域內唯一）。`seq` 是排序主鍵、已 NOT NULL，`id` 拿掉後排序語意不變。

**上線順序（codex round 1 high）**：migration 不可逆，且已部署的 bundle 會送 `?id=`。因此**先部署完全不依賴 `id` 的程式碼**（Task 1–3），確認真機 PWA 已更新，**最後**才跑 drop column（Task 4）。新版 DELETE 對 `?id=` 一律回 409「client outdated」而**不查詢 id 欄位**，所以 migration 之後不需要第二次部署，也不存在 500 窗口。

**Tech Stack:** Next.js 16 App Router、Supabase（Postgres 17）、React 19；另涉獨立 repo `~/portfolio`。

**Spec:** `docs/specs/gaming-record-v2.md` §2.3（schema 與排序規則，本 plan 修訂）。

## 背景

`id bigserial` 對這張表沒有承擔任何職責：無任何 FK 指向它（`constraint_column_usage` 實查為空），自然鍵 `(day_id, hash)` 早就存在且被 dedup 邏輯依賴。它唯一的可見效果是在 Supabase table editor 裡因刪除而跳號（2026-08-31 使用者回報：20,21,22,23,31,32,33,51…），造成誤讀。使用者的品味決策：以 hash 為識別。

## Global Constraints

- 無自動測試框架（CLAUDE.md 刻意決定）：驗證 = `npm run lint` + `npm run build` + 真機操作 + SQL 查 DB。**不要新增 test framework。**
- 代碼內註解一律英文；只寫不變量／跨檔耦合／非顯然 why。
- pnpm；不新增依賴。
- **敏感路徑**：`DELETE /api/screenshots` 是破壞性路徑，檔頭有 TOCTOU 不變量（單張刪除不碰 GCS、只有整個 game 確認消失才 prefix purge）。本 plan 改它的參數形狀 → **必跑 codex adversarial review，size-blind，不得 skip/defer。**
- 跨 repo：`~/portfolio/services/portfolio.js` 的排序 tiebreak 一併改，獨立 commit、獨立部署。
- **不可逆**：`drop column id` 後值永久消失。已確認無 FK、無外部連結依賴。

## 設計決策

| 決策 | 選擇 | 理由 |
|------|------|------|
| 新 PK | `(day_id, hash)` | 已存在的 UNIQUE 直接升格；兩欄皆 NOT NULL |
| 舊 UNIQUE constraint | 由 `portfolio_game_screenshots_day_id_hash_key` 改為 PK 後移除 | PK 本身就是唯一索引，留著等於兩份相同索引 |
| DELETE 單張參數 | `?day_id=<int>&hash=<64hex>` | 兩者都要，因為 hash 只在 day 內唯一（同一張圖可存在於不同 day） |
| hash 格式驗證 | `/^[0-9a-f]{64}$/` | 與 server 端 `crypto.createHash('sha256').digest('hex')` 產出一致 |
| 排序 tiebreak | `seq` 相同時比 `hash` 字串 | `seq` NOT NULL 且逐日遞增，tiebreak 僅在雙裝置撞號時觸發 |
| client 識別 | `shot.hash` | React key / deletingId / 去重 filter |
| `game_id` purge 模式 | **完全不動** | 與 id 無關 |
| 23505 dedup 復原路徑 | **完全不動** | 本來就查 `(day_id, hash)` |

---

### Task 4: Migration — 換主鍵、drop id（不可逆，最後才跑）

**Files:**
- Create: `supabase/migrations/20260831_screenshot_natural_key.sql`

**Interfaces:**
- Produces: `portfolio_game_screenshots` 不再有 `id` 欄位；PK = `(day_id, hash)`。後續所有 Task 依賴此。

- [ ] **Step 1: 執行前快照（順序基準線）**

```sql
select day_id, string_agg(right(hash,8), ' ' order by seq, id) as before_order
from portfolio_game_screenshots group by day_id order by day_id;
```
把輸出留著，Step 4 要逐字比對。

- [ ] **Step 2: 寫 migration**

```sql
-- 20260831_screenshot_natural_key.sql
-- id was a redundant surrogate: nothing references it (no FK targets this
-- table) and (day_id, hash) is already unique and NOT NULL — the dedup path
-- has always keyed on it. Dropping id removes the delete-induced number gaps
-- that made the table unreadable.
-- Ordering is unaffected: seq (NOT NULL since _seq_b) is the sort key; ties
-- now break on hash instead of id.

alter table portfolio_game_screenshots drop constraint portfolio_game_screenshots_pkey;
alter table portfolio_game_screenshots drop constraint portfolio_game_screenshots_day_id_hash_key;
alter table portfolio_game_screenshots add primary key (day_id, hash);
alter table portfolio_game_screenshots drop column id;
```

順序不能換：先 drop 舊 PK，再 drop 冗餘 UNIQUE（否則 add primary key 會與它並存成兩份索引），最後才 drop column。

- [ ] **Step 3: 執行**

MCP `apply_migration`（project `ukmcixycjqrznctudzrx`）或貼 Supabase SQL editor。

- [ ] **Step 4: 驗證**

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'portfolio_game_screenshots'::regclass order by contype;

select count(*) from information_schema.columns
where table_name = 'portfolio_game_screenshots' and column_name = 'id';

select day_id, string_agg(right(hash,8), ' ' order by seq, hash) as after_order
from portfolio_game_screenshots group by day_id order by day_id;

select count(*) as total from portfolio_game_screenshots;
```

Expected：constraint 只剩 `PRIMARY KEY (day_id, hash)` 與 day_id 的 FK（無殘留 UNIQUE）；`id` 欄位數為 0；`after_order` 與 Step 1 的 `before_order` 逐字相同；`total = 30`。

- [ ] **Step 5: 確認 view 未壞**

```sql
select id, right(cover_resolved, 20) from portfolio_games_overview order by id;
```
Expected：與改動前相同（view 內 `sc.id` 需先在 Task 2 一併處理——見下方注意）。

**注意**：`portfolio_games_overview` 目前 `order by dd.date asc, sc.seq asc nulls last, sc.id asc` 引用了 `sc.id`。**drop column 會因 view 相依而失敗**（Postgres 會擋）。因此 migration 必須先 `create or replace view` 把 `sc.id` 換成 `sc.hash`，再 drop column。把這段補進 Step 2 的 migration 最前面：

```sql
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
  order by dd.date asc, sc.seq asc, sc.hash asc
  limit 1
) s on true;
```

（`seq` 已 NOT NULL，`nulls last` 可以拿掉。）

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260831_screenshot_natural_key.sql
git commit -m "feat(game-record): drop redundant screenshot id, PK is (day_id, hash)"
```

- [ ] **Step 7: Phase-level review（schema = 敏感路徑）** — 併入 Task 5 的 review，migration 尚未部署程式碼前不對外可見。

---

### Task 1: `/api/screenshots` DELETE 改用 (day_id, hash)

**Files:**
- Modify: `app/api/screenshots/route.js:246-274`（DELETE）、檔頭註解

**Interfaces:**
- Consumes: query `?day_id=<int>&hash=<64 hex>`（單張刪除）或 `?game_id=<int>`（prefix purge，不變）。
- Produces: 單張刪除仍只刪 DB 列、不碰 GCS（TOCTOU 不變量維持）。缺參數或格式錯 → 400。

- [ ] **Step 1: 加 hash 驗證 helper**

在 `const SEQ_MAX = 1000000;` 之後加：

```js
// Server writes hashes as crypto sha256 hex, so anything else cannot match a
// row — reject before touching the DB.
const isHashString = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
```

- [ ] **Step 2: 改 DELETE 的單張路徑**

`route.js:247` 的 `const id = searchParams.get('id');` 換成：

```js
        const dayId = searchParams.get('day_id');
        const hash = searchParams.get('hash');
```

`route.js:269-273`（`if (!isIdString(id))` 起那三行）換成：

```js
        if (!isIdString(dayId) || !isHashString(hash)) {
            return NextResponse.json({ error: 'day_id + hash, or game_id, is required' }, { status: 400 });
        }

        // Row only — GCS objects stay until the game-prefix purge (see header
        // invariants for why immediate object deletion is a TOCTOU race).
        // (day_id, hash) is the primary key, so this matches at most one row.
        const { error: deleteError } = await db
            .from('portfolio_game_screenshots')
            .delete()
            .eq('day_id', dayId)
            .eq('hash', hash);
        if (deleteError) throw deleteError;
```

- [ ] **Step 3: 檔頭註解更新**

檔頭 `// Ordering:` 段落之後、`// Destructive-path invariants` 之前加一行：

```js
// Identity: (day_id, hash) is the primary key — there is no surrogate id.
// The same image in two different days is two rows, by design.
```

- [ ] **Step 4: Lint + build**

Run: `npm run lint && npm run build`
Expected: 兩者成功；lint 相對 main 無新增問題（既有 93 problems）。

- [ ] **Step 5: Commit**

```bash
git add app/api/screenshots/route.js
git commit -m "feat(api/screenshots): delete by (day_id, hash) instead of id"
```

---

### Task 2: Client 端改用 hash 識別

**Files:**
- Modify: `components/game-record/ScreenshotUploader.jsx:99,102,107,137,143,147`
- Modify: `components/game-record/DayForm.jsx:227-228`
- Modify: `lib/games.js`（`sortScreenshots` tiebreak）

**Interfaces:**
- Consumes: Task 2 的 `?day_id=&hash=`。
- Produces: `onRemove(hash)`（原本是 `onRemove(id)`）——DayForm 的 handler 必須同步改，否則列表移不掉。

- [ ] **Step 1: `lib/games.js` tiebreak**

把 `sortScreenshots` 的比較式換成：

```js
// seq is NOT NULL; the hash tiebreak only fires if two devices picked the
// same seq for one day.
export function sortScreenshots(shots) {
    return [...(shots || [])].sort(
        (a, b) => a.seq - b.seq || (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0),
    );
}
```

`nextSeq` 不動（它只讀 `seq`）。

- [ ] **Step 2: `ScreenshotUploader.jsx` — handleDelete**

`:99` `setDeletingId(shot.id);` → `setDeletingId(shot.hash);`
`:102` 的 fetch URL → `` `/api/screenshots?day_id=${shot.day_id}&hash=${shot.hash}` ``
`:107` `onRemove(shot.id);` → `onRemove(shot.hash);`

`shot.day_id` 來自 insert 後 `.select()` 回傳的整列，欄位存在。

- [ ] **Step 3: `ScreenshotUploader.jsx` — 列表渲染**

`:137` `key={shot.id}` → `key={shot.hash}`
`:143` `disabled={deletingId === shot.id}` → `deletingId === shot.hash`
`:147` `{deletingId === shot.id ? …}` → `deletingId === shot.hash ? …`

- [ ] **Step 4: `DayForm.jsx` — 去重與移除**

`:227` → `onAdd={(row) => setScreenshots((prev) => sortScreenshots([...prev.filter((s) => s.hash !== row.hash), row]))}`
`:228` → `onRemove={(hash) => setScreenshots((prev) => prev.filter((s) => s.hash !== hash))}`

- [ ] **Step 5: 確認沒有漏網的 `.id`**

Run: `grep -rn "shot\.id\|s\.id\b\|screenshot.*\.id" components/game-record/ lib/games.js | grep -v "day\.id\|game\.id"`
Expected: 無輸出。

- [ ] **Step 6: Lint + build**

Run: `npm run lint && npm run build`
Expected: 成功。

- [ ] **Step 7: Commit**

```bash
git add components/game-record/ScreenshotUploader.jsx components/game-record/DayForm.jsx lib/games.js
git commit -m "feat(game-record): identify screenshots by hash on the client"
```

---

### Task 3: portfolio repo：ScreenshotGrid key + 排序 tiebreak

**Files:**
- Modify: `~/portfolio/services/portfolio.js:51-57`

**Interfaces:**
- Consumes: 不再存在的 `id` 欄位——**這是硬相依**，Task 1 部署後此檔若未更新，`a.id - b.id` 會變成 `undefined - undefined = NaN`，`NaN` 為 falsy 所以排序退回 `seq` 單鍵比較，實務上仍正確，但屬未定義行為，必須修。

- [ ] **Step 1: 改 sort**

```js
        // seq = upload order assigned by life-tracker (NOT NULL). There is no
        // surrogate id — (day_id, hash) is the row's identity — so ties break
        // on hash.
        day.portfolio_game_screenshots?.sort(
            (a, b) => a.seq - b.seq || (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0),
        );
```

- [ ] **Step 2: 確認該 repo 沒有其他地方用 screenshot 的 id**

Run: `grep -rn "portfolio_game_screenshots" ~/portfolio --include=*.js --include=*.jsx | grep -v node_modules`，逐一檢查回傳處是否觸及 `.id`。
Expected: 只有 `services/portfolio.js` 與 `components/collection/GameAlbum.jsx`；後者的 `key={day.id}` 是 **day** 的 id，不動。

- [ ] **Step 3: 驗證**

Run（在 `~/portfolio`）：`npm run lint && npm run build && npm test`
Expected: lint 乾淨、build 成功、vitest 54 tests 全過。

- [ ] **Step 4: Commit**

```bash
cd ~/portfolio && git add services/portfolio.js
git commit -m "feat(game): screenshots have no surrogate id; tie-break on hash"
```

---

### Task 5: Spec、review、收尾

**Files:**
- Modify: `docs/specs/gaming-record-v2.md` §2.3 schema、排序規則；§2.4 view SQL

- [ ] **Step 1: 修 spec**

- schema 區塊移除 `id bigint generated always as identity primary key,` 那行；把結尾的
  `unique (day_id, hash)  -- 同日去重；同時充當 day_id 的 FK index`
  改成 `primary key (day_id, hash)  -- 自然鍵：同日去重，同時充當 day_id 的 FK index`
- 排序規則行 `seq asc nulls last, id asc` → `seq asc, hash asc`（`seq` 已 NOT NULL），並補一句「無代理鍵 id，單張截圖以 `(day_id, hash)` 定位」
- §2.4 view SQL 的 `order by` 同步改成 `dd.date asc, sc.seq asc, sc.hash asc`

- [ ] **Step 2: 全套 review（敏感路徑，不得 skip）** — `/kit-review`

範圍：Task 1–4 的完整變更集。重點交代給 reviewer：DELETE 參數形狀變了、TOCTOU 不變量是否仍成立、`game_id` purge 路徑是否被波及、hash 驗證是否在碰 DB 前、client 端有無漏改的 `.id`。

- [ ] **Step 3: 處理 findings 後 commit spec**

```bash
git add docs/specs/gaming-record-v2.md
git commit -m "docs(spec): screenshots keyed by (day_id, hash)"
```

- [ ] **Step 4: 部署兩個 repo**

```bash
git checkout main && git merge --no-ff <branch> && git push origin main
cd ~/portfolio && git push origin main
```
用 `gh api repos/cholateio/<repo>/deployments` 確認兩邊 Production 皆 success 且 sha 對得上。

- [ ] **Step 5: 真機驗證（使用者操作，我無登入權限）**

1. 手機開 PWA（必要時關閉重開讓 SW 更新）→ 任一遊戲的某天
2. **刪掉一張截圖** → 列表即時移除、重整後仍不在（這是本次唯一有行為改變的路徑）
3. 再上傳兩張 → 順序正確
4. portfolio 相簿頁順序一致

- [ ] **Step 6: DB 收尾檢查**

```sql
select day_id, seq, right(hash,8) from portfolio_game_screenshots order by day_id, seq;
```
Expected：無 `id` 欄位、每 day seq 連續（刪除會造成 seq 跳號，屬預期）。

- [ ] **Step 7: LESSONS + PROJECT.toml**

只有在過程中踩到非顯然的坑才寫 LESSONS（例如 view 相依擋住 drop column——若實際發生，記一條）。`PROJECT.toml` 的 `status_note` 更新成本次結果，`updated = 2026-08-31`。

**模型建議**：Task 1（不可逆 migration）與 Task 2（破壞性路徑）用 Fable 5 / high；Task 3–4 為機械性替換，Opus 4.8 / medium 即可。升級觸發：review 對 DELETE 路徑提出 high 以上。

---

## Round 1 review 修訂（codex adversarial 2026-08-31）— 本節覆蓋上文

三個 finding 全部實查成立，以下為修正後的權威內容。

### R1 [high] 執行順序：程式碼先行，migration 最後

原 plan 讓不可逆的 migration 先跑，已部署 bundle 會送 `?id=`、且載入的列不再有 `id`。改為：

**Task 1（route）→ Task 2（client）→ Task 3（portfolio）→ 部署兩個 repo → 真機確認 PWA 已更新 → Task 4（migration）→ Task 5（spec + 收尾）。**

新版 DELETE 對 `?id=` 的處理：**不查詢 id 欄位**，直接回 409
`{ error: 'client outdated; reload the app' }`。如此 migration 前後行為一致，
不需要第二次部署，也沒有 500 窗口。

### R2 [medium] 漏掉的消費者：`deleteDayIfDraft`

`lib/games.js:104` 是 `.select('id', { count: 'exact', head: true })`。drop column
後 PostgREST 會拒絕該查詢，而該函式把 `countError` 當成「不要刪」，於是每個廢棄的
draft day 會永久殘留。改成 `.select('hash', { count: 'exact', head: true })`。

（教訓：consumer 稽核要掃 **select 字串**，不能只掃 JS property access。）

### R3 [medium] 漏掉的消費者：portfolio `ScreenshotGrid`

`~/portfolio/components/collection/ScreenshotGrid.jsx:16` 是 `key={shot.id}`。該檔
不含表名，所以原本的 grep 沒掃到。改成 `key={shot.hash}`。

（教訓：跨 repo 稽核要掃屬性用法本身，不能只掃含表名的檔案。）

### 修正後的 Task 4 migration 全文

view 對 `sc.id` 的相依會擋住 drop column，所以 `create or replace view` 必須在最前面：

```sql
-- 20260831_screenshot_natural_key.sql
-- id was a redundant surrogate: nothing FK-references this table and
-- (day_id, hash) is already unique and NOT NULL — the dedup path has always
-- keyed on it. Dropping id removes the delete-induced number gaps that made
-- the table unreadable in the dashboard.
-- Ordering is unaffected: seq (NOT NULL since _seq_b) is the sort key; ties
-- now break on hash instead of id.
-- The view is replaced FIRST: its order by references sc.id, and that
-- dependency would otherwise block the drop.

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
  order by dd.date asc, sc.seq asc, sc.hash asc
  limit 1
) s on true;

alter table portfolio_game_screenshots drop constraint portfolio_game_screenshots_pkey;
alter table portfolio_game_screenshots drop constraint portfolio_game_screenshots_day_id_hash_key;
alter table portfolio_game_screenshots add primary key (day_id, hash);
alter table portfolio_game_screenshots drop column id;
```
