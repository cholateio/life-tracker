---
title: 夜籤 (Nocturne) — Design
date: 2026-05-01
status: implemented
spec_source: ../../nocturne.md
---

# Overview

夜籤是一個每晚 7pm 後抽一張主題卡的個人儀式器。本 design doc 記錄 brainstorming
階段確定的「怎麼做」，搭配 `nocturne.md`（「做什麼」）一起閱讀。實作細節在後續
plan 階段展開，不在此處。

# Decisions Made During Brainstorming

1. **Persistence**: 不上 Supabase，全部用 `localStorage`（zero infra）— weights 是 5 個固定 key 的數字 vector、draws 是純 client 短期歷史。換裝置不同步是接受的 trade-off，符合「抽完就走」的儀式哲學。
2. **抽籤演算法**: 簡單 cumulative weight in pure JS (~10 行)，client 端執行，無 server。
3. **7pm 換日邏輯**: 純 client，single helper `tonightDate(now)`：若 `now.getHours() >= 19` 回今天日期，否則回昨天。Render 與 localStorage 寫入都用同一個 helper。
4. **UI 版型**: 單頁垂直捲動（Option A）— 主視覺區（按鈕或卡片）→ 歷史 strip → 權重設定（折疊）。沒有 tab、沒有 modal、沒有抽屜。
5. **主題文案資料源**: 寫進 `configs/nocturne-themes.js`（pure JS export），與 `configs/menu.js` 同層、同 pattern。Version-controlled，要改文案直接 PR。
6. **自由之夜的視覺**: Poster-style（Option B）— 沒有 card 外框、主題名 hero text、單行宣告，視覺上明確跟其他 4 主題不同類，把「今晚不需要結構」用版面說出來。

# Architecture

## File layout

新增：
```
app/nocturne/page.jsx             ← 主 page，含所有 sub-component（一個檔案）
configs/nocturne-themes.js        ← 5 主題的文案 + 預設權重 + theme color
lib/nocturne.js                   ← pure helpers (tonightDate / drawTheme / load+save)
```

修改：
```
configs/menu.js                   ← 新增 nocturne 條目
```

不新增 dependency。所有實作走專案既有 stack（Next App Router + React + Tailwind + lucide-react）。

## Data model (localStorage)

兩個 key，命名空間用 `nocturne:` 前綴避免污染其他 feature 的 localStorage：

```
nocturne:weights  → JSON.stringify({ dev: 25, study: 20, play: 20, solo: 20, free: 15 })
nocturne:draws    → JSON.stringify([
                       { night_date: "2026-05-01", theme: "dev", drawn_at: "2026-05-01T11:23:00.000Z" },
                       { night_date: "2026-04-30", theme: "free", drawn_at: "..." },
                       ...
                     ])
```

- 主題 id 用英文 slug：`dev | study | play | solo | free`（穩定 identifier，不依賴中文字串）
- `night_date` 是 `YYYY-MM-DD` 字串（local timezone），由 `tonightDate(now)` 算出
- `drawn_at` 是 ISO string，純 audit 用，不參與業務邏輯
- 讀取時若 key 不存在 → 用預設權重 / 空 draws 陣列
- 寫入 draws 時順手 prune 30 天前的：`now - night_date > 30 days` 的 entry 刪掉
- 不做 schema versioning（lightweight；未來真的要 migrate 再說）

## Pure logic (`lib/nocturne.js`)

純函式 + localStorage IO，跟 React 解耦，方便單獨閱讀：

```js
export function tonightDate(now = new Date())
  // → 'YYYY-MM-DD'。now.getHours() >= 19 ? today : yesterday

export function drawTheme(weights, rng = Math.random)
  // → theme id ('dev' | 'study' | ...)
  // 簡單 cumulative：sum 後在 [0, sum) 抽一個值，累加找到第一個跨過的 theme
  // Defensive: 若 sum === 0，uniform 隨機（不 crash）

export function loadWeights()       // → { dev, study, play, solo, free }；缺 key 時填 default
export function saveWeights(w)      // → void

export function loadDraws()         // → array sorted desc by night_date
export function recordDraw(theme, now = new Date())
  // → 新的 draws array (saved to localStorage); 包含 prune 30 天邏輯

export const DEFAULT_WEIGHTS = { dev: 25, study: 20, play: 20, solo: 20, free: 15 }
```

`recordDraw` 內部也用 `tonightDate(now)` 算 night_date — 保證寫入和顯示用同一個換日規則。

## UI structure (`app/nocturne/page.jsx`)

`'use client'`，wrap 在 `<RecordPageLayout title="夜籤">` 裡（既有 layout 提供背景色、header、Toaster）。

state：
- `weights` — 整個物件
- `draws` — 整個 array
- `tonightDraw` — derived：`draws.find(d => d.night_date === tonightDate(now))` 或 null
- `now` — `useState(() => new Date())`，**只在 mount 取一次**（per nocturne.md edge case：6:59 開、7:00 自然跨時不刷新按鈕，下次開 app 才更新 — 不開 setInterval）
- `settingsOpen` — bool，預設 false

render（從上到下）：

```
<RecordPageLayout title="夜籤">
  {/* 主視覺區 */}
  {tonightDraw
    ? (theme === 'free'
        ? <FreeNightPoster theme={...} />
        : <ThemeCard theme={...} />)
    : (now.getHours() >= 19
        ? <DrawButton onDraw={handleDraw} />
        : <PreNightPlaceholder hour={now.getHours()} />)}

  {/* 歷史 strip — 7 天，含空白格 */}
  <HistoryStrip draws={draws} />

  {/* 權重設定 — 折疊 */}
  <WeightSettings
    weights={weights}
    open={settingsOpen}
    onToggle={() => setSettingsOpen(o => !o)}
    onChange={handleWeightChange}
  />
</RecordPageLayout>
```

Sub-components 都寫在同一個 `page.jsx` 裡（per 專案 convention，single feature = single file；估計總共 ~300-400 行，可接受）。

`handleDraw`：
1. `const theme = drawTheme(weights)`
2. `const newDraws = recordDraw(theme)` (helper 內部 prune + save)
3. `setDraws(newDraws)`
4. 可選：`toast.success` 一個輕量提示（已經有 `<Toaster>` mounted）

`handleWeightChange(themeId, newValue)`：
- update local state
- 同步 `saveWeights(updatedWeights)` — 不 debounce（localStorage 寫入是同步、極快、且使用者調權重頻率極低，無 perf 顧慮；省一個 useEffect / timer）

### 各 sub-component 規格

**`<DrawButton>`**：大 tap target（佔約 60% viewport），透明底 + slate `border-2 border-[#3f4a4e]` + slate 字 + `Dices` icon，跟 game-record「Create New Record」CTA 同視覺語言。文字「抽今晚」。`active:scale-[0.98]` 觸覺反饋；不加額外動畫。

**`<ThemeCard>`**（4 主題共用，自由除外）：
- 透明底 + slate `border-2 border-[#3f4a4e]` + 圓角，與 game-record 卡片同視覺語言
- 主題名（heading）— 用 `theme.color` 染字，是卡片裡唯一的主題色點綴
- 「入場動作」block — slate `bg-[#3f4a4e]` 整塊填色 + 白字（卡片內視覺最醒目，per spec line 38 AC）
- 「主場規則」段落 — slate body text

**`<FreeNightPoster>`**：
- 沒有 border、沒有 card chrome
- 主題名「自由之夜」hero text 置中、`tracking-[0.3em]`
- 一行宣告（從 `theme.mainRule` 渲染）
- 上下各一條 `w-12` dashed mini-divider 做視覺標點
- 留白拉開上下空間

**`<HistoryStrip>`**：
- 7 個小 cell 一字排開（最近 7 晚）
- 每 cell：日期數字 + 中央一個小圓 dot
- 已抽 = slate `border-2 border-[#3f4a4e]`、未抽 = `border-2 border-dashed border-[#3f4a4e]/20`
- 主題色只出現在 dot；cell 邊框 / 背景全 slate（與 game-record 視覺語言一致）
- 不可點、不展開（spec 明確排除統計分析）

**`<WeightSettings>`**：
- Collapsed by default：一行 `⚙ 權重設定 ▼`
- Expanded：5 個 row，每個 row = 主題名 + 數字輸入或 +/- 按鈕（plan 階段定 input 形式）
- 不強制總和 = 100（spec line 36 AC：「總和不必為 100」）
- 顯示當前 sum，但不擋使用者
- 不檢查 weight ≥ 0（client 端 input 自然限制即可，UI 不出現負號）

## 主題色彩（提案，可調）

放在 `configs/nocturne-themes.js` 裡，使用者後續調整不需改 code 結構：

| Theme | id | Default weight | Color | 直觀詞 |
|---|---|---|---|---|
| 開發之夜 | `dev` | 25 | `#2d3748` | 沉著、專注 |
| 學習之夜 | `study` | 20 | `#2c7a7b` | 清明、teal |
| 娛樂之夜 | `play` | 20 | `#dd6b20` | 暖橘、能量 |
| 獨處之夜 | `solo` | 20 | `#6b46c1` | 紫、內省 |
| 自由之夜 | `free` | 15 | `#94a3b8` | slate-400（poster 不顯色，僅 HistoryStrip dot 用）|

Menu item 本身（在 `configs/menu.js` 的 nocturne 條目）色彩：`#4a3f6b`（深紫，呼應「夜」），icon 用 lucide-react 的 `Dices`（與 DrawButton 內 icon 一致）。

# Edge cases (recap & implementation behavior)

| Spec edge case | 實作行為 |
|---|---|
| 7pm 邊界 6:59→7:01 雙抽 | 接受。`tonightDate` 6:59 算昨天、7:01 算今天 → 不同 PK，兩筆都進 draws |
| 沒抽的晚上 | history 該日 cell 渲染為空白格 |
| 權重全為 0 | `drawTheme` defensive：sum=0 → uniform。不擋 UI |
| 時區 / 系統時間被改 | 不處理，用 device local time |
| 6:59 開 app、7:00 自然跨時 | 不刷新（mount-time `now` 取一次） |
| 自由之夜結果頁格式 | 走 `<FreeNightPoster>`，不套 `<ThemeCard>` |

# Implementation choices (resolved during build)

設計階段沒卡的小事，實作後的具體決定：

- **抽籤動畫**：無。`active:scale-[0.98]` 觸覺反饋 + `toast.success('籤已抽出')` 即可
- **WeightSettings input 形式**：`<input type="number" min={0} step={1}>`，固定 `w-20`，slate 透明邊框
- **「7pm 前」placeholder**：套用 game-record 的 disabled-state pattern（`bg-[#3f4a4e]/5 border-2 border-dashed border-[#3f4a4e]/20`），文案「尚未到開放時間 / 7pm 後解鎖今晚的籤（還有約 X 小時）」
- **「入場動作」block 視覺**：slate 整塊填色 (`bg-[#3f4a4e]`) + 白字。卡片內 contrast 最高的元素
- **HistoryStrip 空白格**：dashed slate border (`border-2 border-dashed border-[#3f4a4e]/20`)
- **State init pattern**：受 React 19 / React Compiler 的 `react-hooks/set-state-in-effect` lint rule 約束，採用 lazy initializer (`useState(() => loadX())`) + `mounted` gate + `useEffect` 內 `init()` wrapper 觸發 hydration，避免 SSR 不一致

# Out of scope (recap from nocturne.md)

明確不做（plan 階段也不能偷加）：

- 任何完成 / 打勾 / 進度追蹤
- 重抽機制
- 連續同主題的提醒 / 慶祝
- 通知 / streak / 成就
- 跨主題切換偵測
- 帳號系統
- 匯出 / 統計分析報表
- 權重 0 = 暫時關閉某主題的特殊處理
