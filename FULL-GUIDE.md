# 夏以甯助教 — 從零開始完整部署指南

> 這份指南記錄了從零到上線的完整流程，包含所有踩過的坑和解決方案。
> 即使你是初學者，跟著一步一步做就能成功部署。

---

## 目錄

1. [整體架構說明](#1-整體架構說明)
2. [前置準備清單](#2-前置準備清單)
3. [Step 1：建立 LINE Official Account](#step-1建立-line-official-account)
4. [Step 2：取得 OpenRouter API Key](#step-2取得-openrouter-api-key)
5. [Step 3：下載專案程式碼](#step-3下載專案程式碼)
6. [Step 4：設定環境變數](#step-4設定環境變數)
7. [Step 5：設定公司資訊與 AI 人格](#step-5設定公司資訊與-ai-人格)
8. [Step 6：推送到 GitHub](#step-6推送到-github)
9. [Step 7：部署到 Render](#step-7部署到-render)
10. [Step 8：設定 LINE Webhook](#step-8設定-line-webhook)
11. [Step 9：設定管理者身份](#step-9設定管理者身份)
12. [Step 10：設定 UptimeRobot 防休眠](#step-10設定-uptimerobot-防休眠)
13. [Step 11：邀請 Bot 進入群組](#step-11邀請-bot-進入群組)
14. [常見問題與疑難排解](#常見問題與疑難排解)

---

## 1. 整體架構說明

在開始之前，先了解整個系統是怎麼運作的：

```
學員/客戶在 LINE 群組發訊息
         │
         ▼
  LINE 伺服器接收訊息
         │
         ▼  透過 Webhook 推送
  ┌─────────────────────────┐
  │  你的伺服器（Render）      │
  │                          │
  │  1. 驗證訊息來自 LINE     │
  │  2. 判斷是否需要回覆      │
  │  3. 呼叫 AI 生成回覆      │
  │  4. 透過 LINE API 回覆    │
  └────────┬────────────────┘
           │
           ▼  呼叫 API
  ┌─────────────────────────┐
  │  OpenRouter（AI 引擎）    │
  │  將訊息交給 AI 模型處理    │
  │  回傳 AI 生成的回覆       │
  └─────────────────────────┘
```

### 你需要的帳號（全部免費）

| 服務 | 用途 | 費用 |
|------|------|------|
| [LINE Developers](https://developers.line.biz/) | 建立聊天機器人 | 免費 |
| [OpenRouter](https://openrouter.ai/) | AI 模型 API | 免費模型可用 |
| [GitHub](https://github.com/) | 存放程式碼 | 免費 |
| [Render](https://render.com/) | 部署伺服器 | 免費方案 |
| [UptimeRobot](https://uptimerobot.com/) | 防止伺服器休眠 | 免費 |

---

## 2. 前置準備清單

請先確認你的電腦已安裝以下工具：

### Node.js（v18 以上）

1. 到 [Node.js 官網](https://nodejs.org/) 下載 LTS 版本
2. 安裝完成後，打開終端機（Terminal / CMD）驗證：

```bash
node -v    # 應顯示 v18.x.x 或更高
npm -v     # 應顯示 9.x.x 或更高
```

### Git

1. 到 [Git 官網](https://git-scm.com/) 下載安裝
2. 驗證安裝：

```bash
git --version    # 應顯示 git version 2.x.x
```

3. 設定 Git 身份（第一次使用才需要）：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的email@example.com"
```

---

## Step 1：建立 LINE Official Account

### 1.1 建立 Provider 和 Channel

1. 前往 [LINE Developers Console](https://developers.line.biz/console/)
2. 用你的 LINE 帳號登入
3. 點 **「Create a new provider」**
   - Provider name：填你的公司或專案名稱（例如：`凝聚力學院`）
4. 點 **「Create a Messaging API channel」**
   - Channel name：Bot 的名字（例如：`夏以甯`），這會顯示在 LINE 上
   - Channel description：簡短描述
   - Category / Subcategory：選最接近的分類
   - 勾選同意條款 → 點 **Create**

### 1.2 取得 Channel Secret

1. 在 Channel 頁面，點上方的 **「Basic settings」** 分頁
2. 往下找到 **「Channel secret」**
3. 複製這串文字，先存到記事本

```
Channel Secret 長這樣（32 字元）：
a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

### 1.3 取得 Channel Access Token

1. 點上方的 **「Messaging API」** 分頁
2. 往下拉到最底部，找到 **「Channel access token (long-lived)」**
3. 點 **「Issue」** 按鈕產生 Token
4. 複製這串很長的文字，存到記事本

```
Channel Access Token 長這樣（約 170+ 字元）：
xYz7AbCdEfGhIjKlMnOpQrStUvWx1234567...
```

> ⚠️ **這兩個值非常重要，不要分享給任何人。**

### 1.4 關閉自動回應訊息

1. 在 Messaging API 分頁，找到 **「Auto-reply messages」**
2. 點 **「Edit」**，會跳到 LINE Official Account Manager
3. 將 **「自動回應訊息」** 設為 **關閉**
4. 將 **「Webhook」** 設為 **開啟**

> 如果不關自動回應，LINE 官方的罐頭回覆會跟你的 AI 助教搶著回話。

### 1.5 允許加入群組

1. 在 LINE Developers Console 的 **「Messaging API」** 分頁
2. 找到 **「Allow bot to join group chats」**
3. 確認是 **「Enabled」**
4. 如果是 Disabled，點 **「Edit」** 改為 Enabled

> ⚠️ **如果沒開這個，Bot 被邀請進群組後會立刻自動退出！**

---

## Step 2：取得 OpenRouter API Key

1. 前往 [OpenRouter](https://openrouter.ai/)，註冊帳號
2. 登入後，前往 [API Keys](https://openrouter.ai/keys)
3. 點 **「Create Key」**
4. 複製 API Key，存到記事本

```
OpenRouter API Key 長這樣：
sk-or-v1-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6...
```

### 選擇 AI 模型

OpenRouter 支援多種 AI 模型，以下是推薦選項：

| 模型 ID | 特色 | 費用 |
|---------|------|------|
| `arcee-ai/trinity-large-preview:free` | 免費可用 | 免費 |
| `google/gemini-2.0-flash` | 快速、便宜 | 極低 |
| `anthropic/claude-sonnet-4` | 高品質 | 中等 |
| `openai/gpt-4o-mini` | 平衡 | 低 |

> 建議先用免費模型測試，確認流程通了再換付費模型。

---

## Step 3：下載專案程式碼

### 方法一：Clone 現有 Repo（推薦）

```bash
git clone https://github.com/你的帳號/line-ai-assistant.git
cd line-ai-assistant
```

### 方法二：從零開始建立

如果你想自己建立專案：

```bash
mkdir line-ai-assistant
cd line-ai-assistant
npm init -y
npm install express dotenv
```

然後將 `server.js`、`config.json`、`system-prompt.txt` 等檔案放進去。

---

## Step 4：設定環境變數

### 4.1 建立 .env 檔案

```bash
cp .env.example .env
```

### 4.2 編輯 .env

用文字編輯器（VS Code、記事本等）打開 `.env`，填入你的金鑰：

```env
# ===== LINE Messaging API =====
LINE_CHANNEL_ACCESS_TOKEN=貼上你的Channel_Access_Token
LINE_CHANNEL_SECRET=貼上你的Channel_Secret

# ===== OpenRouter API =====
OPENROUTER_API_KEY=貼上你的OpenRouter_API_Key

# ===== AI 模型 =====
AI_MODEL=arcee-ai/trinity-large-preview:free

# ===== 伺服器設定 =====
PORT=3000
MAX_HISTORY=50
```

> ⚠️ **重要：`.env` 檔案包含你的所有金鑰，絕對不能上傳到 GitHub！**
> 專案已設定 `.gitignore` 來排除此檔案，但請務必確認。

---

## Step 5：設定公司資訊與 AI 人格

### 5.1 編輯 config.json

```json
{
  "botName": "你的Bot名字",
  "companyName": "你的公司名稱",
  "companyInfo": "公司簡介、產品服務、常見問答...",
  "siteUrl": "https://your-website.com",
  "triggerKeywords": ["夏以甯", "以甯", "夏助教", "助教"],
  "commandPrefixes": ["/ai", "/助理"],
  "members": []
}
```

重要欄位說明：

| 欄位 | 說明 | 範例 |
|------|------|------|
| `botName` | Bot 在群組中的名字 | `"夏以甯"` |
| `companyName` | 公司名稱 | `"凝聚力學院"` |
| `companyInfo` | AI 回答問題時參考的資料 | 公司簡介、FAQ 等 |
| `triggerKeywords` | 群組中觸發回覆的關鍵字 | `["夏以甯", "以甯", "助教"]` |
| `commandPrefixes` | 成員下指令的前綴 | `["/ai", "/助理"]` |
| `members` | 公司成員清單（稍後設定） | 先留空 `[]` |

### 5.2 編輯 system-prompt.txt（AI 人格）

這個檔案定義 AI 助教的個性、說話方式和行為準則。
可以用 `{{BOT_NAME}}`、`{{COMPANY_NAME}}`、`{{MEMBER_LIST}}`、`{{COMPANY_INFO}}` 作為變數，程式會自動替換成 `config.json` 中的值。

> 💡 人格設定越具體，AI 的回覆越符合你的期望。

### 5.3 本地測試（選做）

```bash
npm install
npm run dev
```

伺服器啟動後，打開瀏覽器訪問 `http://localhost:3000/`，如果看到：

```json
{ "status": "running", "bot": "你的Bot名字", ... }
```

代表程式碼沒問題，可以進行下一步。

---

## Step 6：推送到 GitHub

### 6.1 在 GitHub 建立新 Repo

1. 到 [github.com/new](https://github.com/new)
2. Repository name：`line-ai-assistant`（或你喜歡的名字）
3. 選 **Public** 或 **Private**（Private 更安全）
4. **不要**勾選 Add README / .gitignore / license
5. 點 **Create repository**

### 6.2 推送程式碼

```bash
cd line-ai-assistant

# 初始化 Git（如果還沒做過）
git init

# 加入檔案（注意：不要加入 .env！）
git add package.json server.js config.json system-prompt.txt .env.example .gitignore SETUP.md README.md

# 確認 .env 沒有被加入
git status
# 應該看到 .env 不在列表中

# 提交
git commit -m "初始版本"

# 連結 GitHub Repo
git branch -M main
git remote add origin https://github.com/你的帳號/line-ai-assistant.git

# 推送
git push -u origin main
```

> ⚠️ **推送前請再次確認：`git status` 中不能出現 `.env` 檔案！**

---

## Step 7：部署到 Render

### 7.1 建立帳號

1. 到 [Render.com](https://render.com/) 註冊（建議用 GitHub 帳號登入，方便連結）

### 7.2 建立 Web Service

1. 登入後，點 **「New +」** → **「Web Service」**
2. 選 **「Build and deploy from a Git repository」**
3. 連結你的 GitHub 帳號，選擇 `line-ai-assistant` Repo
4. 填入設定：

| 欄位 | 填入值 |
|------|--------|
| **Name** | `line-ai-assistant`（或任意名稱） |
| **Region** | 選離你最近的（例如 Singapore） |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free`（免費方案） |

### 7.3 設定環境變數

在頁面下方的 **「Environment Variables」** 區塊，點 **「Add Environment Variable」**，加入：

| Key | Value |
|-----|-------|
| `LINE_CHANNEL_ACCESS_TOKEN` | 貼上你的 Token |
| `LINE_CHANNEL_SECRET` | 貼上你的 Secret |
| `OPENROUTER_API_KEY` | 貼上你的 API Key |
| `AI_MODEL` | `arcee-ai/trinity-large-preview:free` |

> 💡 Render 的環境變數存在伺服器端，不會出現在 GitHub 上，是安全的。
> 💡 `RENDER_EXTERNAL_URL` 不需要手動加，Render 會自動提供。

### 7.4 建立部署

點 **「Create Web Service」**，等待部署完成（約 2-5 分鐘）。

### 7.5 驗證部署成功

部署完成後，Render 會給你一個網址，例如：

```
https://line-ai-assistant-xxxx.onrender.com
```

用瀏覽器打開這個網址，如果看到類似以下內容就代表成功：

```json
{
  "status": "running",
  "bot": "夏以甯",
  "model": "arcee-ai/trinity-large-preview:free",
  "uptime": "1 分鐘"
}
```

---

## Step 8：設定 LINE Webhook

### 8.1 填入 Webhook URL

1. 回到 [LINE Developers Console](https://developers.line.biz/console/)
2. 進入你的 Messaging API Channel
3. 點 **「Messaging API」** 分頁
4. 找到 **「Webhook settings」**
5. 在 **「Webhook URL」** 填入：

```
https://你的應用名稱.onrender.com/webhook
```

> ⚠️ **注意結尾一定要加上 `/webhook`，不能只填根網址！**

6. 開啟 **「Use webhook」** 開關
7. 點 **「Verify」** 按鈕

### 8.2 確認結果

- 顯示 **「Success」** → 恭喜，連線成功！進入下一步。
- 顯示 **「Error」** → 請參考下方[疑難排解](#常見問題與疑難排解)。

---

## Step 9：設定管理者身份

### 9.1 取得你的 LINE userId

用 LINE 私訊你的官方帳號（就是 Bot），傳送：

```
/myid
```

Bot 會回覆：

```
【你的 LINE 資訊】
顯示名稱：你的名字
userId：U1234567890abcdef1234567890abcdef
```

### 9.2 更新 config.json

將你的 userId 填入 `config.json` 的 `members` 陣列：

```json
{
  "members": [
    {
      "userId": "U1234567890abcdef1234567890abcdef",
      "name": "你的名字",
      "role": "admin"
    }
  ]
}
```

角色說明：
- `admin`：最高管理者，可使用所有管理指令
- `member`：公司成員，可對 Bot 下指令

### 9.3 推送更新

```bash
git add config.json
git commit -m "設定管理者"
git push
```

Render 會自動偵測到更新並重新部署（約 1-2 分鐘）。

### 9.4 測試管理者指令

用 LINE 私訊 Bot，傳送：

```
/狀態
```

如果收到系統狀態回覆，代表管理者設定成功！

---

## Step 10：設定 UptimeRobot 防休眠

### 為什麼需要這一步？

Render 免費方案在 15 分鐘沒有請求時會自動休眠。休眠期間 Bot 無法接收和回覆 LINE 訊息。

### 10.1 註冊 UptimeRobot

1. 到 [UptimeRobot.com](https://uptimerobot.com/) 免費註冊

### 10.2 新增 Monitor

1. 點 **「+ Add New Monitor」**
2. 填入：

| 欄位 | 填入 |
|------|------|
| **Monitor Type** | `HTTP(s)` |
| **Friendly Name** | 任意名稱（例如：`夏以甯助教`） |
| **URL (or IP)** | `https://你的應用.onrender.com/` |
| **Monitoring Interval** | `Every 5 minutes` |

3. 點 **「Create Monitor」**

### 10.3 雙重保險

此時你的系統有兩道防休眠機制：

```
第 1 道：UptimeRobot 每 5 分鐘 ping 一次
第 2 道：伺服器內建每 14 分鐘自我 ping（自動偵測 Render 環境）

兩道同時運作，確保伺服器永不休眠 ☀️
```

---

## Step 11：邀請 Bot 進入群組

1. 打開 LINE，建立一個測試群組（或使用現有群組）
2. 點群組右上角的選單 → **「邀請」**
3. 搜尋你的 Bot 名稱，邀請加入
4. Bot 加入後會自動發送招呼訊息

### 測試對話

在群組中傳送包含觸發關鍵字的訊息，例如：

```
以甯 你好
```

Bot 應該會回覆。觸發關鍵字可在 `config.json` 的 `triggerKeywords` 中設定。

### 管理者指令（群組中也能用）

```
/摘要      → 產生對話重點摘要
/狀態      → 查看系統運行狀態
/清除歷史   → 清除此群組的對話紀錄
/說明      → 顯示指令清單
```

---

## 常見問題與疑難排解

### 🔴 Bot 完全沒有回覆

**可能原因 1：Webhook 沒開啟**

✅ 解決：到 LINE Developers Console → Messaging API → 確認 Use webhook 是開啟狀態

**可能原因 2：自動回應還沒關**

✅ 解決：到 LINE Official Account Manager → 回應設定 → 關閉自動回應訊息

**可能原因 3：Render 伺服器還在部署中**

✅ 解決：到 Render Dashboard 查看部署狀態，等待顯示 **「Live」**

**可能原因 4：Webhook URL 填錯**

✅ 解決：確認 URL 結尾有 `/webhook`，例如：
```
✅ https://line-ai-assistant-xxxx.onrender.com/webhook
❌ https://line-ai-assistant-xxxx.onrender.com
❌ https://line-ai-assistant-xxxx.onrender.com/
```

---

### 🔴 Bot 回覆「抱歉，目前系統繁忙，請稍後再試。」

這代表 Webhook 正常但 AI API 呼叫失敗。

**可能原因 1：OpenRouter API Key 無效或未設定**

✅ 解決：到 Render → Environment，確認 `OPENROUTER_API_KEY` 有正確填入，前後沒有多餘空白

**可能原因 2：AI 模型 ID 打錯**

✅ 解決：確認 `AI_MODEL` 的值是正確的模型 ID，到 [OpenRouter Models](https://openrouter.ai/models) 確認

**可能原因 3：HTTP 標頭包含中文字**

症狀：Render Logs 顯示 `Cannot convert argument to a ByteString`

✅ 解決：確認 `server.js` 中的 `X-Title` 標頭使用英文，不包含中文字：
```javascript
// ✅ 正確
'X-Title': 'LINE AI Assistant',

// ❌ 錯誤（中文會導致崩潰）
'X-Title': config.botName,   // 如果 botName 是中文就會出錯
```

---

### 🔴 Bot 被邀請進群組後立刻退出

**原因：LINE 沒有開放 Bot 加入群組的權限**

✅ 解決：
1. LINE Developers Console → Messaging API 分頁
2. 找到 **「Allow bot to join group chats」**
3. 改為 **Enabled**

---

### 🔴 Bot 在群組中不回覆，但私訊有回覆

**原因：在群組中需要提及觸發關鍵字才會觸發**

✅ 解決：在訊息中包含 `config.json` 裡設定的 `triggerKeywords` 關鍵字，例如：
```
以甯 你好
助教 請問一下
```

預設觸發關鍵字為：夏以甯、以甯、夏助教、助教。

---

### 🔴 Webhook Verify 失敗

**可能原因 1：Render 還沒部署完成**

✅ 解決：等待 Render 顯示 **「Live」** 後再點 Verify

**可能原因 2：URL 格式錯誤**

✅ 解決：
```
✅ https://line-ai-assistant-xxxx.onrender.com/webhook
❌ http://line-ai-assistant-xxxx.onrender.com/webhook  （少了 s）
❌ https://line-ai-assistant-xxxx.onrender.com/Webhook  （大小寫錯誤）
```

---

### 🔴 Render 免費方案伺服器休眠，Bot 不回覆

**症狀：一段時間沒使用後，第一則訊息不回覆，第二則才回覆**

✅ 解決：設定 UptimeRobot（參考 [Step 10](#step-10設定-uptimerobot-防休眠)）

---

### 🔴 不知道自己的 LINE userId

✅ 解決：私訊 Bot，傳送 `/myid`，Bot 會回覆你的 userId 和顯示名稱

---

### 🔴 改了 config.json 但 Bot 行為沒變

**原因：Render 上跑的是舊版程式碼**

✅ 解決：修改檔案後，必須 commit 並 push 到 GitHub，Render 才會自動重新部署

```bash
git add config.json
git commit -m "更新設定"
git push
```

然後等 1-2 分鐘讓 Render 重新部署完成。

---

### 🔴 推送到 GitHub 後發現 .env 被上傳了

**⚠️ 這是嚴重的安全問題！你的金鑰已經洩露！**

✅ 緊急處理步驟：
1. 立即到 OpenRouter 撤銷舊的 API Key，產生新的
2. 到 LINE Developers Console 重新 Issue 新的 Channel Access Token
3. 從 GitHub 刪除 .env：
```bash
git rm --cached .env
git commit -m "移除意外上傳的 .env"
git push
```
4. 確認 `.gitignore` 中有 `.env`
5. 到 Render 更新環境變數為新的金鑰

---

### 🟡 如何新增其他公司成員？

1. 請對方私訊 Bot，傳送 `/myid`
2. 拿到對方的 userId 後，編輯 `config.json`：

```json
{
  "members": [
    {
      "userId": "U管理者的ID",
      "name": "管理者名字",
      "role": "admin"
    },
    {
      "userId": "U新成員的ID",
      "name": "新成員名字",
      "role": "member"
    }
  ]
}
```

3. 推送到 GitHub：
```bash
git add config.json
git commit -m "新增成員"
git push
```

---

### 🟡 如何更換 AI 模型？

到 Render Dashboard → Environment → 修改 `AI_MODEL` 的值：

```
arcee-ai/trinity-large-preview:free    ← 免費
google/gemini-2.0-flash                ← 便宜且快速
anthropic/claude-sonnet-4              ← 高品質
openai/gpt-4o-mini                     ← 平衡
```

修改後 Render 會自動重新部署。

> 也可以在 `config.json` 或 `.env` 中修改，但在 Render 環境變數中修改最方便，不需要重新 push 程式碼。

---

### 🟡 如何查看伺服器日誌？

1. 到 Render Dashboard → 你的 Service
2. 點左邊的 **「Logs」**
3. 可以看到即時的運行日誌，包括：
   - `[靜默]` — Bot 收到訊息但判斷不需回覆
   - `[回覆]` — Bot 收到訊息並回覆
   - `[保活]` — 保活機制 ping 紀錄
   - 錯誤訊息

---

## 完成！🎉

恭喜你完成了整個部署流程！你的 AI 助教現在應該：

- ✅ 可以在 LINE 私訊中回覆
- ✅ 可以加入群組並安靜待命
- ✅ 提到觸發關鍵字時回覆（如：以甯、助教）
- ✅ 管理者可以使用管理指令
- ✅ 24 小時不休眠持續運行

如果有任何問題，請檢查 Render 的 Logs 日誌，通常能找到錯誤原因。
