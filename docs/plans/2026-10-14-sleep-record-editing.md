# Sleep Record Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 睡眠頁可以在 App 內補上「忘了按起床」、修改／刪除已存紀錄，並用「卡片上的空格」取代在 DB 預建空白列。

**Architecture:** 不改 schema。`life_sleep` 的列狀態由 nullable 欄位推導（session / placeholder / complete，定義見 Task 1）。純時間計算抽到 `lib/sleep-time.js`（無 import，node 可直接載入驗證），資料存取抽到 `lib/sleep.js`（沿用 `lib/games.js` 的 `{ data, error }` 慣例）。UI 拆到 `components/sleep-tracker/`，`app/sleep-tracker/page.jsx` 只剩狀態與流程接線。新增／修改共用同一個表單（`SleepRecordSheet`）：有 `id` 就 update，沒有 `id` 時若該日期已有 placeholder 就填進它，否則 insert。

**Tech Stack:** Next.js 16 App Router、React 19、Supabase（`@supabase/supabase-js` ^2.89，project `ukmcixycjqrznctudzrx`）、Tailwind 4、lucide-react、sonner。

**Spec:** 無正式 spec；需求來自 2026-10-14 對話（使用者同意的三點方向，見下方「設計決策」）。

## 背景

- 2026-10-13：使用者忘了按「起床」，改用「補紀錄」→ `insert` 一筆新列，原本的 session 列仍開著（`page.jsx:231` 只 insert），最後到 Supabase 手動修。
- 手動修完後留下 id 291：`date=2026-10-14`、`sleep_time/wake_time/total` 全 null。**這是使用者刻意留給 10/14 的待填列，絕對不可刪除或被程式自動清掉。**
- 現況 `handleWake` 抓「最新一筆 `wake_time IS NULL`」，會把 placeholder 當 session（`sleep_time` null → `page.jsx:36` 的 `split` 爆掉）；session 沒結束又按睡覺會產生永遠開著的孤兒，之後某次忘按睡覺時起床會接到孤兒，算出 <24h 的錯誤時數並靜默寫入。

## Global Constraints

- 無自動測試框架（CLAUDE.md 刻意決定）：驗證 = `npm run lint` + `npm run build` + 純函式用 `node` 一次性檢查 + 使用者手機實測 + 唯讀 SQL 查 DB。**不要新增 test framework。**
- 不改 schema、不寫 migration、不新增依賴（pnpm 專案）。
- 唯一的 DB 是正式資料；執行者**不可**對 `life_sleep` 做任何寫入測試，寫入驗證只由使用者在 App 上操作，執行者事後用唯讀 SELECT 確認。
- **任何程式路徑都不得自動刪除 placeholder 列**（id 291 為現存實例）。刪除只能由使用者在表單按「刪除這筆」並通過 `window.confirm`。
- 代碼內註解一律英文，只寫不變量／跨檔耦合／非顯然 why；UI 文字繁體中文。
- 時間一律 Asia/Taipei；DB `time` 欄位存台北牆上時間，`date` 是**起床日**。

## 設計決策（2026-10-14 與使用者確認方向；細節為本 plan 預設，review 時可推翻）

| 決策 | 選擇 | 理由 |
|------|------|------|
| 每日待填格 | 只做在畫面（7 天卡片的「–」可點），不在 DB 預建列 | 按睡覺時不知道起床日；預建列會讓起床邏輯與統計全部失準（對話已討論） |
| 有 session 開著時按「補紀錄」 | 直接打開該 session 的表單（標題「補上起床」） | 正是 10/13 事故的路徑，從入口擋掉重複列 |
| 有 session 開著時按「睡覺」 | 跳出選擇：「補上它的起床時間」/「改成從現在開始」/ 關閉 | 取代原先提的「超過 20 小時才問」：任何未結束 session 再按睡覺都是異常，不需要閾值；「改成從現在開始」更新同一列，不產生孤兒 |
| 一天有多筆 | 點卡片先列出當天各筆讓使用者選，另有「＋ 新增一筆」 | 保留午睡情境 |
| 可否改日期 | 可以，週幾隨日期重算 | 表單本來就有 DatePicker，成本為零 |
| 新增時撞到同日 placeholder | 填進 placeholder（update），不 insert | 使用者 10/14 的 291 要被「填上」而不是旁邊多一列 |
| placeholder 可否在 UI 刪除 | 可以，但必須在表單按刪除 + confirm | 留給使用者自己決定；程式永不自動刪 |
| 編輯時秒數 | 表單是 `HH:MM`，存回變 `HH:MM:00` | `total` 本來就只算到分鐘（`calculateDurationMinutes` 忽略秒），無資訊損失 |

## Plan review（codex adversarial，2026-10-14）

| # | 發現 | 處置 |
|---|------|------|
| 1 | 兩台裝置同時按睡覺可產生兩筆 session（讀後寫非原子） | **不修**：單人使用、需同時在兩台裝置按；根治要 partial unique index（schema 變更），成本不成比例 |
| 2 | 「補紀錄」讀 state，首次載入前或讀取失敗時 `openSession` 為 null → 開空白表單 → 重演 10/13 重複列 | **已修**：`handleBackfill` 改為當下重查 DB；`refresh` 失敗時保留舊 state |
| 3 | placeholder 填寫為讀後寫，併發時可能覆寫 291 | **已修（便宜部分）**：update 加上 `sleep_time/wake_time IS NULL` 條件並確認影響 1 列，否則報錯不 insert；不做 RPC |
| 4 | 衝突框開著時 session 在別處被結束，「改成從現在開始」會改壞完成列且顯示成功 | **已修**：`restartSession` 加 `wake_time IS NULL` 條件；所有 mutation 經 `expectOneRow` 確認影響 1 列（同時擋下登入過期時 RLS 靜默 0 列的假成功） |
| 5 | `DatePicker` 在 UTC 負時區會把 `YYYY-MM-DD` 解析成前一天 | **不修**：裝置在台北（UTC+8）；`DatePicker` 是共用元件，超出本次範圍 |

## 執行模型建議

| Task | 主模型 / effort | 理由 | 升級觸發 |
|------|-----------------|------|----------|
| 1–3 | Opus 5.5 / medium | 介面與程式碼已在 plan 定稿，屬 spec-locked 實作 | lint/build 同一錯誤連 2 次、或 supabase 查詢語意與預期不符 → Fable 5.1 / high |
| 4 | Opus 5.5 / low | 冒煙截圖與文件 | 畫面與改前不一致且說不出機制 → 升 medium |

## Review Focus

1. **placeholder（291）被點開補填** → 必須 update id 291，10/14 不得多出第二列；從「補紀錄」按鈕或日期改成 10/14 的新增路徑也一樣。→ Task 1 `saveCompleteRecord` + Task 4 手測 A。
2. **只有 placeholder、沒有 session 時按起床** → 顯示「找不到睡覺中的紀錄」，不得 crash、不得寫入 291。→ Task 1 `fetchOpenSession` 排除 placeholder + Task 4 手測 F。
3. **session 開著再按睡覺** → 出現選擇框；「改成從現在開始」後總列數不變、`sleep_time` 與 `created_at` 更新。→ Task 3 `handleSleep` + Task 4 手測 B。
4. **跨午夜的 session 用 banner 補起床**（例 23:40 睡、07:10 起）→ `total = 450`，日期預設今天。→ Task 1 node 檢查 + Task 4 手測 C。
5. **睡覺時間 = 起床時間** → 擋下（「睡覺與起床時間相同」），不寫入 `total = 0`。→ Task 3 `handleSave` + Task 1 node 檢查。

---

### Task 1: `lib/sleep-time.js`（純函式）+ `lib/sleep.js`（資料存取）

**Files:**
- Create: `lib/sleep-time.js`
- Create: `lib/sleep.js`

**Interfaces:**
- Produces（`lib/sleep-time.js`）：`getTaipeiTime(): 'HH:MM:SS'`、`getTaipeiToday(): 'YYYY-MM-DD'`、`getWeekdayFromDate(date): '週X'`、`calculateDurationMinutes(start, end): number`、`lastNDates(n): string[]`、`toHHMM(time|null): string`、`formatDuration(minutes): string`、`formatTaipeiMonthDay(timestamp): string`、`buildCompleteFields({ date, sleep, wake, dayType }): { date, weekday, sleep_time, wake_time, day_type, total }`
- Produces（`lib/sleep.js`）：`isPlaceholder(row)`、`fetchRecordsInRange(from, to)`、`fetchOpenSession()`（`data` 為一列或 `null`）、`startSession(sleepTime, dayType)`、`restartSession(id, sleepTime, dayType)`、`saveCompleteRecord(id|null, fields)`、`deleteRecord(id)`；皆回傳 supabase `{ data, error }`

- [ ] **Step 1: 建立 `lib/sleep-time.js`**

```js
// lib/sleep-time.js
// Pure time/date helpers for the sleep tracker. Keep this file import-free so
// `node` can load it directly for one-off checks (project has no test runner).
// All "now"/"today" values are Asia/Taipei; life_sleep time columns hold Taipei wall-clock time.

export const getTaipeiTime = () =>
    new Date().toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Taipei',
        hour12: false,
    });

export const getTaipeiToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

// Local-midnight Date is only used to read the weekday; no timezone shift involved.
export const getWeekdayFromDate = (dateStr) =>
    new Date(`${dateStr}T00:00:00`).toLocaleDateString('zh-TW', { weekday: 'short' });

// Wake earlier than sleep means the session crossed midnight; sessions are assumed < 24h.
// Seconds are ignored.
export const calculateDurationMinutes = (startTime, endTime) => {
    const parseMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const start = parseMinutes(startTime);
    let end = parseMinutes(endTime);
    if (end < start) end += 24 * 60;

    return end - start;
};

// YYYY-MM-DD strings for the last n days ending at today (Taipei), oldest first
export const lastNDates = (n) => {
    const base = new Date(`${getTaipeiToday()}T00:00:00Z`);
    const dates = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(base);
        d.setUTCDate(d.getUTCDate() - i);
        dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
};

export const toHHMM = (time) => (time ? time.slice(0, 5) : '');

export const formatDuration = (minutes) => `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分`;

export const formatTaipeiMonthDay = (timestamp) =>
    new Date(timestamp).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });

const withSeconds = (time) => (time.length === 5 ? `${time}:00` : time);

// sleep / wake accept 'HH:MM' (form input) or 'HH:MM:SS' (DB / getTaipeiTime).
export const buildCompleteFields = ({ date, sleep, wake, dayType }) => {
    const sleepTime = withSeconds(sleep);
    const wakeTime = withSeconds(wake);
    return {
        date,
        weekday: getWeekdayFromDate(date),
        sleep_time: sleepTime,
        wake_time: wakeTime,
        day_type: dayType,
        total: calculateDurationMinutes(sleepTime, wakeTime),
    };
};
```

- [ ] **Step 2: 建立 `lib/sleep.js`**

```js
// lib/sleep.js
// Data access for life_sleep. Every function returns the raw supabase { data, error } shape; callers toast.
//
// Row states are derived from nullable columns (there is no status column):
//   session      sleep_time set,  wake_time null — opened by 睡覺, closed by 起床 or the editor
//   placeholder  sleep_time null, wake_time null — user-made slot for a date (e.g. id 291 for 2026-10-14);
//                code must never delete one on its own
//   complete     wake_time set
// `date` is the WAKE date (Taipei); a session normally has no date until it is closed.
import { supabase } from '@/lib/supabase';

const COLUMNS = 'id, date, sleep_time, wake_time, total, day_type, created_at';

export const isPlaceholder = (row) => !row.sleep_time && !row.wake_time;

export async function fetchRecordsInRange(fromDate, toDate) {
    return supabase
        .from('life_sleep')
        .select(COLUMNS)
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('created_at', { ascending: true });
}

// Placeholders are excluded: they have no sleep_time to measure from, so 起床 must never close one.
export async function fetchOpenSession() {
    return supabase
        .from('life_sleep')
        .select(COLUMNS)
        .not('sleep_time', 'is', null)
        .is('wake_time', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
}

// Under RLS an expired login, or a row changed elsewhere, makes update/delete match 0 rows
// WITHOUT an error; every mutation must confirm exactly one affected row.
async function expectOneRow(query) {
    const { data, error } = await query.select('id');
    if (error) return { data: null, error };
    if (!data || data.length !== 1) {
        return { data: null, error: new Error('紀錄已被變更或登入已過期，請重新整理後再試。') };
    }
    return { data: data[0], error: null };
}

export async function startSession(sleepTime, dayType) {
    return expectOneRow(supabase.from('life_sleep').insert([{ sleep_time: sleepTime, day_type: dayType }]));
}

// created_at is moved too: it is the session-start ordering key for fetchOpenSession and the banner date.
// The wake_time filter keeps a session closed on another device from being rewritten.
export async function restartSession(id, sleepTime, dayType) {
    return expectOneRow(
        supabase
            .from('life_sleep')
            .update({ sleep_time: sleepTime, day_type: dayType, created_at: new Date().toISOString() })
            .eq('id', id)
            .is('wake_time', null)
    );
}

// Without an id, a placeholder already holding fields.date is filled instead of inserting a
// second row beside it (2026-10-13 duplicate incident). The fill re-asserts the row is still
// empty, so a placeholder filled meanwhile errors out instead of being overwritten or duplicated.
export async function saveCompleteRecord(id, fields) {
    if (id != null) return expectOneRow(supabase.from('life_sleep').update(fields).eq('id', id));

    const { data: placeholder, error } = await supabase
        .from('life_sleep')
        .select('id')
        .eq('date', fields.date)
        .is('sleep_time', null)
        .is('wake_time', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
    if (error) return { data: null, error };
    if (placeholder) {
        return expectOneRow(
            supabase
                .from('life_sleep')
                .update(fields)
                .eq('id', placeholder.id)
                .is('sleep_time', null)
                .is('wake_time', null)
        );
    }

    return expectOneRow(supabase.from('life_sleep').insert([fields]));
}

export async function deleteRecord(id) {
    return expectOneRow(supabase.from('life_sleep').delete().eq('id', id));
}
```

- [ ] **Step 3: 用 node 檢查純函式（Review Focus 4、5）**

Run（專案根目錄）:
```bash
node --input-type=module -e "
import { calculateDurationMinutes, buildCompleteFields, toHHMM, lastNDates, getWeekdayFromDate } from './lib/sleep-time.js';
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error('FAIL', m, a, b); process.exit(1); } };
eq(calculateDurationMinutes('23:40', '07:10'), 450, 'cross midnight');
eq(calculateDurationMinutes('02:10:00', '09:25:00'), 435, 'row 290');
eq(calculateDurationMinutes('08:00', '08:00'), 0, 'equal times -> 0 (page must reject)');
eq(buildCompleteFields({ date: '2026-10-14', sleep: '02:10', wake: '09:25', dayType: 'WORKDAY' }),
   { date: '2026-10-14', weekday: '週三', sleep_time: '02:10:00', wake_time: '09:25:00', day_type: 'WORKDAY', total: 435 }, 'build');
eq(buildCompleteFields({ date: '2026-10-13', sleep: '04:43:58', wake: '09:25:00', dayType: 'WORKDAY' }).sleep_time, '04:43:58', 'keeps seconds');
eq(toHHMM('04:43:58'), '04:43', 'toHHMM'); eq(toHHMM(null), '', 'toHHMM null');
eq(getWeekdayFromDate('2026-10-13'), '週二', 'weekday');
eq(lastNDates(7).length, 7, 'lastNDates');
console.log('OK');
"
```
Expected: `OK`

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 errors（兩個新檔尚未被引用，不影響 build）

- [ ] **Step 5: Commit**

```bash
git add lib/sleep-time.js lib/sleep.js
git commit -m "refactor(sleep): 抽出 sleep-time 純函式與 sleep 資料層"
```

---

### Task 2: `components/sleep-tracker/` UI 元件

**Files:**
- Create: `components/sleep-tracker/DayTypeToggle.jsx`
- Create: `components/sleep-tracker/SheetShell.jsx`
- Create: `components/sleep-tracker/HistoryStrip.jsx`
- Create: `components/sleep-tracker/SleepRecordSheet.jsx`
- Create: `components/sleep-tracker/DayRecordsSheet.jsx`
- Create: `components/sleep-tracker/SessionConflictSheet.jsx`

**Interfaces:**
- Consumes: Task 1 的 `lastNDates`、`toHHMM`、`formatTaipeiMonthDay`、`isPlaceholder`
- Produces:
  - `<DayTypeToggle value onChange />`（value: `'WORKDAY' | 'HOLIDAY'`）
  - `<SheetShell title busy onClose>{children}</SheetShell>`
  - `<HistoryStrip records onSelectDate(dateStr) />`（records 可含 placeholder，只有 `wake_time` 有值的列計入）
  - `<SleepRecordSheet initial busy onSave({ id, date, sleep, wake, dayType }) onDelete(id) onClose />`，`initial = { id, date, sleep, wake, dayType, title, canDelete }`
  - `<DayRecordsSheet date rows onPick(row) onAdd() onClose />`
  - `<SessionConflictSheet session busy onCloseSession() onRestart() onClose />`

- [ ] **Step 1: `DayTypeToggle.jsx`**（由 `page.jsx:120-129` 的 `ToggleButton` 搬來，補 `type="button"`）

```jsx
'use client';

import { Briefcase, Coffee } from 'lucide-react';

const ToggleButton = ({ active, onClick, Icon, activeColor }) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex-1 py-3 rounded-full text-base font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
            active ? `bg-white ${activeColor} shadow-sm` : 'text-[#8a817c] hover:text-[#6b635f]'
        }`}
    >
        <Icon size={20} strokeWidth={2.5} />
    </button>
);

export default function DayTypeToggle({ value, onChange }) {
    return (
        <div className="bg-[#dcd6d1] p-1.5 rounded-full flex w-full shadow-inner">
            <ToggleButton
                active={value === 'WORKDAY'}
                onClick={() => onChange('WORKDAY')}
                Icon={Briefcase}
                activeColor="text-[#3f4a4e]"
            />
            <ToggleButton
                active={value === 'HOLIDAY'}
                onClick={() => onChange('HOLIDAY')}
                Icon={Coffee}
                activeColor="text-[#c2785c]"
            />
        </div>
    );
}
```

- [ ] **Step 2: `SheetShell.jsx`**（由 `page.jsx:285-303` 的 modal 外框搬來）

```jsx
'use client';

import { X } from 'lucide-react';

export default function SheetShell({ title, busy = false, onClose, children }) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40"
            onClick={() => !busy && onClose()}
        >
            <div
                className="w-full max-w-sm bg-[#fdfbf7] rounded-[2rem] p-6 shadow-2xl flex flex-col gap-5"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-black text-[#3f4a4e]">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="text-[#3f4a4e] opacity-50 hover:opacity-100 transition-opacity disabled:opacity-30"
                    >
                        <X size={22} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
```

- [ ] **Step 3: `HistoryStrip.jsx`**（由 `page.jsx:80-118` 搬來；卡片改成 button，只計 complete 列）

```jsx
'use client';

import { lastNDates } from '@/lib/sleep-time';

const DAY_TYPE_COLOR = { WORKDAY: '#3f4a4e', HOLIDAY: '#c2785c' };

export default function HistoryStrip({ records, onSelectDate }) {
    const dates = lastNDates(7);
    // Multiple complete rows per wake date (e.g. naps) are summed; the latest row decides day_type.
    // Placeholders are skipped so their date still renders as an empty slot.
    const byDate = {};
    for (const r of records) {
        if (!r.wake_time) continue;
        const entry = byDate[r.date] || { total: 0, dayType: r.day_type };
        entry.total += r.total || 0;
        entry.dayType = r.day_type;
        byDate[r.date] = entry;
    }

    return (
        <section className="mt-8 mb-6">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-[#3f4a4e]/60">最近 7 天</h3>
            <div className="flex justify-between gap-1.5">
                {dates.map((dateStr) => {
                    const entry = byDate[dateStr];
                    return (
                        <button
                            type="button"
                            key={dateStr}
                            onClick={() => onSelectDate(dateStr)}
                            className={`flex flex-1 flex-col items-center rounded-lg py-2 active:scale-95 transition-transform ${
                                entry ? 'border-2 border-[#3f4a4e]' : 'border-2 border-dashed border-[#3f4a4e]/20'
                            }`}
                        >
                            <span className="text-xs font-bold text-[#3f4a4e]/60">{dateStr.slice(8, 10)}</span>
                            <span className="mt-1 text-sm font-extrabold text-[#3f4a4e]">
                                {entry ? (entry.total / 60).toFixed(1) : '–'}
                            </span>
                            <span
                                className="mt-1.5 h-2 w-2 rounded-full"
                                style={{ backgroundColor: entry ? DAY_TYPE_COLOR[entry.dayType] : 'transparent' }}
                            />
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
```

- [ ] **Step 4: `SleepRecordSheet.jsx`**

```jsx
'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import DatePicker from '@/components/ui/DatePicker';
import { FormInput } from '@/components/ui/FormInput';
import SheetShell from './SheetShell';
import DayTypeToggle from './DayTypeToggle';

// Form state is seeded from `initial` once; the parent unmounts this sheet between opens,
// which is also what resets DatePicker's displayed month.
export default function SleepRecordSheet({ initial, busy, onSave, onDelete, onClose }) {
    const [date, setDate] = useState(initial.date);
    const [sleep, setSleep] = useState(initial.sleep);
    const [wake, setWake] = useState(initial.wake);
    const [dayType, setDayType] = useState(initial.dayType);

    const handleDelete = () => {
        if (!window.confirm('確定刪除這筆紀錄？')) return;
        onDelete(initial.id);
    };

    return (
        <SheetShell title={initial.title} busy={busy} onClose={onClose}>
            <DatePicker label="起床日期" value={date} onChange={setDate} />
            <FormInput label="睡覺時間" type="time" value={sleep} onChange={(e) => setSleep(e.target.value)} />
            <FormInput label="起床時間" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
            <DayTypeToggle value={dayType} onChange={setDayType} />

            <button
                type="button"
                onClick={() => onSave({ id: initial.id, date, sleep, wake, dayType })}
                disabled={busy}
                className="w-full py-4 rounded-full bg-[#3f4a4e] text-white font-bold text-lg shadow-lg active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
                {busy ? <Loader2 className="animate-spin w-5 h-5" /> : '儲存'}
            </button>

            {initial.canDelete && (
                <button
                    type="button"
                    onClick={handleDelete}
                    disabled={busy}
                    className="flex items-center justify-center gap-1.5 text-sm font-bold text-[#c2785c] disabled:opacity-40"
                >
                    <Trash2 size={16} />
                    刪除這筆
                </button>
            )}
        </SheetShell>
    );
}
```

- [ ] **Step 5: `DayRecordsSheet.jsx`**

```jsx
'use client';

import { isPlaceholder } from '@/lib/sleep';
import { toHHMM } from '@/lib/sleep-time';
import SheetShell from './SheetShell';

const describe = (row) => {
    if (isPlaceholder(row)) return '待填';
    if (!row.wake_time) return `${toHHMM(row.sleep_time)} → 睡覺中`;
    return `${toHHMM(row.sleep_time)} → ${toHHMM(row.wake_time)} · ${(row.total / 60).toFixed(1)} h`;
};

export default function DayRecordsSheet({ date, rows, onPick, onAdd, onClose }) {
    return (
        <SheetShell title={`${date.slice(5).replace('-', '/')} 的紀錄`} onClose={onClose}>
            <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                    <li key={row.id}>
                        <button
                            type="button"
                            onClick={() => onPick(row)}
                            className="w-full rounded-xl border-2 border-[#3f4a4e] px-4 py-3 text-left font-bold text-[#3f4a4e] active:scale-[0.98] transition-transform"
                        >
                            {describe(row)}
                        </button>
                    </li>
                ))}
            </ul>
            <button
                type="button"
                onClick={onAdd}
                className="text-sm font-bold tracking-widest text-[#3f4a4e]/60 hover:text-[#3f4a4e] transition-colors"
            >
                ＋ 新增一筆
            </button>
        </SheetShell>
    );
}
```

- [ ] **Step 6: `SessionConflictSheet.jsx`**

```jsx
'use client';

import { formatTaipeiMonthDay, toHHMM } from '@/lib/sleep-time';
import SheetShell from './SheetShell';

export default function SessionConflictSheet({ session, busy, onCloseSession, onRestart, onClose }) {
    return (
        <SheetShell title="已經在睡覺中" busy={busy} onClose={onClose}>
            <p className="text-sm font-bold text-[#3f4a4e]/70">
                {formatTaipeiMonthDay(session.created_at)} {toHHMM(session.sleep_time)} 開始的紀錄還沒按起床。
            </p>
            <button
                type="button"
                onClick={onCloseSession}
                disabled={busy}
                className="w-full py-4 rounded-full bg-[#3f4a4e] text-white font-bold shadow-lg active:scale-95 transition-all disabled:opacity-60"
            >
                補上它的起床時間
            </button>
            <button
                type="button"
                onClick={onRestart}
                disabled={busy}
                className="w-full py-4 rounded-full border-2 border-[#3f4a4e] text-[#3f4a4e] font-bold active:scale-95 transition-all disabled:opacity-60"
            >
                改成從現在開始
            </button>
        </SheetShell>
    );
}
```

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add components/sleep-tracker
git commit -m "feat(sleep): 新增睡眠頁表單、日期清單與睡覺中衝突元件"
```

---

### Task 3: `app/sleep-tracker/page.jsx` 改接新元件與流程

**Files:**
- Modify: `app/sleep-tracker/page.jsx`（整檔改寫：helpers 與 `HistoryStrip`/`ToggleButton`/backfill modal 移出，保留 `ActionButton`）

**Interfaces:**
- Consumes: Task 1 全部 exports、Task 2 全部元件
- Produces: 無（頁面）

- [ ] **Step 1: 以下列內容取代整個 `app/sleep-tracker/page.jsx`**

```jsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Moon, Sun, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import RecordPageLayout from '@/components/layout/RecordPageLayout';
import DayTypeToggle from '@/components/sleep-tracker/DayTypeToggle';
import HistoryStrip from '@/components/sleep-tracker/HistoryStrip';
import SleepRecordSheet from '@/components/sleep-tracker/SleepRecordSheet';
import DayRecordsSheet from '@/components/sleep-tracker/DayRecordsSheet';
import SessionConflictSheet from '@/components/sleep-tracker/SessionConflictSheet';
import {
    buildCompleteFields,
    formatDuration,
    formatTaipeiMonthDay,
    getTaipeiTime,
    getTaipeiToday,
    lastNDates,
    toHHMM,
} from '@/lib/sleep-time';
import {
    deleteRecord,
    fetchOpenSession,
    fetchRecordsInRange,
    isPlaceholder,
    restartSession,
    saveCompleteRecord,
    startSession,
} from '@/lib/sleep';

const ActionButton = ({ onClick, disabled, color, Icon, label }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex-1 bg-transparent border-2 rounded-2xl py-12 text-lg font-extrabold tracking-widest active:scale-[0.98] transition-all disabled:opacity-60"
        style={{ borderColor: color, color }}
    >
        {disabled ? (
            <Loader2 className="mx-auto mb-3 animate-spin" size={40} />
        ) : (
            <Icon className="mx-auto mb-3" size={40} strokeWidth={2.5} />
        )}
        {label}
    </button>
);

const blankEditor = (date) => ({
    id: null,
    date,
    sleep: '',
    wake: '',
    dayType: 'WORKDAY',
    title: '補紀錄',
    canDelete: false,
});

const editorFromRow = (row) => ({
    id: row.id,
    date: row.date ?? getTaipeiToday(),
    sleep: toHHMM(row.sleep_time),
    wake: toHHMM(row.wake_time),
    dayType: row.day_type ?? 'WORKDAY',
    title: isPlaceholder(row) ? '補紀錄' : row.wake_time ? '編輯紀錄' : '補上起床',
    canDelete: true,
});

export default function SleepTrackerPage() {
    const [loading, setLoading] = useState(false);
    const [dayType, setDayType] = useState('WORKDAY');
    const [records, setRecords] = useState([]);
    const [openSession, setOpenSession] = useState(null);
    const [editor, setEditor] = useState(null);
    const [dayPicker, setDayPicker] = useState(null);
    const [conflict, setConflict] = useState(null);

    const refresh = useCallback(async () => {
        const dates = lastNDates(7);
        const [recent, open] = await Promise.all([
            fetchRecordsInRange(dates[0], dates[dates.length - 1]),
            fetchOpenSession(),
        ]);
        // On error keep the previous state: an empty/null fallback would read as "no session".
        if (recent.error) toast.error(`讀取紀錄失敗：${recent.error.message}`);
        else setRecords(recent.data || []);
        if (open.error) toast.error(`讀取睡覺中紀錄失敗：${open.error.message}`);
        else setOpenSession(open.data);
    }, []);

    useEffect(() => {
        const load = () => refresh();
        load();
    }, [refresh]);

    const handleAction = (actionFn, loadingMsg) => {
        if (loading) return;
        setLoading(true);
        toast.promise(
            actionFn().finally(() => setLoading(false)),
            {
                loading: loadingMsg,
                success: (data) => data,
                error: (err) => `錯誤：${err.message}`,
            }
        );
    };

    const openEditor = (initial) => {
        setDayPicker(null);
        setConflict(null);
        setEditor(initial);
    };

    const beginSession = () =>
        handleAction(async () => {
            const time = getTaipeiTime();
            const { error } = await startSession(time, dayType);
            if (error) throw error;
            refresh();
            return `已紀錄「${dayType === 'WORKDAY' ? '平日' : '假日'}」睡覺時間 (${time})`;
        }, '正在紀錄...');

    // Re-checks the DB instead of trusting openSession state: another device may have changed it.
    const handleSleep = async () => {
        if (loading) return;
        setLoading(true);
        const { data: open, error } = await fetchOpenSession();
        setLoading(false);
        if (error) return toast.error(`讀取紀錄失敗：${error.message}`);
        if (open) return setConflict(open);
        beginSession();
    };

    const handleRestart = () =>
        handleAction(async () => {
            const time = getTaipeiTime();
            const { error } = await restartSession(conflict.id, time, dayType);
            if (error) throw error;
            setConflict(null);
            refresh();
            return `已改成從 ${time} 開始睡覺`;
        }, '正在更新...');

    const handleWake = () =>
        handleAction(async () => {
            const { data: open, error: fetchError } = await fetchOpenSession();
            if (fetchError) throw fetchError;
            if (!open) throw new Error('找不到睡覺中的紀錄，忘了按睡覺的話請用「補紀錄」。');

            const fields = buildCompleteFields({
                date: getTaipeiToday(),
                sleep: open.sleep_time,
                wake: getTaipeiTime(),
                dayType: open.day_type,
            });
            const { error } = await saveCompleteRecord(open.id, fields);
            if (error) throw error;
            refresh();
            return `早安！共睡了 ${formatDuration(fields.total)}`;
        }, '正在計算...');

    const handleSave = ({ id, date, sleep, wake, dayType: rowDayType }) =>
        handleAction(async () => {
            if (!date || !sleep || !wake) throw new Error('請填寫日期、睡覺與起床時間。');
            const fields = buildCompleteFields({ date, sleep, wake, dayType: rowDayType });
            if (fields.total === 0) throw new Error('睡覺與起床時間相同。');

            const { error } = await saveCompleteRecord(id, fields);
            if (error) throw error;
            setEditor(null);
            refresh();
            return `已儲存 ${date}（${formatDuration(fields.total)}）`;
        }, '正在儲存...');

    const handleDelete = (id) =>
        handleAction(async () => {
            const { error } = await deleteRecord(id);
            if (error) throw error;
            setEditor(null);
            refresh();
            return '已刪除';
        }, '正在刪除...');

    const handleSelectDate = (dateStr) => {
        const rows = records.filter((r) => r.date === dateStr);
        if (rows.length === 0) return openEditor(blankEditor(dateStr));
        if (rows.length === 1) return openEditor(editorFromRow(rows[0]));
        setDayPicker({ date: dateStr, rows });
    };

    // An open session is the "forgot 起床" case: close it rather than add a second row.
    // Re-queried, not read from state: state is null before the first load and after a failed read,
    // and a blank editor opened then would recreate the 2026-10-13 duplicate.
    const handleBackfill = async () => {
        if (loading) return;
        setLoading(true);
        const { data: open, error } = await fetchOpenSession();
        setLoading(false);
        if (error) return toast.error(`讀取紀錄失敗：${error.message}`);
        openEditor(open ? editorFromRow(open) : blankEditor(getTaipeiToday()));
    };

    return (
        <RecordPageLayout title="睡眠">
            <DayTypeToggle value={dayType} onChange={setDayType} />

            <div className="mt-8 flex gap-3">
                <ActionButton onClick={handleSleep} disabled={loading} Icon={Moon} label="睡覺" color="#3f4a4e" />
                <ActionButton onClick={handleWake} disabled={loading} Icon={Sun} label="起床" color="#c2785c" />
            </div>

            {openSession && (
                <button
                    type="button"
                    onClick={() => openEditor(editorFromRow(openSession))}
                    className="mt-6 w-full rounded-2xl border-2 border-dashed border-[#3f4a4e]/40 px-4 py-3 text-left active:scale-[0.98] transition-transform"
                >
                    <span className="block text-sm font-bold text-[#3f4a4e]">
                        睡覺中 · 自 {formatTaipeiMonthDay(openSession.created_at)} {toHHMM(openSession.sleep_time)}
                    </span>
                    <span className="block text-xs font-bold text-[#3f4a4e]/50">忘了按起床？點這裡補上</span>
                </button>
            )}

            <HistoryStrip records={records} onSelectDate={handleSelectDate} />

            <section className="mt-auto border-t border-[#3f4a4e]/10 pt-4">
                <button
                    type="button"
                    onClick={handleBackfill}
                    className="text-sm font-bold uppercase tracking-widest text-[#3f4a4e]/60 hover:text-[#3f4a4e] transition-colors"
                >
                    補紀錄
                </button>
            </section>

            {editor && (
                <SleepRecordSheet
                    initial={editor}
                    busy={loading}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onClose={() => setEditor(null)}
                />
            )}
            {dayPicker && (
                <DayRecordsSheet
                    date={dayPicker.date}
                    rows={dayPicker.rows}
                    onPick={(row) => openEditor(editorFromRow(row))}
                    onAdd={() => openEditor(blankEditor(dayPicker.date))}
                    onClose={() => setDayPicker(null)}
                />
            )}
            {conflict && (
                <SessionConflictSheet
                    session={conflict}
                    busy={loading}
                    onCloseSession={() => openEditor(editorFromRow(conflict))}
                    onRestart={handleRestart}
                    onClose={() => setConflict(null)}
                />
            )}
        </RecordPageLayout>
    );
}
```

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: lint 0 errors；build 成功且 route 列表含 `/sleep-tracker`

- [ ] **Step 3: 確認舊 helper 沒有殘留引用**

Run: `grep -rn "getTaipeiDateDetails\|calculateDurationMinutes\|handleBackfillSubmit" app components lib`
Expected: 只命中 `lib/sleep-time.js` 的 `calculateDurationMinutes`

- [ ] **Step 4: Commit**

```bash
git add app/sleep-tracker/page.jsx
git commit -m "feat(sleep): 睡眠紀錄可補起床、編輯、刪除，卡片可點補填"
```

---

### Task 4: 畫面冒煙、文件、使用者實測

**Files:**
- Modify: `CLAUDE.md`（File layout：`components/` 加 `sleep-tracker/`，`lib/` 加 `sleep-time.js`、`sleep.js`）

- [ ] **Step 1: 未登入畫面冒煙**（RLS 擋讀 → records 為空、不應 crash）

Run: `npm run dev`（背景），用 Playwright（`executablePath: '/opt/pw-browsers/chromium'`，viewport 390×844）開 `http://localhost:3000/sleep-tracker`，截圖並收集 console error。
Expected: 版面與改前一致（toggle、兩個大按鈕、7 格虛線卡片、底部「補紀錄」），點任一卡片出現「補紀錄」表單且日期是該卡片日期，console 無 React error。**不要按儲存**（正式 DB）。

- [ ] **Step 2: 更新 `CLAUDE.md` File layout**

`components/` 區塊在 `game-record/` 之後加：
```
│   ├── sleep-tracker/            ← HistoryStrip / SleepRecordSheet / DayRecordsSheet /
│   │                                SessionConflictSheet / SheetShell / DayTypeToggle
```
`lib/` 區塊加：
```
│   ├── sleep-time.js             ← 睡眠頁純時間函式（無 import，可直接 node 檢查）
│   ├── sleep.js                  ← life_sleep 資料層（session / placeholder / complete 列狀態）
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 補上 sleep-tracker 元件與 lib"
```

- [ ] **Step 4: 使用者手機實測（部署後）＋ 執行者唯讀 SQL 確認**

使用者依序操作，每項之後執行者跑對應 SELECT：

| # | 操作 | 預期 | 確認 SQL |
|---|------|------|----------|
| A | 點「14」卡片 → 填 10/14 實際睡／起時間 → 儲存 | 卡片變實線並顯示時數 | `select id, date, sleep_time, wake_time, total from life_sleep where date='2026-10-14';` → 只有 id 291 一列且已填 |
| B | 按睡覺 → 再按睡覺 → 選「改成從現在開始」 | 第二次跳選擇框；banner 時間更新 | `select count(*) from life_sleep where sleep_time is not null and wake_time is null;` → 1 |
| C | 點 banner → 填起床時間 → 儲存 | banner 消失、今天卡片出現 | 該 session id 的 `wake_time/date/weekday/total` 已填 |
| D | 點 C 那天的卡片 → 改起床時間 → 儲存 | 時數更新 | `total` = 新時間差 |
| E | 同一張卡片 → 刪除這筆 → 確認 | 卡片回到「–」 | 該 id 已不存在 |
| F | 沒有睡覺中紀錄時按起床 | toast「找不到睡覺中的紀錄…」 | 無新列、291 未變 |

| G | 頁面一打開立刻按「補紀錄」（session 開著時） | 打開的是「補上起床」表單，不是空白補紀錄 | — |

B–E 是測試資料；若使用者不想留，E 的刪除即清理。
