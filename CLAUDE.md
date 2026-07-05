# Life Tracker

## Project goal

個人化的 mobile-first life tracking 全端應用，讓使用者用手機快速登錄/查詢生活紀錄
（睡眠、人生里程碑、動漫清單、電玩清單、待辦、圖庫），並透過自動化爬蟲每日聚合
巴哈姆特看板資訊。架構採 Next.js App Router + Supabase (PostgreSQL/Auth) +
Google Cloud Storage（圖片 thumbnail / gallery 雙 bucket），部署在 Vercel。
單一使用者導向（首頁有 5-tap 隱藏入口才到 /login），不對外公開索引（robots: noindex）。

## Stack

- Language: JavaScript（ES6+, JSX；無 TypeScript，`jsconfig.json` 用 `@/*` path alias）
- Framework: Next.js 16（App Router）+ React 19
- Datastore: Supabase（PostgreSQL，README 提到使用 RLS）
- Auth: Supabase Auth（client side session via `hooks/useAuth.js`）
- Object storage: Google Cloud Storage（`@google-cloud/storage`，bucket 動態選擇 `thumbnail` / `gallery`，SHA-256 hash 命名做 dedup）
- Styling/UI: Tailwind CSS 4（`@tailwindcss/postcss`）+ Lucide React icons + Sonner toasts
- PWA: Serwist（`@serwist/next`，`app/sw.js` 為 SW source；dev 模式關閉）
- Crawler: Puppeteer + puppeteer-extra-stealth（`scripts/crawl-to-file.mjs`，產出 `public/daily-news.json`）
- Build/run: `npm run dev` / `npm run build`（`next ... --webpack`，非 Turbopack）/ `npm run start`
- Lint: ESLint 9 + `eslint-config-next`（`npm run lint`）
- Test: 無自動測試（刻意決定）— 用 `npm run lint` + `npm run build` + `npm run dev` 手動驗證，不要新增 test framework
- CI/CD: GitHub Actions（`.github/workflows/daily-crawler.yml`，每天 UTC 10:00 / 22:00 跑爬蟲並 commit `public/daily-news.json`）；應用程式部署 Vercel

## File layout

```
life-tracker/
├── CLAUDE.md
├── README.md
├── package.json
├── jsconfig.json                 ← `@/*` → 專案根目錄 alias
├── next.config.mjs               ← 透過 Serwist 包裝 Next config
├── eslint.config.mjs
├── postcss.config.mjs
├── .env.local                    ← Supabase / GCP 環境變數（gitignored）
├── gcp-keys.json                 ← GCP service account（gitignored）
│
├── app/                          ← Next.js App Router
│   ├── layout.jsx                ← 全域 metadata、PWA manifest、no-zoom viewport
│   ├── page.jsx                  ← 首頁 grid menu，h1 五連點觸發 /login
│   ├── globals.css
│   ├── sw.js                     ← Serwist service worker source
│   ├── login/page.jsx
│   ├── sleep-tracker/page.jsx
│   ├── milestone/page.jsx
│   ├── crawler/page.jsx          ← 「巴哈日報」前端
│   ├── anime-record/page.jsx
│   ├── game-record/page.jsx
│   ├── gallery/page.jsx
│   ├── todo/page.jsx
│   └── api/
│       └── upload/route.js       ← GCS 上傳 endpoint（dynamic bucket + SHA-256 dedup）
│
├── components/
│   ├── layout/RecordPageLayout.jsx
│   └── ui/                       ← FormBase / FormInput / FormTextarea /
│                                    DatePicker / DropdownSelect / ToggleSwitch /
│                                    SubmitButton / ImageUpload / ImageUploadGallery
│
├── configs/menu.js               ← 首頁 7 個 app 的設定（名稱/路徑/icon/顏色）
├── hooks/useAuth.js              ← Supabase session 訂閱 hook
├── lib/supabase.js               ← Supabase client（anon key）
│
├── scripts/
│   ├── config.mjs                ← 爬蟲設定（看板 ID 列表 / 關鍵字過濾）
│   └── crawl-to-file.mjs         ← Puppeteer 爬蟲主程式
│
├── public/
│   ├── daily-news.json           ← 爬蟲產出，commit by CI
│   ├── manifest.json             ← PWA manifest
│   ├── intro1~3.jpg              ← README 用截圖
│   └── icons/
│
├── documents/
│   └── setup_gcp.md              ← GCP 設定步驟筆記
│
├── docs/
│   ├── decisions/                ← ADRs
│   └── plans/                    ← saved plans from superpowers
│
├── .github/workflows/
│   └── daily-crawler.yml         ← cron 0 10,22 * * *
│
└── .claude/                      ← multi-agent workflow infrastructure
```

## Coding standards

[實際 standards 列出。例：]
- [e.g. "Functions: single responsibility, <=50 lines"]
- [e.g. "No `any` types — use `unknown` + type guards"]
- [e.g. "Error handling: Result type, never raw exceptions across module boundaries"]

## Project-specific constraints

目前無強制 constraints。實際踩到地雷後再累積（格式：「不要動 X，因為會壞 Y」）。

未來如果有條目進來，記得它會觸發 kit 規則（`.claude/rules/kit-workflow.md`）的
兩個自動行為：Phase 動到列表內項目 → 必跑 phase-level review；即將動到列表內
項目 → STOP 問使用者。路徑型禁區同步加進 `.claude/protected-paths`（hook 物理執法）。

## Communication language

實做後用**繁體中文**解釋修改、操作和驗證結果。

- **一律繁體中文**：說明性文字、總結、tradeoff 分析、「我做了什麼」報告、給使用者的操作步驟、驗證結果、phase 完成回報。
- **保持英文（不翻譯）**：code、file paths、function/variable names、npm/git/CLI 指令、error messages、技術 identifier（例如 `useEffect`、`lib/nocturne.js`、`npm run lint`）。
- **表格欄位**標題用繁體中文（狀態 / 結果 / 動作）、值維持原文（file paths、status codes 等）。
- 中英混用是合理的，不要硬翻 `localStorage` 之類的技術詞。

## Tiny config tweaks — recipe, not intervention

當需要的改動是「≤ 2 行的設定 / 閾值 / 開關 / debug toggle」：

- **做這個**：直接給 recipe — 檔案路徑 + 行號 + 現值 → 建議值（如果有幾個合理選項可以一起列）。
- **不要做**：詢問「要我幫你改嗎？」、主動 Edit/Write、起 dev server 走操作步驟。

例外：使用者明確說「幫我改」/「直接動手」→ 才執行。

理由：使用者偏好自己掌控小改動，「要不要我幫你改」的來回是多餘 friction。

不適用：≥ 3 行 / 跨檔案 / 涉及邏輯改動 → 走正常實作流程（brainstorming → plan → execute）。

---

## Multi-agent kit

workflow / 派工 / review / 判斷規則由 `.claude/rules/` 每 session 自動載入
（kit-owned，由 kit repo 的 `init.sh --update` 維護，不要在本專案裡改）。
情境對應的按需文件：

| 情境 | 讀這裡 |
|------|--------|
| 卡關了 / 想宣告完成 / 猶豫要不要問 user | `.claude/docs/judgment-matrix.md` |
| 要派工給 subagent | `/kit-dispatch` skill（五種模板） |
| 要做 UI / 設計 schema / 同一 bug 連續卡 / 引入外部服務 / 定架構 | `.claude/docs/verification-signals.md`（命中哪節讀哪節） |
| 要記教訓 / 查歷史教訓 / 想改 harness 檔案 | `docs/LESSONS.md`（append；動大手術前先掃一眼）/ kit-evolution 規則（自動已載入） |
