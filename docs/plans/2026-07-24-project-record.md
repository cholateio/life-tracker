# 專案紀錄 (Project Record) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 life-tracker 新增「專案紀錄」表單頁，把一筆作品集專案寫進 Supabase 的 `portfolio_projects` 表，縮圖自動 cover 裁切為 16:9（1280×720）。

**Architecture:** 完全複製 `app/anime-record/page.jsx` 的既有流程（Canvas 前處理 → `/api/upload` 上傳 GCS → `supabase.insert`），差異只在三處：縮圖比例改 16:9、`stack` 需要一個新的 chip 多選元件、送出前多一道 slug 撞名預查。共用元件 `ImageUpload` 加上 width/height prop 並把無條件拉伸換成 cover 裁切。

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind CSS 4 · Supabase JS · lucide-react · sonner

**Spec:** [`docs/specs/2026-07-24-project-record-design.md`](../specs/2026-07-24-project-record-design.md)

## Global Constraints

- **無自動測試框架**（CLAUDE.md 明確決定）。每個 task 的驗證 = `npm run lint` + `npm run build` + `npm run dev` 手動檢查。**不要新增任何 test framework。**
- **代碼內註解一律英文**（kit 規則）。說明文字 / commit message 用繁體中文。
- 註解只寫「代碼顯示不了的」四類：不變量/外部約束、跨檔耦合、非顯然的 why、附日期收據。不寫敘述性註解。
- Build 指令是 `next build --webpack`（非 Turbopack），已寫在 `package.json`，不要改。
- `stack` 欄位**永遠送陣列**，絕不送 `null` — portfolio 的 `app/project/[slug]/page.jsx` 對 `project.stack.map(...)` 沒有 null guard。
- 既有 `ImageUpload` 消費端（`app/anime-record/page.jsx:104`、`app/game-record/page.jsx:221`）**不傳 width/height**，必須靠預設值維持 720×1280 行為不變。

## 前置：開 branch

目前在 `main`。開始前先切出 feature branch：

```bash
git checkout -b feat/project-record
```

## Phase 派工建議（kit-workflow 要求）

| Task | 建議主模型 / effort | 理由 | 升級觸發 |
|------|--------------------|------|----------|
| 1 · DB migration | Opus 4.8 / medium | 動正式資料庫、不可靜默失敗 | policy 套用後 `pg_policies` 查不到 → STOP 問 user |
| 2 · ImageUpload | Opus 4.8 / medium | 改共用元件，波及 2 個既有頁面 | 預覽框版面在兩種比例下任一壞掉 → 升 high |
| 3 · TagPicker | Fable 5 / medium | 介面已凍結的新元件，spec-locked | lint 出現 React 19 hooks 規則錯誤 → 回 Opus 4.8 |
| 4 · 頁面整合 | Opus 4.8 / medium | 多檔整合 + 端到端驗證 | RLS 或上傳任一環節失敗且非顯然 → 升 high |

**Review 規劃：** Task 1 是 migration/schema，屬 kit-workflow 定義的 sensitive path → **必跑 phase-level review，不看行數**。Task 2–4 併入結束前的 Final review（`/kit-review`），不逐 task review。

---

### Task 1: 補上 `portfolio_projects` 的 INSERT policy

**Files:**
- Modify: Supabase project `ukmcixycjqrznctudzrx`（「Life Stack」）— 無本地檔案異動

**Interfaces:**
- Consumes: 無
- Produces: `portfolio_projects` 表可被 `authenticated` 且 `auth.uid() = 'b2a314a0-7cd0-4eaf-9d2e-7b9022b1a693'` 的身分 INSERT。Task 4 的端到端驗證依賴這一條。

**背景：** 該表啟用 RLS 但只有 SELECT policy。`portfolio_anime` / `portfolio_games` 都有對應的 INSERT policy，唯獨 projects 沒有 → 不補則表單送出必被擋。

- [ ] **Step 1: 先確認現況（避免重複建立）**

用 Supabase MCP 的 `execute_sql`（project_id `ukmcixycjqrznctudzrx`）執行：

```sql
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'portfolio_projects';
```

預期輸出：只有一列 `Enable read access for all users` / `SELECT`。
若已經看到 INSERT policy → 本 task 已完成，直接跳到 Task 2。

- [ ] **Step 2: 套用 migration**

用 Supabase MCP 的 `apply_migration`（project_id `ukmcixycjqrznctudzrx`，name `enable_insert_portfolio_projects`）：

```sql
create policy "Enable insert for authenticated users only"
on public.portfolio_projects
for insert to authenticated
with check (auth.uid() = 'b2a314a0-7cd0-4eaf-9d2e-7b9022b1a693'::uuid);
```

- [ ] **Step 3: 驗證 policy 真的存在**

再跑一次 Step 1 的查詢。

預期輸出：兩列 —
```
Enable read access for all users   | SELECT
Enable insert for authenticated users only | INSERT
```

只看到一列 → 套用失敗，STOP 並回報，不要繼續往下做。

- [ ] **Step 4: 確認資料沒被動到**

```sql
select count(*) from portfolio_projects;
```

預期輸出：`12`（與遷移前相同）。

- [ ] **Step 5: 無 commit**

本 task 不產生檔案異動，不需要 commit。

---

### Task 2: `ImageUpload` 支援自訂比例 + cover 裁切

**Files:**
- Modify: `components/ui/ImageUpload.jsx`（第 12 行 signature、第 29-38 行 canvas 邏輯、第 87 行預覽框 className、第 118 行提示文字）

**Interfaces:**
- Consumes: 無
- Produces: `<ImageUpload label={string} onChange={(file: File) => void} width={number = 720} height={number = 1280} />`。Task 4 以 `width={1280} height={720}` 呼叫它。

**背景：** 現行實作硬編 720×1280 並用 `ctx.drawImage(img, 0, 0, W, H)` 無條件拉伸（原檔第 37 行的中文註解自己就寫了「若原圖非 9:16 會被拉伸」）。改成 cover 裁切後，`anime-record` / `game-record` 上傳非 9:16 的圖會從「變形」變成「置中裁切」——這是使用者已同意的行為改變。

- [ ] **Step 1: 改 function signature**

把第 12 行：

```jsx
export default function ImageUpload({ label = 'Photo Record', onChange }) {
```

改成：

```jsx
export default function ImageUpload({ label = 'Photo Record', onChange, width = 720, height = 1280 }) {
```

- [ ] **Step 2: 換掉 canvas 尺寸與繪製邏輯**

把第 29-38 行（從 `// 2. 建立 Canvas 並強制設定目標解析度` 到 `ctx.drawImage(img, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);`）整段替換為：

```jsx
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                // Cover crop, not stretch: consumers render the stored file without
                // object-cover (portfolio ProjectItem uses only w-full), so the file's
                // own ratio drives their layout and any distortion ships to production.
                const scale = Math.max(width / img.width, height / img.height);
                const drawW = img.width * scale;
                const drawH = img.height * scale;
                ctx.drawImage(img, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
```

注意：原本的 `TARGET_WIDTH` / `TARGET_HEIGHT` 兩個常數宣告一併刪除，後續沒有其他地方引用它們。

- [ ] **Step 3: 讓預覽框比例跟著 prop 走**

把第 85-92 行整段：

```jsx
            <div
                onClick={!isProcessing ? triggerFileSelect : undefined}
                className={`relative w-48 aspect-9/16 rounded-2xl overflow-hidden border-2 border-dashed transition-all flex items-center justify-center cursor-pointer ${
                    previewUrl
                        ? 'border-[#3f4a4e]/20 shadow-xl shadow-[#3f4a4e]/10'
                        : 'border-[#3f4a4e]/40 hover:bg-[#3f4a4e]/5 active:scale-95'
                }`}
            >
```

替換為：

```jsx
            <div
                onClick={!isProcessing ? triggerFileSelect : undefined}
                /* Inline style, not a Tailwind class: aspect-[w/h] can't be composed from
                   runtime values — Tailwind extracts class names statically at build time. */
                style={{ aspectRatio: `${width} / ${height}` }}
                className={`relative ${
                    height > width ? 'w-48' : 'w-full max-w-sm'
                } rounded-2xl overflow-hidden border-2 border-dashed transition-all flex items-center justify-center cursor-pointer ${
                    previewUrl
                        ? 'border-[#3f4a4e]/20 shadow-xl shadow-[#3f4a4e]/10'
                        : 'border-[#3f4a4e]/40 hover:bg-[#3f4a4e]/5 active:scale-95'
                }`}
            >
```

- [ ] **Step 4: 提示文字改成插值**

把第 118 行：

```jsx
                        <span className="text-xs mt-2 opacity-60">720 x 1280 (JPG)</span>
```

改成：

```jsx
                        <span className="text-xs mt-2 opacity-60">{width} x {height} (JPG)</span>
```

- [ ] **Step 5: 跑 lint**

```bash
npm run lint
```

預期：無 error（warning 若與本次改動無關可忽略）。

- [ ] **Step 6: 跑 build**

```bash
npm run build
```

預期：`✓ Compiled successfully`，退出碼 0。

- [ ] **Step 7: 手動回歸既有頁面**

```bash
npm run dev
```

開 `http://localhost:3000/anime-record`，檢查：
1. 預覽框仍是直式 9:16、寬度仍為 `w-48`（視覺上與改動前一致）。
2. 空狀態提示文字仍顯示 `720 x 1280 (JPG)`。
3. 選一張圖，預覽出得來、沒有報錯。

再開 `http://localhost:3000/game-record`，點「Create New Record」展開表單，確認預覽框同樣正常。

任一項不符 → 停下修正，不要往下做。

- [ ] **Step 8: Commit**

```bash
git add components/ui/ImageUpload.jsx
git commit -m "feat(ui): ImageUpload 支援自訂比例並改為 cover 裁切"
```

---

### Task 3: 新增 `TagPicker` 元件

**Files:**
- Create: `components/ui/TagPicker.jsx`

**Interfaces:**
- Consumes: `Label` 與 `commonInputStyles`（`components/ui/FormBase.jsx` 的 named exports）
- Produces: `<TagPicker label={string} value={string[]} options={string[]} onChange={(tags: string[]) => void} />` — 受控元件，default export。Task 4 以 `value={formData.stack}` / `options={stackOptions}` 呼叫它。

**背景：** portfolio 的標籤頁用 `.contains('stack', [tag])` 精確比對，拼寫不一致（`supabase` vs `Supabase`）會讓該標籤頁查不到資料。所以新增 tag 時要做大小寫不敏感的合併。

- [ ] **Step 1: 建立檔案**

Create `components/ui/TagPicker.jsx`：

```jsx
// components/ui/TagPicker.jsx
'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Label, commonInputStyles } from './FormBase';

export default function TagPicker({ label = 'Tags', value = [], options = [], onChange }) {
    const [draft, setDraft] = useState('');
    // Tags added this session, so a newly created tag stays visible as a chip
    // after being deselected (options only carries what the DB already knows).
    const [extra, setExtra] = useState([]);

    const allOptions = [...options, ...extra.filter((t) => !options.includes(t))];

    const toggle = (tag) => {
        onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);
    };

    const addDraft = () => {
        const raw = draft.trim();
        if (!raw) return;
        // Case-insensitive merge: portfolio's tag pages match with
        // .contains('stack', [tag]), so 'supabase' alongside 'Supabase' would
        // split one tag into two, one of which lists nothing.
        const existing = allOptions.find((t) => t.toLowerCase() === raw.toLowerCase());
        const tag = existing ?? raw;
        if (!existing) setExtra((prev) => [...prev, tag]);
        if (!value.includes(tag)) onChange([...value, tag]);
        setDraft('');
    };

    return (
        <div>
            <Label>{label}</Label>

            <div className="flex flex-wrap gap-2 mt-2">
                {allOptions.map((tag) => {
                    const selected = value.includes(tag);
                    return (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => toggle(tag)}
                            className={`px-3 py-1.5 rounded-full text-sm font-bold transition-all active:scale-95 ${
                                selected
                                    ? 'bg-[#3f4a4e] text-[#E5E0DC]'
                                    : 'border-2 border-dashed border-[#3f4a4e]/30 text-[#3f4a4e]/60'
                            }`}
                        >
                            {tag}
                        </button>
                    );
                })}
                {allOptions.length === 0 && (
                    <span className="text-sm font-bold text-[#3f4a4e]/40">尚無標籤，請於下方新增</span>
                )}
            </div>

            <div className="flex items-center gap-3 mt-4">
                <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        // Enter inside a <form> would submit it; this input is not a submit path.
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addDraft();
                        }
                    }}
                    placeholder="新增標籤"
                    className={commonInputStyles}
                />
                <button
                    type="button"
                    onClick={addDraft}
                    aria-label="新增標籤"
                    className="shrink-0 p-2 rounded-full bg-[#3f4a4e]/10 text-[#3f4a4e] transition-all active:scale-95"
                >
                    <Plus size={20} />
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: 跑 lint**

```bash
npm run lint
```

預期：無 error。

- [ ] **Step 3: 跑 build**

```bash
npm run build
```

預期：`✓ Compiled successfully`，退出碼 0。

（此元件此刻還沒有消費端，實際互動行為在 Task 4 Step 7 一起驗證。）

- [ ] **Step 4: Commit**

```bash
git add components/ui/TagPicker.jsx
git commit -m "feat(ui): 新增 TagPicker 標籤多選元件"
```

---

### Task 4: 專案紀錄頁面 + 首頁 menu 入口

**Files:**
- Create: `app/project-record/page.jsx`
- Modify: `configs/menu.js`（第 1 行 import、陣列末端新增一筆）

**Interfaces:**
- Consumes: Task 2 的 `<ImageUpload width height>`、Task 3 的 `<TagPicker>`、Task 1 的 INSERT policy
- Produces: 路由 `/project-record`；首頁第 9 個 tile

- [ ] **Step 1: 建立頁面**

Create `app/project-record/page.jsx`：

```jsx
// app/project-record/page.jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

import RecordPageLayout from '@/components/layout/RecordPageLayout';
import { FormInput } from '@/components/ui/FormInput';
import { FormTextarea } from '@/components/ui/FormTextarea';
import DatePicker from '@/components/ui/DatePicker';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import SubmitButton from '@/components/ui/SubmitButton';
import ImageUpload from '@/components/ui/ImageUpload';
import TagPicker from '@/components/ui/TagPicker';
import { useAuth } from '@/hooks/useAuth';

// portfolio's ProjectItem renders the thumbnail with only w-full — no object-cover,
// no fixed height — so the stored file's own ratio decides that card's grid height.
const THUMB_WIDTH = 1280;
const THUMB_HEIGHT = 720;

const slugify = (s) =>
    s
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

export default function ProjectRecordPage() {
    const { isAuthenticated, isChecking } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [stackOptions, setStackOptions] = useState([]);
    const [slugTouched, setSlugTouched] = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        slug: '',
        intro: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        stack: [],
        github: '',
        demo: '',
        featured: false,
        imageFile: null,
    });

    useEffect(() => {
        const loadStackOptions = async () => {
            const { data, error } = await supabase.from('portfolio_projects').select('stack');
            // Failure leaves options empty; custom tags still work, so don't block the form.
            if (error) return;
            const tags = [...new Set((data ?? []).flatMap((row) => row.stack ?? []))];
            setStackOptions(tags.sort((a, b) => a.localeCompare(b)));
        };
        loadStackOptions();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => {
            if (name === 'title' && !slugTouched) {
                return { ...prev, title: value, slug: slugify(value) };
            }
            return { ...prev, [name]: value };
        });
    };

    const handleSlugChange = (e) => {
        setSlugTouched(true);
        setFormData((prev) => ({ ...prev, slug: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const slug = formData.slug.trim();
            if (!slug) throw new Error('Slug 不可為空');

            // portfolio's getProjectBySlug uses .single(), and the column has no
            // unique constraint — a duplicate slug breaks that project's detail page.
            const { data: clash, error: clashError } = await supabase
                .from('portfolio_projects')
                .select('slug')
                .eq('slug', slug);
            if (clashError) throw clashError;
            if (clash.length > 0) throw new Error(`Slug「${slug}」已存在，請換一個`);

            let uploadedImageUrl = null;

            if (formData.imageFile) {
                toast.loading('Uploading image...', { id: 'upload-toast' });

                const apiData = new FormData();
                apiData.append('file', formData.imageFile);
                apiData.append('folder', 'projects');

                const {
                    data: { session },
                } = await supabase.auth.getSession();
                const uploadRes = await fetch('/api/upload', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
                    body: apiData,
                });

                if (!uploadRes.ok) {
                    throw new Error('圖片上傳失敗');
                }

                const result = await uploadRes.json();
                uploadedImageUrl = result.url;

                toast.dismiss('upload-toast');
            }

            const payload = {
                title: formData.title.trim(),
                slug,
                // Always an array: portfolio's detail page maps over stack with no null guard.
                stack: formData.stack,
                intro: formData.intro.trim() || null,
                description: formData.description.trim() || null,
                date: formData.date,
                thumbnail: uploadedImageUrl,
                github: formData.github.trim() || null,
                demo: formData.demo.trim() || null,
                featured: formData.featured,
            };

            const { error } = await supabase.from('portfolio_projects').insert([payload]);

            if (error) throw error;

            toast.success('專案紀錄已儲存！');
            setTimeout(() => router.push('/'), 1500);
        } catch (error) {
            console.error('Submit error:', error);
            toast.dismiss('upload-toast');
            toast.error(error.message || '儲存失敗，請稍後再試。');
        } finally {
            setLoading(false);
        }
    };

    return (
        <RecordPageLayout title="Project Record">
            <form onSubmit={handleSubmit} className="flex flex-col gap-8 grow">
                <ImageUpload
                    label="Project Thumbnail"
                    width={THUMB_WIDTH}
                    height={THUMB_HEIGHT}
                    onChange={(file) => setFormData((prev) => ({ ...prev, imageFile: file }))}
                />
                <FormInput
                    label="Title"
                    name="title"
                    placeholder="專案名稱 (如: Life Tracker)"
                    value={formData.title}
                    onChange={handleChange}
                    required
                />
                <FormInput
                    label="Slug"
                    name="slug"
                    placeholder="life-tracker"
                    value={formData.slug}
                    onChange={handleSlugChange}
                    required
                />
                <FormInput
                    label="Intro"
                    name="intro"
                    placeholder="卡片上的一句話介紹"
                    value={formData.intro}
                    onChange={handleChange}
                />
                <FormTextarea
                    label="Description"
                    name="description"
                    placeholder="詳情頁的說明段落"
                    rows={4}
                    value={formData.description}
                    onChange={handleChange}
                />
                <DatePicker
                    label="Date"
                    value={formData.date}
                    onChange={(val) => setFormData((prev) => ({ ...prev, date: val }))}
                />
                <TagPicker
                    label="Stack"
                    value={formData.stack}
                    options={stackOptions}
                    onChange={(tags) => setFormData((prev) => ({ ...prev, stack: tags }))}
                />
                <FormInput
                    label="GitHub"
                    name="github"
                    placeholder="https://github.com/... (可選)"
                    value={formData.github}
                    onChange={handleChange}
                />
                <FormInput
                    label="Demo"
                    name="demo"
                    placeholder="https://... (可選)"
                    value={formData.demo}
                    onChange={handleChange}
                />
                <ToggleSwitch
                    label="Featured"
                    checked={formData.featured}
                    onChange={(val) => setFormData((prev) => ({ ...prev, featured: val }))}
                />
                <div className="grow" />
                {isChecking ? (
                    <div className="h-15 flex items-center justify-center opacity-50">檢查權限中...</div>
                ) : isAuthenticated ? (
                    <SubmitButton loading={loading} text="UPLOAD" />
                ) : (
                    <div className="flex items-center justify-center bg-[#3f4a4e]/5 text-[#3f4a4e]/50 border-2 border-dashed border-[#3f4a4e]/20 p-4 rounded-2xl font-bold tracking-widest text-sm uppercase">
                        <span>Admin Login Required</span>
                    </div>
                )}
            </form>
        </RecordPageLayout>
    );
}
```

- [ ] **Step 2: 加入首頁 menu 入口**

`configs/menu.js` 第 1 行的 import 加上 `FolderGit2`：

```js
import { Moon, Landmark, Flag, Bot, Gamepad2, Tv, ListTodo, Dices, FolderGit2 } from 'lucide-react';
```

在 `MENU_CONFIG` 陣列最後一筆（夜籤）之後新增：

```js
    {
        name: '專案紀錄',
        desc: 'Project Record',
        href: '/project-record',
        icon: FolderGit2,
        color: '#0f766e',
    },
```

- [ ] **Step 3: 跑 lint**

```bash
npm run lint
```

預期：無 error。

- [ ] **Step 4: 跑 build**

```bash
npm run build
```

預期：`✓ Compiled successfully`，且 route 清單中出現 `/project-record`，退出碼 0。

- [ ] **Step 5: 手動驗證 — 版面與自動 slug**

```bash
npm run dev
```

開 `http://localhost:3000`，確認多了「專案紀錄」tile，點進去後檢查：
1. 縮圖預覽框是**橫式** 16:9（不是直式），空狀態文字顯示 `1280 x 720 (JPG)`。
2. Title 打「Life Tracker Two」→ Slug 欄位自動變成 `life-tracker-two`。
3. 手動把 Slug 改成 `abc` → 再改 Title → Slug **保持** `abc` 不被覆寫。
4. Stack 區塊列出既有標籤 chip（`C++` / `Electron` / `FFT` / `GCP` / `Grafana` / `JS` / `OpenGL` / `Supabase` / `Three.js` / `TS`），點擊可切換選取狀態。
5. 在新增框輸入 `supabase`（小寫）按 ADD → 應該是既有的 `Supabase` chip 被選取，**不會**多出一個小寫的新 chip。
6. 輸入 `Python` 按 ADD → 出現新 chip 且為選取狀態。

- [ ] **Step 6: 手動驗證 — 圖片裁切**

選一張**非 16:9** 的截圖上傳（例如把視窗截成 1600×850，或任意手邊的方形圖）。

檢查預覽框內的畫面**沒有被壓扁或拉長**（人臉/文字比例正常），只是邊緣被裁掉。
若手邊真的找不到非 16:9 的圖：改用瀏覽器 devtools 截一張 800×800 的頁面截圖即可。

- [ ] **Step 7: 手動驗證 — 端到端寫入**

登入後（首頁 h1 五連點 → `/login`），填完表單送出。檢查：
1. Toast 顯示「專案紀錄已儲存！」，1.5 秒後跳回首頁。
2. 用 Supabase MCP `execute_sql` 查最新一筆：

```sql
select id, title, slug, stack, intro, description, date, thumbnail, github, demo, featured
from portfolio_projects order by id desc limit 1;
```

預期：`stack` 是陣列（例如 `["JS","Supabase"]`）而非 null；未填的 `github` / `demo` 是 `null` 而非空字串。

3. 把回傳的 `thumbnail` URL 貼進瀏覽器，圖片開得起來。用以下指令確認尺寸：

```bash
curl -sL '<thumbnail URL>' -o /tmp/thumb.jpg && file -b /tmp/thumb.jpg
```

預期輸出包含 `1280x720`。

4. 重新開表單，用**同一個 slug** 再送一次 → 應該跳 error toast「Slug「xxx」已存在，請換一個」，且**沒有**新增第二筆資料（再查一次 count 確認）。

- [ ] **Step 8: 清掉驗證資料**

上一步寫進去的是正式資料庫，測試筆要刪掉（除非那是你真的想留的專案）：

```sql
delete from portfolio_projects where id = <剛才那筆的 id>;
```

- [ ] **Step 9: Commit**

```bash
git add app/project-record/page.jsx configs/menu.js
git commit -m "feat: 新增專案紀錄頁面與首頁入口"
```

---

## 收尾

- [ ] **Final review**：跑 `/kit-review`（full profile → `/codex:review`）。本次改動涵蓋 4 個檔案 + 一條 RLS policy，超過「自行驗證即可」的門檻。
- [ ] **PROJECT.toml**：本次不跨越階段、不新增起始指令、不新增付費服務 → **不需要更新**。
- [ ] 合併回 `main` 的方式由使用者決定（直接 merge / 開 PR）。
