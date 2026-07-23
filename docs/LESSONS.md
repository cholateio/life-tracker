# LESSONS

修完非顯然的 bug、繞過環境陷阱、發現文件與現實不符時 append。格式：Context / Error / Solution / Rule。

### 2026-07-23 handleWake 用「最新一筆」判斷開啟中紀錄，被 backfill 完成列插隊
- Context: 新增睡眠 backfill（事後補一整筆完整紀錄）功能。原 `handleWake` 用 `created_at desc limit 1` 撈「最新一筆」再檢查 `wake_time` 是否為空。
- Error: backfill 插入的**完成列** `created_at` 是插入當下（now），比還開著的即時紀錄更新。起床時撈到那筆完成列 → 誤判「最新一筆已結束」→ 開啟中紀錄永遠關不掉。（原本宣稱「完成列不會被即時邏輯撈到」，codex review 打回。）
- Solution: `handleWake` 查詢改用 `.is('wake_time', null)` 明確過濾開啟中列，不再靠 `created_at` 推斷狀態。
- Rule: 查「開啟中/未完成」狀態一律用狀態欄位過濾（`IS NULL`），不要拿「`created_at` 最新一筆」當代理——插入時間 ≠ 邏輯狀態。

### 2026-07-23 本地 dev 寫入 life_sleep 回 401，不是缺 key 而是沒登入
- Context: 本地 `npm run dev` 開 `/sleep-tracker` 測 backfill 寫入，Supabase REST 回 401。
- Error: 頁面本身無登入 gate，寫入直接靠 RLS 擋。`life_sleep` RLS = 匿名可讀、寫入需已登入使用者；本地瀏覽器 session 未登入 → insert 401（select 仍 200，故誤以為缺 token）。
- Solution: 本地先走 `/login`（或首頁標題五連點）登入，再回頁面寫入即成功。
- Rule: 本地測「寫入」前先確認已登入；讀得到 ≠ 寫得進，401 先想 RLS/session 再想 key。
