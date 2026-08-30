# 遊戲回憶相簿 · 正式規格 v2.0

> 取代 `docs/ideas/gaming-record.md`（v1.0 草稿）。v1 是發想稿，本檔是與使用者
> 逐項討論後的**定案**。實作以本檔為準；v1 僅供追溯設計脈絡。
>
> 定案日期：2026-08-26

## 0. 與 v1 的差異總覽

| 項目 | v1 | v2 定案 |
|------|----|---------|
| 兩端分工 | 未指定 | **life-tracker = 記錄端，portfolio = 呈現端** |
| 遊戲狀態 | playing/paused/archived 三態 + 封存儀式 | **移除 status**。書架按最後遊玩時間排序，久沒玩自然沉底；rating / final_note / bookmark 隨時可填 |
| counter | 六型 enum + per-type 預設組 + 改型規則 | **單一 `counter_label` text**（null = 不數） |
| 平台 | 埋在 purchase jsonb | **`platform` 升為一級欄位**（purchase 移除 platform） |
| 每日時數 | days.hours + total_hours 雙軌 | **砍 days.hours**，只留 games.total_hours 手填 |
| 舊資料遷移（v1 §6） | journal 文字解析 | **整段取消**——舊 portfolio_games 僅 2 筆，捨棄重建 |
| 動畫（v1 §7） | 沿用同模型 | **本期不做**。schema 命名保持中性，未來可複用 |
| 推播、跨遊戲學習字典、表單內遊戲切換器、連續 N 天、草稿暫存層、截圖手動排序、is_highlight、下載 UI | 有 | **全部砍除**（見 §7 不做清單） |

v1 的設計原則（§0）**全數沿用**，並新增一條：

7. **不養狀態機。** 任何能從資料衍生的東西（最後遊玩、已隔 N 天、封面 fallback）
   一律計算取得，不落地、不要求使用者手動維護狀態。

## 1. 系統分工與可見性

- **life-tracker**（私人 PWA，mobile-first）：新增遊戲、每日補記、截圖上傳、
  遊戲資料編輯、刪除。所有**寫入**只發生在這裡。
- **portfolio**（cholate.dev，公開站）：呈現。
  - `/collection` games tab：**公開**（現狀不變）。
  - `/collection/game/[slug]` 單一遊戲相簿頁：**半私人**——cookie gate
    （`site_access`，走 `lib/access.js` 既有機制）。
- 兩專案共用同一個 Supabase 與 GCS。
- 已知取捨（沿用 portfolio 2026-07-23 定位「防隨手逛到即可」）：cookie gate
  只擋 UI，anon key 可直讀 REST；GCS 物件本身是公開 URL。資料層不做真防護。

## 2. 資料模型（Supabase）

### 2.1 `portfolio_games`（重建，表名沿用）

表名沿用的原因：portfolio 首頁 Stats 的 `getTableCount('portfolio_games')` 零修改。

```sql
create table portfolio_games (
  id               bigint generated always as identity primary key,
  title            text not null,
  slug             text not null unique,      -- 自動由 title 產生，衝突加序號
  platform         text,                      -- PS5 / Steam / Switch…
  studio           text,
  release_date     date,
  counter_label    text,                      -- 例「死了幾次」；null = 這款不數東西
  activity_options text[] not null default '{}',
  rating           smallint check (rating between 1 and 10),  -- 隨時可填可改
  total_hours      numeric(6,1),              -- 手填（PS5 個人檔案查得到），無自動加總
  is_favorite      boolean not null default false,
  cover_image      text,                      -- null → view 以第一張截圖 fallback
  purchase         jsonb,                     -- { date, price, currency }（無 platform）
  bookmark         jsonb,                     -- { saved_at, where, next_step, controls_note }，隨時可填
  final_note       text,                      -- 通關/棄坑心得，隨時可填
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
```

### 2.2 `portfolio_game_days`

```sql
create table portfolio_game_days (
  id            bigint generated always as identity primary key,
  game_id       bigint not null references portfolio_games(id) on delete cascade,
  date          date not null,
  is_draft      boolean not null default true,  -- 開表單即建 row（draft）；明確儲存或首張截圖落地時轉 false。清理只刪 draft，「零輸入可存」的紀錄因此安全（2026-08-26 review r3）
  temperature   text check (temperature in ('high','stuck','lost','wow','chill')),
  counter_value bigint,                       -- money 類可負可大
  progress_note text,
  activities    text[] not null default '{}',
  one_line      text check (char_length(one_line) <= 120),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (game_id, date)                      -- 同時充當 game_id 的 FK index
);
```

- **最小可儲存單位**＝`(game_id, date)`，其餘全空是合法紀錄。
- **row 懶建立**：進表單不建 row；第一張截圖上傳或按「存起來」才建。瀏覽日期
  因此不留垃圾、id 不跳號（2026-08-27）。
- **溫度 code 是契約，label 只是顯示**：改名不動 DB。2026-08-27 改為
  開心/卡關/枯燥(`lost`)/驚艷/放空 時，全表 temperature 皆為 null，
  無歷史語意被重寫（已查證）。
- **activities 刻意是自由字串、無 code**：它是「當天做了什麼」的事實紀錄。
  日後修改遊戲的選項組**不會、也不應**改寫既有日紀錄——舊字串留著才是對的。
- 重複 `(game_id, date)` → 前端進入編輯模式（upsert）。
- temperature 五值**不可增減、不可排成好壞刻度**（沿用 v1 §1.3 全部語意）。

### 2.3 `portfolio_game_screenshots`

```sql
create table portfolio_game_screenshots (
  id           bigint generated always as identity primary key,
  day_id       bigint not null references portfolio_game_days(id) on delete cascade,
  original_url text not null,                 -- 原圖（JPG，永久保留）
  view_url     text not null,                 -- 長邊 1920 WebP q85
  thumb_url    text not null,                 -- 長邊 640 WebP q75
  hash         text not null,                 -- 原檔 SHA-256
  taken_at     timestamptz,                   -- EXIF，可 null（僅保存，不參與排序）
  seq          integer not null,              -- client 指定的上傳序號（同 day 內遞增；rollout 期間暫為 nullable）
  caption      text,                          -- 永遠選填，事後補（P2）
  created_at   timestamptz not null default now(),
  unique (day_id, hash)                       -- 同日去重；同時充當 day_id 的 FK index
);
```

- **顯示排序**：`seq asc nulls last, id asc`。無手動排序。`taken_at` 僅保存不參與排序——
  截圖一律由平台 App 匯出到手機，EXIF 時間是匯出時間（秒級精度、大量撞秒），不可靠
  （2026-08-31 實測 31 張中 14 張撞秒，且無 Make/Model/SubSec）。
  （client 選檔時依檔名排序後配發 seq = 該 day 目前最大 seq + 1 起遞增；逐張上傳自然遞增；
  dedup 命中保留既有 seq；client 未帶 seq 時 server 以 max+1 補位。）

### 2.4 View：`portfolio_games_overview`

書架查詢的唯一入口，衍生欄位不落地：

```sql
create view portfolio_games_overview as
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

單使用者規模（幾十款 × 幾百天）聚合成本趨近零，換到永不失同步。

### 2.5 RLS

三表相同：`select` 開放 anon（§1 的已知取捨）；`insert / update / delete`
僅 authenticated（`to authenticated`）。View 繼承底層表權限。

### 2.6 部署順序

舊 `portfolio_games`（2 筆）直接 drop 重建，**無資料搬移**。切換後至 P1 完成前，
portfolio games tab 因欄位名變更會暫時空清單（`executeQuery` fallback，不炸），
屬預期空窗。

## 3. 截圖管線

來源情境：PS5 手把截圖 → PS App 分享到手機（1080p JPG，約 1–2MB）→
life-tracker PWA 從手機相簿多選上傳。

### 3.1 `POST /api/screenshots`（life-tracker 新 endpoint）

一次一張 + `day_id`，server 端一條龍（縮圖在 server 做的原因：手機
`canvas.toBlob('image/webp')` 在 Safari 支援不穩；且每張只上傳一次省行動流量）：

```
1. Bearer token 驗證（同 /api/upload 的 getUser 模式）
2. SHA-256 → 查 (day_id, hash) 已存在？→ 是則回傳既有 row（冪等去重）
3. sharp：讀 EXIF taken_at + rotate() 自動轉正
   → view（長邊 1920 WebP q85）+ thumb（長邊 640 WebP q75）
4. 上傳 GCS gallery bucket：
   games/{game_id}/{hash}.jpg
   games/{game_id}/{hash}_1920.webp
   games/{game_id}/{hash}_640.webp
5. 以使用者 token 建 per-request supabase client insert row → 回傳完整 row
```

新依賴：`sharp`（Next.js 官方影像最佳化同款，Vercel 原生支援）。
單張處理約 1–2 秒，50 張約一分多鐘，背景佇列進行、不阻塞表單填寫。

### 3.2 `DELETE /api/screenshots?id=`

**只刪 DB row，不碰 GCS**（2026-08-26 codex adversarial review 定案）：hash 命名
的物件會被同 `(game, hash)` 的其他 row 共用，任何「先查引用再刪物件」都是
check-then-delete 競態（併發 POST 可在計數後寫入新引用）。孤兒物件留給 §3.3
的 prefix purge 統一清——單人規模的暫存孤兒成本遠低於相簿破圖。

### 3.3 刪整款遊戲

DB：delete game → cascade 清 days / screenshots。
GCS：呼叫 `DELETE /api/screenshots?game_id=`——server **先驗證該 game 已不存在
於 DB**（活遊戲回 409），才刪 `games/{game_id}/` 整個 prefix。歷來孤兒物件在
此一併清空。

### 3.4 上傳 UX

- 多選 50+；前端並發 3 的佇列逐張打 API，顯示 `12/50` 進度；失敗留佇列可重試。
- 上傳期間可繼續填溫度/活動等欄位，互不阻塞。
- 不進入任何逐張編輯流程（v1 §3.4 原則沿用）。

## 4. life-tracker 頁面（重寫 `app/game-record/`）

### 4.1 進入頁＝遊戲清單

- 讀 `portfolio_games_overview`，按 `last_played_at desc nulls last`。
- 每列：封面小圖（`cover_resolved`）、標題、平台 badge、距今 N 天。
- 點一款 → 補記表單；頂部「＋ 新增遊戲」；列上另有入口進遊戲設定頁。

### 4.2 新增遊戲（目標 30 秒）

```
① 名稱（必填，自動 slug）
② 平台
③ 這款要數什麼？（counter_label 文字，可留空）
④ 做了什麼選項（通用預設：推主線、打 Boss、練等、收集、亂晃；可增刪）
⑤ 封面（可跳過 → 自動用第一張截圖）
   「更多」收合：studio / release_date / 購買資訊
```

驗證：僅 title 必填；slug 衝突自動加序號；其餘全可空白。

### 4.3 補記表單（固定結構，所有遊戲一致）

- 日期預設**昨天**，可往前調，無上限。
- 進入時即 upsert day row（截圖因此隨選隨傳）。
- `(game_id, date)` 已有紀錄 → 載入既有資料成編輯模式。

```
① 截圖    整批上傳（§3.4）
② 溫度    五選一，單選，可不選
③ 數字    game.counter_label 有值才渲染：label + 加減鈕（可點數字直接鍵入）
          附選填 progress_note 短欄位
④ 做了什麼 activity_options 複選 + 自由輸入
⑤ 一句話  選填，單行，120 字
[ 存起來 ]
```

格號固定：③ 不渲染時 ④ 仍稱「做了什麼」，維持肌肉記憶。零輸入可存。

### 4.4 遊戲設定頁

rating / final_note / bookmark / total_hours / 基本 metadata 隨時可編輯。
**沒有封存動作**——玩夠了就是不再有新紀錄。刪除遊戲入口也在此（需確認對話）。

## 5. portfolio 頁面

規範：查詢一律收進 `services/portfolio.js` + `executeQuery`；gate 判斷只走
`lib/access.js` 的 `isValidToken()`（portfolio CLAUDE.md constraints）。

### 5.1 `/collection` games tab（改查詢，不改呈現）

改讀 `portfolio_games_overview`：`title, is_favorite, slug, platform,
cover_resolved, last_played_at`，按 `last_played_at desc`。Marquee + WaveList
不動；清單項連結到 `/collection/game/[slug]`。

### 5.2 `/collection/game/[slug]`（新頁，cookie gate）

- 標頭兩行：`{title}` ／ `{total_hours} 小時 · ★{rating} · {first}–{last}`，
  其餘 metadata（platform / studio / 購買資訊 / final_note）收合。
- 日期分組區塊（新→舊）：

```
{date}  {溫度標籤}  ......  {counter_label} {counter_value}
{activities 小標籤列}
[ 截圖網格 ]
{one_line}          ← 有才顯示
{progress_note}     ← 有才顯示，樣式弱於 one_line
```

- 截圖網格：一律等比不裁切；手機 2 欄／桌機 3–4 欄；thumb 640 lazy load +
  佔位避免版面跳動；點開看 view 1920；caption 點按/hover 浮現，**圖上不疊字**；
  原圖連結開新分頁即下載。
- 純文字日（無截圖）正常顯示，不做任何「資料不完整」暗示。

## 6. 分期

| 階段 | 範圍 | 里程碑 |
|------|------|--------|
| P0 | Supabase 三表 + view + RLS；life-tracker 遊戲清單 + 新增遊戲 + 補記表單 + `/api/screenshots` | **可開始日常記錄** |
| P1 | portfolio 書架查詢改版 + `/collection/game/[slug]` | **可回看相簿** |
| P2 | 「已隔 N 天」前情提要 banner（portfolio 遊戲頁頂部，距最後紀錄 > 7 天才顯示，純衍生）；caption 補填 UI（life-tracker 補記表單點縮圖）；溫度分布比例條 | 用一陣子再做 |

那年今日、年度回顧、搜尋、動畫沿用：不排期。

## 7. 明確不做（v1 §8 沿用並擴充）

v1 原清單全數沿用：逐張標記流程、心得引導問句、連續紀錄獎勵、依類型分裂表單、
溫度五值增減或分數化、要求補舊資料的提示。本次新增：

- ❌ status 狀態機與封存儀式（含「回來了/玩夠了」選擇畫面）
- ❌ 推播提醒（web push 基礎設施，自用 app 不值）
- ❌ 跨遊戲學習字典（activity 選項高頻建議）
- ❌ 表單內遊戲切換器（同日多款＝返回清單再進一次）
- ❌ 標頭「連續第 N 天」
- ❌ 獨立草稿暫存層（day row 先建 + 截圖即傳即存已覆蓋）
- ❌ 截圖手動拖曳排序與 is_highlight（`seq` 只記上傳順序，無 UI 調整）
- ❌ 每日 hours（只留遊戲總時數手填）
- ❌ genre 標籤、成就/白金紀錄、自訂書櫃
- ❌ journal 舊資料遷移

理由同 v1：**這些都會把「記錄」變成「任務」，而任務會被放棄**；
或是為單人規模不存在的問題預付複雜度。

## 8. 開發注意

- life-tracker 新依賴：`sharp`。GCS 憑證沿用現有 env；無新付費服務。
- `portfolio_anime` 與 anime-record 頁面本期**完全不動**。
- portfolio 端改動含 cookie gate 相關讀取路徑 → 依 kit 規則屬 sensitive，
  review 不可跳過。
- 兩專案各自部署；順序 P0（life-tracker + DB）→ P1（portfolio），
  中間 games tab 空窗屬預期（§2.6）。
