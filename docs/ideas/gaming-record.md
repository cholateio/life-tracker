# 遊戲回憶相簿 · 規格書 v1.0

本文件規範**資料結構**與**行為**,不規範視覺樣式。
App 端與網頁端請各自套用自己的設計系統,只要遵守本文件的欄位定義與行為規則,兩端資料即可互通。

---

## 0. 設計原則(實作時的判準)

遇到取捨時,依序套用以下原則:

1. **截圖是主體,文字是註腳。** 任何設計不得讓截圖變小、被裁切或被文字蓋住。
2. **記錄必須能在 10 分鐘內完成一天。** 新增任何欄位前,先問「這會讓補記變慢嗎」。
3. **能用點的,就不要打字。** 全表單在不輸入任何文字的情況下必須能成功儲存。
4. **記錄事實,不記錄評價。** 欄位設計偏向可點選的客觀狀態,而非需要組織語言的心得。
5. **日常表單對所有遊戲一致。** 遊戲類型差異一律收斂到「新增遊戲」的一次性設定,絕不在每日流程中出現分歧。
6. **留白是合法狀態。** 九成的日子只有截圖 + 兩個點選,這是預期行為,不是資料不完整。

---

## 1. 資料模型

### 1.1 Game(遊戲)

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `id` | string (uuid) | ✓ | |
| `title` | string | ✓ | 顯示用名稱 |
| `slug` | string | ✓ | 網址用,唯一 |
| `studio` | string | | 製作公司 |
| `cover_image` | string (path) | | 書背/封面。未設定時取該遊戲第一張截圖 |
| `release_date` | date | | |
| `status` | enum | ✓ | `playing` / `paused` / `archived` |
| `counter_type` | enum | ✓ | 見 §1.4,可為 `none` |
| `counter_label` | string | △ | 僅 `counter_type = custom` 時必填 |
| `activity_options` | string[] | ✓ | 該遊戲「做了什麼」的選項,見 §3.3 |
| `rating` | int 1–10 | | 封存時才填,平時為 null |
| `total_hours` | decimal | | 可手填或由日紀錄加總 |
| `is_favorite` | bool | ✓ | 預設 false |
| `purchase` | object | | `{ date, platform, price, currency }` |
| `bookmark` | object | | 暫停書籤,見 §1.5 |
| `final_note` | text | | 通關心得,封存時填寫,可留白 |
| `first_played_at` | date | 衍生 | 最早的 DayEntry 日期 |
| `last_played_at` | date | 衍生 | 最晚的 DayEntry 日期 |
| `created_at` / `updated_at` | datetime | ✓ | |

> `first/last_played_at`、`total_hours` 建議由 DayEntry 衍生計算,不獨立維護,避免不一致。

### 1.2 DayEntry(每日紀錄)

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `id` | string (uuid) | ✓ | |
| `game_id` | string | ✓ | |
| `date` | date (YYYY-MM-DD) | ✓ | **遊玩當日**,非填寫日 |
| `temperature` | enum | | 見 §1.3。未選則為 null,顯示時不出現 |
| `counter_value` | number | | 對應 `game.counter_type`,`none` 時恆為 null |
| `progress_note` | string | | 自由文字。地名、Boss、章節、備註皆可,不解析內容 |
| `activities` | string[] | | 見 §3.3 |
| `one_line` | string(120) | | 選填的一句話 |
| `hours` | decimal | | 當日時數,選填 |
| `created_at` / `updated_at` | datetime | ✓ | |

**唯一性約束:** `(game_id, date)` 必須唯一。重複建立時改為進入編輯模式。

**最小可儲存單位:** 只要有 `game_id` + `date` 即可儲存。其餘全部可為空。

### 1.3 Temperature(當日溫度)

固定五個值,**不可由使用者增減**(增減會破壞跨遊戲、跨年份的可比性)。

| code | 標籤 | 語意 |
|---|---|---|
| `high` | 爽 | 順利、有成就感 |
| `stuck` | 卡 | 卡關、挫折 |
| `lost` | 迷路 | 不知道要幹嘛、亂繞 |
| `wow` | 驚豔 | 被畫面或設計震到 |
| `chill` | 放空 | 沒進度、純放鬆 |

> 注意這五個值刻意**不是好壞刻度**。「迷路」「放空」是狀態不是評價,確保任何一天都有一個選項符合。UI 不得將其排列成好→壞的漸層或給予分數。

### 1.4 CounterType(每款遊戲數什麼)

在新增遊戲時選定一次,決定每日表單第 ③ 格的樣貌。

| code | 表單標籤 | 適用 | 輸入型別 |
|---|---|---|---|
| `deaths` | 死了幾次 | 魂系、動作 | 整數,加減鈕 step 1 |
| `ingame_day` | 遊戲內第幾天 | 種田、經營、模擬 | 整數,可跳號 |
| `chapter` | 第幾章 | 劇情 RPG、AVG | 整數 |
| `money` | 賺了多少 | 商店、大亨類 | 整數,可為負 |
| `custom` | 使用 `counter_label` | 聲望、層數、Ante… | 整數 |
| `none` | — | 無合適數字者 | **該格不渲染** |

**行為規則:**
- `counter_type` 可隨時修改(例:遊戲前期種田後期打王)。修改**不影響**既有 DayEntry 的 `counter_value`,舊資料保留原值。
- 修改後,呈現端顯示歷史紀錄時,建議標示該日採用的標籤;若不想維護歷史標籤,統一以當前 label 顯示亦可接受。
- 加減鈕為主要輸入方式,同時允許長按或點擊數字直接鍵入。

### 1.5 Bookmark(暫停書籤)

當一款遊戲從 `playing` 轉為 `paused` 時建立。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `saved_at` | date | 建立日 |
| `where` | string | 玩到哪、卡在哪 |
| `next_step` | string | 下一步打算做什麼 |
| `controls_note` | string | 操作提醒(回坑最容易忘的東西) |

三格皆選填,但至少填一格才建立。

### 1.6 Screenshot(截圖)

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `id` | string | ✓ | |
| `day_entry_id` | string | ✓ | |
| `file_path` / `url` | string | ✓ | 原圖 |
| `thumb_path` | string | ✓ | 縮圖,見 §5.4 |
| `taken_at` | datetime | | 由 EXIF 讀取,用於排序 |
| `sort_order` | int | ✓ | 預設依 `taken_at`,可手動調整 |
| `caption` | string | | 地名/Boss 名,**永遠選填**,可事後補 |
| `is_highlight` | bool | ✓ | 預設 false。見 §5.2 |

**重要:** 截圖層級**沒有標記/印章欄位**。標記一律掛在 DayEntry 的 `activities` 上。這是刻意的取捨——避免逐張處理。

---

## 2. 新增遊戲

一次性設定,目標 **30 秒內完成**。

### 2.1 流程

```
① 遊戲名稱        (必填,自動產生 slug)
② 這款要數什麼?   (六選一,見 §1.4,預設 none)
③ 做了什麼的選項  (依 ② 的選擇給預設組,可增刪)
④ 封面            (可跳過,之後自動取第一張截圖)
   ─────────
   其餘欄位(studio / release_date / purchase)全部收在「更多」,預設收合
```

### 2.2 activity_options 預設組

依 `counter_type` 給不同預設,使用者可自由增刪:

| counter_type | 預設選項 |
|---|---|
| `deaths` | 推主線、打 Boss、練等、收集、亂晃 |
| `ingame_day` | 種田、蓋東西、下礦、送禮、釣魚、亂晃 |
| `chapter` | 推主線、跑支線、練等、逛街買裝備 |
| `money` | 擴張、調價、研發、看報表 |
| `custom` / `none` | 推進度、練功、收集、亂晃 |

**跨遊戲學習:** 使用者曾自行輸入過的選項,存入全域字典;新增遊戲時將高頻項目列為建議。此為便利功能,非必要。

### 2.3 驗證

- `title` 不可空白;`slug` 衝突時自動加序號。
- 其餘全部允許空白,直接建立。
- 建立後即可開始補記,不強制填封面或購買資訊。

---

## 3. 每日補記

### 3.1 進入點

- 主動:App 首頁「補記昨天」。
- 被動:每日固定時間推播一次(預設 12:30,可關)。若前一日無紀錄且該遊戲 `status = playing`,推播提醒。
- 補記日期預設為**昨天**,可往前調整,無天數上限。

### 3.2 表單結構(固定順序,不因遊戲而變)

```
標頭:  補記 {date} · {game.title} · {連續第 N 天}
       ├ 遊戲切換器(當日玩超過一款時可切換或新增)
       
① 截圖    整批上傳。多選、依 taken_at 自動排序,不逐張處理
② 溫度    五選一,單選,可不選
③ 數字    依 game.counter_type 渲染;none 時整格不出現
          附選填的 progress_note 短欄位
④ 做了什麼 game.activity_options 複選 + 自由輸入
⑤ 一句話  選填,單行,120 字上限

[ 存起來 ]
```

**格號固定。** 即使 ③ 不渲染,④ 仍稱為「做了什麼」而非重新編號——維持肌肉記憶。

### 3.3 行為規則

- **零輸入可存。** 只上傳截圖即可儲存,其餘留空。
- **可分次完成。** 表單即時暫存草稿,離開不遺失。
- **同日多款遊戲:** 建立多筆 DayEntry,各自獨立。上傳截圖時若能由 EXIF 判斷,不需自動分派——由使用者在切換器選定遊戲後上傳。
- **一句話的提示文字**應引導寫「現場實況」而非「評價」。建議 placeholder 輪替下列句型:
  - 「打到室友問我在罵誰」
  - 「不小心玩到兩點」
  - 「今天什麼都沒推」
- **不得**加入任何形式的心得提示、引導問句、或連續記錄的獎勵徽章。這些會製造壓力並導致棄用。

### 3.4 截圖上傳

- 支援一次選取 50 張以上。
- 依 `taken_at` 升冪排序;無 EXIF 者排在最後,依檔名。
- 上傳後**不進入任何逐張編輯流程**。`caption` 一律事後於相簿中長按單張補填。
- 同日重複上傳同一檔案時去重(以檔案雜湊比對)。

---

## 4. 回坑(暫停與復原)

### 4.1 建立書籤

觸發時機(擇一):
- 使用者手動將遊戲標為 `paused`。
- 某遊戲連續 7 天無紀錄,且期間有其他遊戲的紀錄 → 提示一次「要留書籤嗎」,忽略後不再提示。

### 4.2 前情提要

當 `paused` 的遊戲被重新開啟時,顯示:

```
遊戲名 / 上次遊玩日 / 已隔 N 天 / 最後的 progress_note
─────
書籤三欄(where / next_step / controls_note)
─────
最後一次遊玩的截圖(該 DayEntry 全部)
─────
[ 我回來了 ]  → status 轉回 playing
[ 其實我玩夠了,封存 ] → status 轉 archived
```

**「封存」必須與「回來」等權呈現,不得做成隱藏或負面選項。** 不回去玩不是失敗狀態。

### 4.3 封存

轉 `archived` 時,選填 `rating` 與 `final_note`,兩者皆可跳過。封存後遊戲仍完整保留於相簿。

---

## 5. 呈現

### 5.1 層級

```
書架(所有遊戲)
 └ 單一遊戲
    └ 日期分組的截圖流
       └ 單張放大
```

### 5.2 單一遊戲頁

**標頭區(壓縮到極簡,最多兩行):**
```
{title}
{total_hours} 小時 · ★{rating} · {first_played_at}–{last_played_at}
```
其餘 metadata(studio、購買資訊、release_date)收在收合區。

**日期分組區塊,每組結構:**
```
{date}  {temperature 標籤}  ......  {counter_label} {counter_value}
{activities 小標籤列}
[ 截圖網格 ]
{one_line}          ← 有才顯示
{progress_note}     ← 有才顯示,樣式弱於 one_line
```

**截圖網格規則:**
- 一律等比。PS5 截圖為 16:9,其他來源以各自原比例呈現,同一日內統一。
- 圖上**不疊任何文字**。`caption` 僅在 hover(網頁)或點按(App)時浮現。
- 建議一列 2 張(手機)/ 3–4 張(桌機)。
- `is_highlight = true` 的截圖可放大為兩格寬,作為該日視覺重心。此為選用增強。

### 5.3 書架頁

- 以封面圖為主的網格或橫向捲動列,**文字盡量少**——掃視速度優先於資訊量。
- 必要的排序/篩選:最近遊玩、評分、遊玩時數、狀態(`playing` / `paused` / `archived`)。
- `paused` 的遊戲應有視覺區別,並顯示「已隔 N 天」。

### 5.4 圖片處理

| 用途 | 建議尺寸 | 格式 |
|---|---|---|
| 縮圖(網格) | 長邊 640px | WebP,quality 75 |
| 放大檢視 | 長邊 1920px | WebP,quality 85 |
| 原圖 | 原始 | 保留,提供下載 |

- 網格採 lazy load,並以 blur placeholder 或純色佔位避免版面跳動。
- 縮圖於上傳時產生,不即時轉檔。

### 5.5 選用增強

以下皆非必要,依實作成本斟酌:

- **那年今日:** 首頁顯示 N 年前同一天的 DayEntry(截圖 + one_line)。
- **溫度分布:** 單一遊戲的五色比例條,一眼看出這款是爽多還是卡多。
- **年度回顧:** 全年 temperature 熱力圖 + 各遊戲時數排行。
- **搜尋:** 對 `caption`、`progress_note`、`one_line`、`activities` 做全文檢索。

---

## 6. 舊資料遷移

現有 journal 為單一 text 欄位,格式如:

```
2025-09-14 | PlayStation 購入 ($590)

--- 遊玩日誌 ---
2026-02-28 | 骸骨洞穴(鐘道獸)、深塢(蕾絲)、原野(第四聖詠團)
2026-03-01 | 甲木林(碎裂者修女)、沙噬蟲穴、獵者小徑
...

--- 通關心得 ---
{長文}
```

### 6.1 解析規則

| 來源 | 目標 |
|---|---|
| 含「購入」的首行 | `game.purchase`(解析日期、平台、金額) |
| `--- 遊玩日誌 ---` 以下,符合 `YYYY-MM-DD \| {文字}` 的每一行 | 建立一筆 DayEntry,日期入 `date`,`\|` 後全文原封不動入 `progress_note` |
| `--- 通關心得 ---` 以下全文 | `game.final_note` |
| 既有 `rating` / `total_time` / `last_date` / `favorite` | 直接對應 `game` 同名欄位 |

### 6.2 遷移原則

- **不嘗試解析地名或 Boss 名。** 整行原文塞進 `progress_note` 即可,五年後你自己看得懂。
- 遷移後的 DayEntry `temperature`、`activities`、`counter_value` 全部為 null,屬正常狀態。
- **不要求回填。** 舊紀錄以「只有 progress_note」的形式呈現,呈現端必須能優雅處理這種只有文字沒有截圖的日子。
- 遷移前先完整備份,並提供 dry-run 輸出解析結果供人工確認。

---

## 7. 動畫記錄(沿用同一套模型)

動畫可視為 Game 的變體,共用 DayEntry 結構:

| 遊戲欄位 | 動畫對應 |
|---|---|
| `counter_type` | 固定為 `custom`,`counter_label` = 「看到第幾集」 |
| `activity_options` | 追番、補進度、重看、劇場版 |
| `progress_note` | 集數標題或劇情備註 |
| `final_note` | 完結心得 |
| 新增欄位 `favorite_ep` | 最喜歡的一集 |

若不想混在同一張表,可另建 `Anime` 表但**保持欄位命名一致**,呈現端即可共用元件。

---

## 8. 明確不做的事

以下為刻意排除,實作時請勿「順手加上」:

- ❌ 逐張截圖的標記/分類流程
- ❌ 心得欄位的引導問句、每日提問、寫作提示
- ❌ 連續記錄天數的獎勵、徽章、斷簽警告
- ❌ 依遊戲類型分裂成不同的每日表單
- ❌ 溫度五值的增減或分數化
- ❌ 任何要求補完舊資料的提示

理由一致:**這些都會把「記錄」變成「任務」,而任務會被放棄。**

---

## 附錄 A:JSON 範例

```json
{
  "id": "g_01",
  "title": "空洞騎士:絲之歌",
  "slug": "silksong",
  "status": "archived",
  "counter_type": "deaths",
  "activity_options": ["推主線", "打 Boss", "練等", "收集", "亂晃"],
  "rating": 7,
  "total_hours": 59.4,
  "is_favorite": false,
  "purchase": {
    "date": "2025-09-14",
    "platform": "PlayStation",
    "price": 590,
    "currency": "TWD"
  },
  "final_note": "空洞騎士的續作……",
  "day_entries": [
    {
      "id": "d_0310",
      "date": "2026-03-10",
      "temperature": "stuck",
      "counter_value": 27,
      "progress_note": "火靈竹叢(熾焰之父)、高庭連戰、隱藏道具收集",
      "activities": ["打 Boss", "收集"],
      "one_line": "打到室友問我在罵誰。",
      "hours": 3.2,
      "screenshots": [
        {
          "id": "s_01",
          "thumb_path": "/thumbs/s_01.webp",
          "file_path": "/shots/s_01.jpg",
          "taken_at": "2026-03-10T19:42:11+08:00",
          "sort_order": 0,
          "caption": "熾焰之父",
          "is_highlight": true
        }
      ]
    }
  ]
}
```

## 附錄 B:建議 API(如需前後端分離)

```
GET    /games                    ?status=&sort=
POST   /games
GET    /games/{slug}             含 day_entries 與 screenshots
PATCH  /games/{id}
POST   /games/{id}/bookmark
POST   /games/{id}/archive       body: { rating?, final_note? }

GET    /games/{id}/days?from=&to=
POST   /games/{id}/days          upsert,以 (game_id, date) 為鍵
PATCH  /days/{id}
POST   /days/{id}/screenshots    multipart,支援多檔
PATCH  /screenshots/{id}         主要用於補 caption / is_highlight
DELETE /screenshots/{id}

GET    /on-this-day?date=        那年今日
```

## 附錄 C:實作優先序

| 階段 | 範圍 |
|---|---|
| P0 | Game / DayEntry / Screenshot 三表 + 補記表單 + 單一遊戲頁 + 舊資料遷移 |
| P1 | 新增遊戲的 counter_type 設定 + 書架頁 + 縮圖管線 |
| P2 | 暫停書籤與前情提要 + 封存流程 |
| P3 | 那年今日、溫度分布、年度回顧、搜尋 |

P0 完成即可日常使用,建議先跑滿一款遊戲的完整週期再往下做。
