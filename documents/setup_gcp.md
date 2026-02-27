請跟著以下步驟在 Google Cloud Console 進行設定：

#### 1. 建立專案與 Cloud Storage Bucket

1. 登入 GCP Console，點擊左上角的專案選單，選擇 「新增專案 (New Project)」，取個名字（例如：record-tracker）並建立。

2. 確保目前選取的是剛建好的專案，在左側導覽列找到 「Cloud Storage」 -> 「Buckets (值區)」。

3. 點擊 「建立 (Create)」：
    - 名稱：取一個全域唯一的名稱（根據你先前的程式碼，可以用類似）。

    - 位置類型：選擇 Region，並強烈建議選擇 asia-east1 (台灣)，這樣你上傳和讀取圖片的速度會最快。

    - 儲存空間級別：選擇 Standard。

    - 存取權控制：非常重要！取消勾選「強制禁止公開存取 (Enforce public access prevention on this bucket)」，選擇 Uniform (統一)。

    - 點擊「建立」。

#### 2. 設定 Bucket 為公開讀取 (Public Read)

這樣 Supabase 存的圖片網址，才能直接在網頁上顯示給所有人看。

1. 進入你剛建好的 Bucket，點擊 「權限 (Permissions)」 分頁。

2. 點擊 「授予存取權 (Grant Access)」。

3. 在「新增主體 (New principals)」欄位輸入：allUsers。

4. 在「指派角色 (Assign roles)」選擇：「Cloud Storage」 -> 「儲存空間物件檢視者 (Storage Object Viewer)」。（注意：是檢視者，不是管理員，我們只讓大眾看圖片）。

5. 點擊「儲存」，系統會跳出警告問你是否確定要公開，點擊 「允許公開存取 (Allow public access)」。

#### 3. 建立 Service Account 與下載金鑰

這是給你的 Next.js 後端程式「合法上傳圖片」的通行證。

1. 在左側導覽列前往 「IAM 與管理 (IAM & Admin)」 -> 「服務帳戶 (Service Accounts)」。

2. 點擊 「建立服務帳戶 (Create Service Account)」：
    - 名字可以取 nextjs-uploader。

    - 點擊「建立並繼續」。

3. 在「選取角色」中尋找：「Cloud Storage」 -> 「儲存空間物件管理員 (Storage Object Admin)」（這個角色有權限上傳與刪除物件）。

4. 點擊「繼續」並「完成」。

5. 回到服務帳戶列表，點擊剛剛建好的帳戶右側的「三個點 (Actions)」-> 「管理金鑰 (Manage keys)」。

6. 點擊 「新增金鑰 (Add Key)」 -> 「建立新的金鑰 (Create new key)」。

7. 格式選擇 JSON，點擊建立。這時會下載一個 .json 檔案到你的電腦中，請務必妥善保存，不要上傳到 GitHub！

#### 4. 設定環境變數 (.env.local)

打開你剛下載的 JSON 檔案，我們只需要提取其中三個最重要的資訊，放到你的 Next.js 專案根目錄的 .env.local 中：

程式碼片段

```
# .env.local

# 從 JSON 檔中的 "project_id" 複製過來

GCP_PROJECT_ID="你的專案ID"

# 從 JSON 檔中的 "client_email" 複製過來

GCP_CLIENT_EMAIL="你的服務帳戶信箱@xxx.iam.gserviceaccount.com"

# 從 JSON 檔中的 "private_key" 複製過來

# ⚠️ 注意：這行最容易出錯！請完整連同 "-----BEGIN PRIVATE KEY-----" 到 "-----END PRIVATE KEY-----\n" 複製。

# 務必使用雙引號 " " 包起來，確保裡面的 \n 換行字元不會壞掉。

GCP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE......非常長的一串......\n-----END PRIVATE KEY-----\n"

# 剛才建立的 Bucket 名稱

GCP_BUCKET_NAME=""
```

完成這四個步驟後，我們的 GCP 基礎建設就大功告成了！由於 Vercel 部署時也需要這些環境變數，未來上線時記得把這四個變數也加進 Vercel 的 Environment Variables 設定中。

確保你的 Next.js 專案已經安裝了官方套件：

```
npm install @google-cloud/storage
```
