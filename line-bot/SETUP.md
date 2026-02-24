# LINE AI 客服助理 — 設定與部署指南

## 前置準備

### Step 1：建立 LINE Official Account

1. 前往 [LINE Developers Console](https://developers.line.biz/console/)
2. 建立 Provider → 建立 Messaging API Channel
3. 在 Channel 設定頁面取得：
   - **Channel Secret**（Basic settings 頁面）
   - **Channel Access Token**（Messaging API 頁面，點 Issue 產生）
4. 關閉「自動回應訊息」（在 LINE Official Account Manager → 回應設定）

### Step 2：取得 OpenRouter API Key

1. 前往 [OpenRouter](https://openrouter.ai/)
2. 註冊/登入 → [API Keys](https://openrouter.ai/keys)
3. 建立新的 API Key

### Step 3：取得公司成員的 LINE userId

方法一：用 LINE Bot 取得
- 先部署好 Bot，讓成員加 Bot 好友
- 在伺服器 log 中可看到每位用戶的 userId

方法二：寫一個簡單的 echo bot 回傳 userId
- 成員私訊 Bot，Bot 回覆他的 userId

> LINE userId 格式為 `U` 開頭的 33 字元字串，例如：`U1234567890abcdef1234567890abcdef`

---

## 本地安裝

```bash
cd line-bot
cp .env.example .env      # 複製環境變數模板
# 編輯 .env 填入你的 Token 和 Key
npm install                # 安裝依賴
npm run dev                # 啟動開發模式（自動重載）
```

## 設定檔說明

### config.json

```jsonc
{
  "botName": "AI小助理",        // Bot 在群組中的名字
  "companyName": "你的公司名稱",  // 公司名稱
  "companyInfo": "公司簡介...",   // AI 回覆時參考的公司資訊
  "commandPrefixes": ["/ai", "/助理", "助理"],  // 觸發指令前綴
  "members": [
    {
      "userId": "Uxxxx",         // LINE userId
      "name": "王經理",           // 顯示名稱
      "role": "admin"            // admin 或 member
    }
  ]
}
```

### system-prompt.txt

AI 助理的人格設定和回覆準則。可直接編輯此檔案自訂：
- `{{BOT_NAME}}` → 自動替換為 config.json 中的 botName
- `{{COMPANY_NAME}}` → 自動替換為 companyName
- `{{MEMBER_LIST}}` → 自動替換為成員清單
- `{{COMPANY_INFO}}` → 自動替換為 companyInfo

---

## 部署到 Render（免費）

1. 把程式碼推到 GitHub Repository
2. 前往 [Render](https://render.com/) → New Web Service
3. 連結 GitHub Repo，設定：
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Root Directory**: `line-bot`
4. 在 Environment 加入環境變數（從 .env 複製）
5. 部署完成後取得 URL，例如 `https://your-app.onrender.com`
6. 回到 LINE Developers Console → Messaging API → Webhook URL：
   ```
   https://your-app.onrender.com/webhook
   ```
7. 開啟「Use webhook」
8. 點「Verify」確認連線成功

---

## 使用方式

### 在群組中
- `@AI小助理 請問明天有空嗎？` → AI 回覆
- `@AI小助理 幫我整理剛才的需求` → AI 整理對話摘要

### 管理者指令
- `/摘要` → 產生目前對話的重點摘要
- `/清除歷史` → 清除對話紀錄
- `/狀態` → 查看系統運行狀態
- `/說明` → 顯示指令清單

### AI 不會回覆的情況
- 群組成員之間的一般對話
- 沒有 @Bot 或提及 Bot 名字的訊息
- 公司成員不是以指令前綴開頭的訊息

---

## 常見問題

**Q: AI 回覆太慢？**
A: 換用更快的模型，在 .env 改 `AI_MODEL=google/gemini-2.0-flash`

**Q: 想讓 AI 知道更多公司資訊？**
A: 編輯 config.json 的 companyInfo，或修改 system-prompt.txt

**Q: Render 免費方案會休眠？**
A: 是的，15 分鐘沒有請求會休眠。可用 UptimeRobot 免費服務每 5 分鐘 ping 一次保持喚醒。

**Q: 如何加新的公司成員？**
A: 編輯 config.json 的 members 陣列，加入新成員的 userId，重新部署。
