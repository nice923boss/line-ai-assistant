# 夏以甯助教 — LINE AI 客服助理

> 凝聚力學院的 AI 助教，可加入 LINE 群組與學員即時互動，安靜聆聽、適時回覆。

---

## 專案簡介

「夏以甯」是一位為 [凝聚力學院](https://nice923boss.github.io/Cohesion-Academy/) 打造的 LINE AI 客服助教。她能被加入到公司成員與學員的 LINE 群組中，在背後安靜監聽對話，只在被 @mention 或明確呼叫時才回覆，協助團隊進行客戶溝通與學員服務。

### 命名由來

> 「以甯」取自「以心安甯」，代表用溫暖與耐心，讓每一位來到學院的人都能感到安心。

---

## 核心功能

| 功能 | 說明 |
|------|------|
| **群組對話監聽** | 加入 LINE 群組後，安靜記錄所有對話內容 |
| **@mention 觸發** | 被 @夏以甯 或提及名字時才回覆，絕不隨意插話 |
| **身份識別** | 自動區分公司成員與客戶，依角色調整應對方式 |
| **成員指令** | 公司成員可下指令給助教，安排溝通任務 |
| **對話摘要** | 管理者可用 `/摘要` 指令，AI 自動產生對話重點 |
| **私訊回覆** | 學員私訊官方帳號時，自動回覆 |
| **自我保活** | 內建防休眠機制，搭配 UptimeRobot 雙重保險 |

---

## 系統架構

```
LINE 群組 / 私訊
       │
       ▼  Webhook (POST /webhook)
┌──────────────────────────┐
│    Express.js Server     │
│    (Render 雲端部署)       │
│                          │
│  ┌─ 驗證 LINE 簽名       │
│  ├─ 儲存對話歷史          │
│  ├─ 身份判斷（成員/客戶）  │
│  ├─ 觸發判斷引擎          │
│  │   ├ @mention？         │
│  │   ├ 提及名字？         │
│  │   ├ 成員指令？         │
│  │   └ 私訊？             │
│  └─ 呼叫 AI → 回覆 LINE  │
└──────────┬───────────────┘
           │
           ▼  API Call
┌──────────────────────────┐
│     OpenRouter API       │
│  (AI 模型統一接口)        │
│  支援 Claude / GPT /     │
│  Gemini 等多種模型        │
└──────────────────────────┘
```

---

## 使用的技術與工具

| 類別 | 工具 |
|------|------|
| **執行環境** | Node.js (≥ 18) |
| **Web 框架** | Express.js |
| **LINE 串接** | LINE Messaging API (Webhook + Reply API) |
| **AI 引擎** | OpenRouter API（可自由切換 AI 模型） |
| **雲端部署** | Render (Web Service) |
| **防休眠** | 內建保活機制 + UptimeRobot |
| **版本控制** | Git + GitHub |

---

## 檔案結構

```
line-ai-assistant/
├── server.js           # 主程式（Webhook、AI 呼叫、事件處理）
├── config.json         # Bot 名稱、公司資訊、成員清單
├── system-prompt.txt   # AI 人格設定與回覆準則
├── package.json        # 依賴管理
├── .env.example        # 環境變數模板（不含真實金鑰）
├── .gitignore          # 排除 .env 和 node_modules
├── SETUP.md            # 詳細部署指南
└── README.md           # 本文件
```

---

## 快速開始

### 1. 前置準備

- [LINE Developers Console](https://developers.line.biz/) — 建立 Messaging API Channel
- [OpenRouter](https://openrouter.ai/) — 取得 API Key
- [Render](https://render.com/) — 部署伺服器
- [UptimeRobot](https://uptimerobot.com/) — 防止免費方案休眠（選配）

### 2. 環境變數設定

複製 `.env.example` 為 `.env`，填入你的金鑰：

```bash
cp .env.example .env
```

需要設定的變數：

| 變數 | 說明 |
|------|------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API Token |
| `LINE_CHANNEL_SECRET` | LINE Channel Secret |
| `OPENROUTER_API_KEY` | OpenRouter API 金鑰 |
| `AI_MODEL` | AI 模型 ID（可選，預設 `anthropic/claude-sonnet-4`）|

> ⚠️ **`.env` 包含機密金鑰，已被 `.gitignore` 排除，不會上傳到 GitHub。**

### 3. 本地開發

```bash
npm install
npm run dev     # 啟動開發模式（自動重載）
```

### 4. 部署到 Render

1. Fork 或 Clone 本 Repo
2. 在 Render 建立 Web Service，連結 GitHub Repo
3. 設定 Build Command: `npm install`、Start Command: `npm start`
4. 在 Render Environment 加入環境變數
5. 部署完成後，將 Webhook URL 填入 LINE Developers Console：
   ```
   https://你的應用.onrender.com/webhook
   ```

> 📘 完整步驟請參考 [SETUP.md](./SETUP.md)

---

## 使用方式

### 群組中呼叫

```
@夏以甯 請問凝聚力學院的課程是免費的嗎？
```

### 管理者指令

| 指令 | 功能 |
|------|------|
| `/摘要` | 產生目前對話的重點摘要 |
| `/狀態` | 查看系統運行狀態 |
| `/清除歷史` | 清除此群組的對話紀錄 |
| `/說明` | 顯示指令清單 |

### 觸發規則

| 情境 | 是否回覆 |
|------|:--------:|
| 被 @夏以甯 | ✅ |
| 訊息中提及「夏以甯」「以甯」 | ✅ |
| 成員下指令 `/助理` `/ai` | ✅ |
| 私訊官方帳號 | ✅ |
| 群組一般對話 | ❌ 安靜待命 |

---

## 自訂設定

### 修改 AI 人格

編輯 `system-prompt.txt`，可自訂：
- 助教的個性與說話風格
- 回覆準則與禁止事項
- 常見問題的回覆指引
- 公司資訊（透過 `config.json` 的 `companyInfo` 自動帶入）

### 修改公司成員

編輯 `config.json` 的 `members` 陣列，加入成員的 LINE userId：

```jsonc
{
  "members": [
    {
      "userId": "Uxxxxx",    // LINE userId
      "name": "顯示名稱",
      "role": "admin"        // admin 或 member
    }
  ]
}
```

### 切換 AI 模型

在 `.env` 修改 `AI_MODEL`，支援 OpenRouter 上的所有模型：

```bash
# 高品質
AI_MODEL=anthropic/claude-sonnet-4

# 快速便宜
AI_MODEL=google/gemini-2.0-flash

# 免費
AI_MODEL=arcee-ai/trinity-large-preview:free
```

---

## 關於凝聚力學院

[凝聚力學院](https://nice923boss.github.io/Cohesion-Academy/) 是一個完全免費的線上學習平台。

- 🎓 所有課程 100% 免費
- 📌 講師免費上架，平台零抽成
- 💛 透過 Donate 機制支持講師
- 🏠 廣告收入用於舉辦免費線下活動

> 這不只是一個平台，而是一個共創與分享的社群。

---

## License

MIT
