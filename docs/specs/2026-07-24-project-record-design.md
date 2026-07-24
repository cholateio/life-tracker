---
title: 專案紀錄 (Project Record) — Design
date: 2026-07-24
status: designed
---

# Overview

在 life-tracker 新增第 9 個 app「專案紀錄」，讓手機端把一個作品集專案寫進
Supabase 的 `portfolio_projects` 表，供 portfolio 站（cholate.dev，
repo `/home/cholate/portfolio`）讀取渲染。行為與既有的動漫紀錄 / 電玩紀錄
同構：單向 insert、無編輯、無列表。

唯一的特化需求：**專案縮圖必須是 16:9**，因為 portfolio 的卡片元件不裁切、
版面高度由檔案原生比例決定。

# Investigation findings（設計前的事實基礎）

## 目標表：`portfolio_projects`

Supabase project「Life Stack」(`ukmcixycjqrznctudzrx`)，與 `portfolio_anime` /
`portfolio_games` 同庫。現有 12 筆。

| 欄位 | 型別 | 必填 | 用途 |
|------|------|------|------|
| `id` | bigint identity | 自動 | — |
| `title` | text | NOT NULL | 卡片與詳情頁標題 |
| `slug` | text | NOT NULL | 路由 `/project/<slug>` |
| `stack` | text[] | 可空 | 技術標籤 |
| `intro` | text | 可空 | 卡片副標 + OG description |
| `description` | text | 可空 | 詳情頁段落（純文字，非 markdown） |
| `date` | date | 可空 | portfolio 的排序依據（desc） |
| `thumbnail` | text | 可空 | GCS 公開 URL |
| `github` | text | 可空 | null 時 UI 顯示 "Not on Github" |
| `demo` | text | 可空 | null 時整區隱藏 |
| `featured` | boolean, default false | NOT NULL | 首頁精選區 |
| `created_at` | timestamptz, default now() | 自動 | — |

兩個消費端的約束：

- `portfolio/app/project/[slug]/page.jsx` 對 `project.stack.map(...)` 沒有 null
  guard → **`stack` 寫 null 會讓該專案詳情頁 crash**。本表單一律送陣列。
- `portfolio/services/portfolio.js` 的 `getProjectBySlug` 用 `.single()` →
  **重複 slug 會讓詳情頁報錯**。DB 沒有 unique constraint。

## 圖片比例：16:9（1280×720）

- `portfolio/components/ProjectItem.jsx:9-11` — `width={1280} height={720}`，
  className 僅 `w-full min-h-40`，**無 `object-cover`、無固定高度** → 卡片高度
  由檔案原生比例決定，非 16:9 會讓 grid 高度參差。
- `portfolio/app/project/[slug]/page.jsx:130-131` — 同為 1280×720。
- 實測既有檔案：`1008×567`、`1919×1079`，皆為 1.778。

## 阻擋點：缺 INSERT policy

`portfolio_projects` 啟用 RLS，但只有 SELECT policy。`portfolio_anime` /
`portfolio_games` 都有 `auth.uid() = 'b2a314a0-…'` 的 INSERT policy，唯獨
projects 沒有 → 不補則表單送出必被 RLS 擋下。

# Decisions made during brainstorming

1. **非 16:9 的圖用 cover 置中裁切**（不是拉伸、不是留白）。使用者確認上傳來源
   一律是電腦截圖、不會有直式手機圖，所以裁切量在正常情況下趨近於零；cover 的
   價值在於視窗截圖（如 1600×850）不會變形也不會留白。不做「裁切/留白」切換 UI。
2. **cover 統一套用到所有 ImageUpload 消費端**（anime-record / game-record 一併
   改變行為）。現行的無條件拉伸視為 bug 而非 feature。使用者已同意此行為改變。
3. **stack 用「既有 tag 點選 + 可自訂新增」**。純文字輸入會因拼寫不一致
   （`supabase` vs `Supabase`）讓 portfolio 的 `.contains('stack', [tag])`
   標籤頁查不到資料；固定清單則擋住新技術。
4. **slug 由 title 自動 kebab-case、欄位可手動覆寫**。現有 12 筆 slug 全部都是
   title 的 kebab-case，無一例外。
5. **slug 撞名用 client 端預查擋下，不加 DB unique constraint**。加 constraint
   是更根本的解，但會改動既有表結構，不納入本次範圍。
6. **RLS 遷移由 Claude 套用**，複製 anime 表同款 policy。

# Architecture

## File layout

新增：
```
app/project-record/page.jsx        ← 表單頁（含 slugify helper）
components/ui/TagPicker.jsx        ← stack chip 多選 + 自訂新增
```

修改：
```
components/ui/ImageUpload.jsx      ← 加 width/height prop + cover 裁切
configs/menu.js                    ← 新增第 9 個 tile
```

Supabase：新增一條 INSERT policy（見下）。

不新增 dependency。

## Data flow

```
選圖 → Canvas cover 裁切為 1280×720 → toBlob('image/jpeg', 0.85) → File
     → POST /api/upload  (folder='projects', bucketType 用預設 thumbnail)
     → https://storage.googleapis.com/cholate-thumbnail/projects/<sha256>.jpg
     → 送出前先查 slug 是否已存在
     → supabase.from('portfolio_projects').insert([payload])
     → toast + router.push('/')
```

與 `app/anime-record/page.jsx` 的流程逐步同構，含 `Authorization: Bearer
<access_token>` header 與 `useAuth` 的登入 gate。

## `components/ui/ImageUpload.jsx` 的改動

新增兩個 prop，預設值保持既有呼叫端行為不變：

```js
export default function ImageUpload({
    label = 'Photo Record',
    onChange,
    width = 720,
    height = 1280,
})
```

裁切邏輯取代現行第 38 行的無條件 `drawImage(img, 0, 0, W, H)`：

```js
const scale = Math.max(width / img.width, height / img.height);
const drawW = img.width * scale;
const drawH = img.height * scale;
ctx.drawImage(img, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
```

預覽框：現行硬編的 `w-48 aspect-9/16` 改為由 prop 導出——
`style={{ aspectRatio: `${width} / ${height}` }}`（Tailwind 不能安全地組動態
class name），寬度用 `height > width ? 'w-48' : 'w-full max-w-sm'`，讓橫式比例
不會擠成一條細帶。空狀態的提示文字 `720 x 1280 (JPG)` 改成插值。

## `components/ui/TagPicker.jsx`（新元件）

```jsx
<TagPicker label="Stack" value={string[]} options={string[]} onChange={(tags) => …} />
```

- 受控元件，自己不管資料來源；`options` 由頁面注入。
- 已選 chip = slate 填色（`bg-[#3f4a4e]` + 白字），未選 = dashed 邊框，沿用
  專案既有視覺語言。點擊切換選取。
- 底下一個輸入框 + ADD 按鈕新增自訂 tag。新增規則：
  - trim 後為空 → 忽略。
  - **與既有 option 只差大小寫 → 直接選取既有那個，不新建**（消滅
    `supabase` / `Supabase` 這類分裂）。
  - 否則加進 options 並選取。

## `app/project-record/page.jsx`

`'use client'`，wrap 在 `<RecordPageLayout title="Project Record">`。

**Mount 時載入 tag options**：`supabase.from('portfolio_projects').select('stack')`
→ flatten + 去重 + 排序。查詢失敗時 options 退回 `[]`（仍可自訂新增，不阻斷表單）。

**Slug 自動生成**：

```js
const slugify = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
```

用一個 `slugTouched` flag：使用者手動改過 slug 欄位後，title 就不再覆寫它。

**送出前的 slug 預查**：`select('slug').eq('slug', slug)` 有結果 → `toast.error`
並中止（不上傳圖片、不 insert）。單使用者情境下 TOCTOU 競態可忽略。

**表單欄位 → payload**：

| UI 元件 | 欄位 | 轉換 |
|---------|------|------|
| `ImageUpload` (width=1280, height=720) | `thumbnail` | 上傳後的 GCS URL；沒選圖則 null |
| `FormInput` Title (required) | `title` | 原值 |
| `FormInput` Slug (required) | `slug` | 原值（已 slugify） |
| `FormInput` Intro | `intro` | 空字串 → null |
| `FormTextarea` Description | `description` | 空字串 → null |
| `DatePicker` Date（預設今天） | `date` | 原值 |
| `TagPicker` Stack | `stack` | **一律陣列**，沒選就 `[]` |
| `FormInput` GitHub | `github` | trim 後空 → null |
| `FormInput` Demo | `demo` | trim 後空 → null |
| `ToggleSwitch` Featured | `featured` | boolean |

## `configs/menu.js`

```js
{
    name: '專案紀錄',
    desc: 'Project Record',
    href: '/project-record',
    icon: FolderGit2,   // lucide-react
    color: '#0f766e',   // teal，與現有 8 色皆有區隔
}
```

## Supabase migration

```sql
create policy "Enable insert for authenticated users only"
on public.portfolio_projects
for insert to authenticated
with check (auth.uid() = 'b2a314a0-7cd0-4eaf-9d2e-7b9022b1a693'::uuid);
```

僅新增一條 policy：不動欄位、不動資料、現有 SELECT policy 不變。此遷移必須
**先於**實作驗證執行，否則無法確認寫入路徑真的可用。

# Verification

專案無自動測試（刻意決定），驗證方式：

1. `npm run lint` — 無新增 error。
2. `npm run build` — 通過。
3. `npm run dev` 手動走一次：登入 → 選一張非 16:9 的截圖 → 確認預覽框裡的圖
   沒有變形（cover 生效）→ 填完送出 → 到 Supabase 確認該筆資料的 `stack` 是
   陣列、`thumbnail` URL 可開啟且尺寸為 1280×720。
4. 回歸檢查：`/anime-record` 與 `/game-record` 的預覽框仍是 9:16、上傳仍成功。

# Out of scope

- 編輯 / 刪除既有專案（本頁只 insert，與 anime-record 一致）。
- 對 `slug` 加 DB unique constraint。
- portfolio repo 的任何改動（`ProjectItem` 的 `object-cover`、TAG_CATEGORIES
  分類更新等，都不在本次範圍）。
- gallery bucket（專案圖走預設的 thumbnail bucket）。
- 專案列表 / 查詢頁。
