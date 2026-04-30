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
├── USAGE.md                      ← 使用者操作手冊（multi-agent kit 配套）
├── package.json
├── jsconfig.json                 ← `@/*` → 專案根目錄 alias
├── next.config.mjs               ← 透過 Serwist 包裝 Next config
├── eslint.config.mjs
├── postcss.config.mjs
├── setup.sh                      ← multi-agent kit 環境檢查
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

未來如果有條目進來，記得它會觸發 "Multi-Agent Workflow Rules" 裡的兩個自動規則：
- Phase 動到列表內項目 → MUST run `/codex:review`
- 即將動到列表內項目 → STOP 問使用者再繼續

---

# Multi-Agent Workflow Rules

> 以下為通用協作規則。除非專案有特殊需求，否則不需要編輯。

## 三方協作概念

This project orchestrates three external AI capabilities:

- **Gemini CLI** (research scout): 蒐集網路資源、整合外部資訊。**只做研究，不寫 code、不 review**。
- **Superpowers** (architect + worker): brainstorm、寫 plan、執行 plan。Claude 的主要規劃和實作流程。
- **Codex Plugin** (reviewer): 跨模型 code review、adversarial challenge。**只做 review，不寫 code**。

Main Claude orchestrates these three based on task type.

## Task-size classification (重要)

The task classifier hook (`.claude/hooks/classify-task.sh`) may inject a
`TASK_CLASSIFICATION` hint into context. Honor it.

If no hint is present, classify yourself using these rules:

| Signal | Classification |
|--------|---------------|
| User said "just do it" / "quick" / "small" | `small_task` |
| User said "full workflow" / "review the plan" | `explicit_full` |
| Estimated change < 30 lines, single file, single concern | `small_task` |
| UI tweak / CSS / copy edit / formatting | `small_task` |
| Bug fix without business logic change | `small_task` |
| New feature, single file, < 100 lines | `medium_task` |
| New feature, multiple files OR new dependencies | `large_task` |
| Refactor, schema migration, auth/payment changes | `large_task` |

### What to run for each classification

**small_task**: Just do it.
- Skip research-before-planning, superpowers brainstorming, superpowers writing-plans
- Make the change directly
- After change: brief summary
- NO automatic codex review (unless task touched business logic — see "Final review trigger" below)

**medium_task**: Light workflow.
- Skip research (unless task involves a new external API/library)
- Use superpowers:writing-plans (skip brainstorming for clarity-low cases)
- Run `/codex:review` on the plan
- User approves
- Implement
- Final review per the rules below

**large_task**: Full workflow.
- Trigger `research-before-planning` skill if task involves: external libraries,
  security, performance-critical paths, novel architecture
- Use superpowers:brainstorming → writing-plans
- Run `/codex:review` on the plan (and `/codex:adversarial-review` if high-stakes)
- User approves
- superpowers:executing-plans with phase-level review (see below)
- Final review

### Phase-level review during executing-plans

When superpowers completes a phase, decide whether to run `/codex:review`:

**MUST review** (no exceptions):
- Phase touched: auth, authorization, session management
- Phase touched: payment, billing, money calculations
- Phase touched: data migration, schema changes
- Phase modified anything in "Project-specific constraints"

**Recommend review (default to yes, ask if unclear)**:
- Phase touched: business logic that users will perceive
- Phase touched: algorithms, state machines, concurrency
- Phase touched: input validation, security boundaries
- Phase ≥ 100 lines

**Skip review**:
- Phase only changed: UI / styling / docs
- Phase only changed: simple glue code, CRUD, type definitions
- Phase < 50 lines and no business logic

### Final review trigger

Before declaring the entire task complete, evaluate:

```
Did this session modify business-logic-bearing files (.py, .ts, .js, .go, .rs, etc.)
that haven't been reviewed by /codex:review yet?
```

If YES → run `/codex:review` on the full change set before summarizing.

The Stop hook (`.claude/hooks/verify-final-review.sh`) enforces this — if you
forget, the hook will block your turn-end and remind you.

## Cross-model isolation principle

The PRIMARY question is "is the reviewer a different model than the writer?",
not "which specialist fits this task?".

- **Code written by main Claude → reviewed by Codex Plugin**: real isolation ✓
- **Code written by codex (via /codex:rescue) → NOT reviewed by codex again**:
  same model = no isolation. Defer to user judgment or accept the original.
- **Plan written by main Claude/superpowers → reviewed by Codex Plugin**: ✓

### Anti-pattern warning

NEVER do "same model writes + same model reviews". This was a documented
mistake from earlier kit versions. Codex writing code AND codex reviewing
code provides almost no isolation value.

## When to engage research-before-planning

Trigger when ANY of these apply for a `large_task`:

- Task involves a library/framework you've not seen used in this codebase
- Task involves security-sensitive territory (auth, crypto, secrets)
- Task involves performance-critical paths (you'd benefit from current benchmarks)
- Task involves novel architecture (you'd benefit from seeing how others did it)

DO NOT trigger for:
- Tasks within established patterns of this codebase (existing project)
- `small_task` or `medium_task` (overhead not justified)
- Tasks where the user already provided clear technical direction

## When to STOP and ask the user

Stop and ask the user (do NOT auto-proceed) when:

- Research-scout findings suggest a meaningfully better approach than the
  current plan assumed → reconfirm direction
- `/codex:review` flagged a `critical` or `high` issue you can't resolve
  from your context
- `/codex:adversarial-review` challenged a fundamental premise of the plan
- Phase will modify > [PROJECT-SPECIFIC LINE THRESHOLD, default 100] lines
- About to delete or rewrite > 30 existing lines
- Touches anything in "Project-specific constraints"
- Codex/Gemini are unavailable (quota/auth) — ask whether to proceed without
  cross-model review or wait

## Service unavailability handling

When a tool fails (codex quota exhausted, gemini API error, etc.):

1. **Report clearly to the user** — never silently skip
2. **Categorize the failure**:
   - Quota exhausted → suggest waiting or skipping this review
   - Auth issue → tell user to check `codex login` / `GEMINI_API_KEY`
   - Network → suggest retry
3. **Ask the user explicitly**:
   - (a) Skip this review and proceed (less safe — explain implication)
   - (b) Wait and retry in N minutes
   - (c) For research scout failures only: proceed without research
     (acceptable — research is nice-to-have, not gate)

Critical: do NOT auto-fall-back from `/codex:review` to "Claude self-review"
silently. That breaks the isolation guarantee. The user must explicitly accept
this fallback.

## Skills available

- `research-before-planning` — pre-brainstorming research via gemini scout

(Most workflow logic is in CLAUDE.md and hooks, not skills, in v3.)

## Subagents available

- `gemini-research-scout` — wraps gemini CLI for web research only

## Hooks active (see `.claude/settings.json`)

- `classify-task.sh` (UserPromptSubmit): auto-tags task size
- `verify-final-review.sh` (Stop): blocks turn-end if business logic
  unreviewed

## What main Claude does NOT have available (intentionally)

- `codex-coder` / `codex-reviewer` subagents — replaced by official
  Codex Plugin (`/codex:review`, `/codex:rescue`, etc.)
- Bash wrapper for codex — Codex Plugin handles delegation
- A `plan-with-review` skill — superpowers' writing-plans replaces it,
  combined with auto-trigger of `/codex:review` on the resulting plan
