require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ============================================================
//  LINE AI 客服助理 — OpenRouter API 驅動
//  功能：加入 LINE 群組，監聽對話，提及關鍵字時回覆
// ============================================================

// ----- 環境變數 -----
const {
  LINE_CHANNEL_ACCESS_TOKEN,
  LINE_CHANNEL_SECRET,
  OPENROUTER_API_KEY,
  AI_MODEL = 'anthropic/claude-sonnet-4',
  PORT = 3000,
  MAX_HISTORY = '50',
} = process.env;

// 啟動檢查
if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_CHANNEL_SECRET || !OPENROUTER_API_KEY) {
  console.error('缺少必要環境變數，請檢查 .env 檔案');
  console.error('需要: LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET, OPENROUTER_API_KEY');
  process.exit(1);
}

// ----- 讀取設定檔 -----
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const systemPromptTemplate = fs.readFileSync(path.join(__dirname, 'system-prompt.txt'), 'utf8');

// ----- 狀態管理 -----
const conversationHistory = new Map();  // groupId → [{ role, name, content, timestamp }]
const displayNameCache = new Map();     // userId → displayName
let botProfile = { userId: null, displayName: null };

// ----- 學習需求 & 講師申請 -----
const pendingLearningNeeds = [];                // [{ userId, displayName, need, timestamp }]
const pendingInstructorApps = new Map();         // userId → { displayName, email, academyName, sourceId, timestamp, status }

// ============================================================
//  LINE API 工具函數
// ============================================================

async function lineFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`LINE API 錯誤 [${res.status}]: ${text}`);
    return null;
  }
  return res.json();
}

// 取得 Bot 自己的資訊
async function fetchBotProfile() {
  const data = await lineFetch('https://api.line.me/v2/bot/info');
  if (data) {
    botProfile.userId = data.userId;
    botProfile.displayName = data.displayName;
    console.log(`Bot 資訊: ${data.displayName} (${data.userId})`);
  }
}

// 取得群組成員顯示名稱
async function getDisplayName(userId, groupId) {
  if (displayNameCache.has(userId)) return displayNameCache.get(userId);

  // 先查設定檔中的成員
  const member = config.members.find(m => m.userId === userId);
  if (member) {
    displayNameCache.set(userId, member.name);
    return member.name;
  }

  // 向 LINE API 查詢
  let data = null;
  if (groupId) {
    data = await lineFetch(`https://api.line.me/v2/bot/group/${groupId}/member/${userId}`);
  } else {
    data = await lineFetch(`https://api.line.me/v2/bot/profile/${userId}`);
  }

  const name = data?.displayName || '未知用戶';
  displayNameCache.set(userId, name);
  return name;
}

// 回覆訊息（使用 replyToken，免費無上限）
async function lineReply(replyToken, text) {
  // LINE 單則訊息上限 5000 字
  const truncated = text.length > 5000 ? text.slice(0, 4990) + '...(略)' : text;
  return lineFetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text: truncated }],
    }),
  });
}

// 主動推送訊息（備用方案，有月量限制）
async function linePush(targetId, text) {
  const truncated = text.length > 5000 ? text.slice(0, 4990) + '...(略)' : text;
  return lineFetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    body: JSON.stringify({
      to: targetId,
      messages: [{ type: 'text', text: truncated }],
    }),
  });
}

// ============================================================
//  對話歷史管理
// ============================================================

function addToHistory(sourceId, entry) {
  if (!conversationHistory.has(sourceId)) {
    conversationHistory.set(sourceId, []);
  }
  const history = conversationHistory.get(sourceId);
  history.push(entry);

  // 保留最近 N 筆
  const max = parseInt(MAX_HISTORY, 10);
  if (history.length > max) {
    history.splice(0, history.length - max);
  }
}

function getHistory(sourceId) {
  return conversationHistory.get(sourceId) || [];
}

// ============================================================
//  動作標記解析 — 解析 AI 回覆中的 <<ACTION:...>> 標記
// ============================================================

function parseActionTags(text) {
  const actions = [];
  const cleanText = text.replace(/<<ACTION:(.*?)>>/g, (_match, content) => {
    actions.push(content.trim());
    return '';
  });
  return { cleanText: cleanText.trim(), actions };
}

async function processActions(actions, userId, displayName, sourceId) {
  for (const action of actions) {
    if (action.startsWith('LEARNING_NEED:')) {
      const need = action.slice('LEARNING_NEED:'.length).trim();
      pendingLearningNeeds.push({
        userId,
        displayName,
        need,
        timestamp: new Date().toISOString(),
      });
      console.log(`[學習需求] ${displayName}: ${need}`);

    } else if (action.startsWith('INSTRUCTOR_APP:')) {
      const payload = action.slice('INSTRUCTOR_APP:'.length).trim();
      const separatorIndex = payload.indexOf('|');
      if (separatorIndex === -1) {
        console.warn(`[講師申請] 格式錯誤: ${payload}`);
        continue;
      }
      const email = payload.slice(0, separatorIndex).trim();
      const academyName = payload.slice(separatorIndex + 1).trim();

      pendingInstructorApps.set(userId, {
        userId,
        displayName,
        email,
        academyName,
        sourceId,
        timestamp: new Date().toISOString(),
        status: 'pending',
      });

      console.log(`[講師申請] ${displayName} (${email}, ${academyName})`);
      await notifyAdminInstructorApp(userId, displayName, email, academyName);
    }
  }
}

async function notifyAdminInstructorApp(userId, displayName, email, academyName) {
  const admins = config.members.filter(m => m.role === 'admin');
  const message = [
    `【講師申請通知】`,
    `LINE 顯示名稱：${displayName}`,
    `LINE userId：${userId}`,
    `學院註冊名稱：${academyName}`,
    `Email：${email}`,
    ``,
    `請審核後使用以下指令提供講師碼：`,
    `/講師碼 ${userId} 您的講師邀請碼`,
  ].join('\n');

  for (const admin of admins) {
    await linePush(admin.userId, message);
  }
}

// ============================================================
//  每日學習需求彙整（台灣時間每晚 20:00）
// ============================================================

function scheduleDailyLearningReport() {
  let lastSentDate = null;

  setInterval(() => {
    const now = new Date();
    // 台灣時間 = UTC + 8
    const taiwanHour = (now.getUTCHours() + 8) % 24;
    const todayStr = now.toISOString().slice(0, 10);

    if (taiwanHour === 20 && now.getUTCMinutes() === 0 && lastSentDate !== todayStr) {
      lastSentDate = todayStr;
      sendDailyLearningReport();
    }
  }, 60 * 1000); // 每分鐘檢查一次

  console.log('[排程] 學習需求日報排程已啟動（每日台灣時間 20:00）');
}

async function sendDailyLearningReport() {
  if (pendingLearningNeeds.length === 0) {
    console.log('[日報] 今日無學習需求，跳過發送');
    return;
  }

  const needsList = pendingLearningNeeds.map((item, i) =>
    `${i + 1}. ${item.displayName}：${item.need}（${new Date(item.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}）`
  ).join('\n');

  const message = [
    `【每日學習需求彙整】`,
    `日期：${new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}`,
    `共 ${pendingLearningNeeds.length} 筆需求：`,
    ``,
    needsList,
  ].join('\n');

  const admins = config.members.filter(m => m.role === 'admin');
  for (const admin of admins) {
    await linePush(admin.userId, message);
  }

  console.log(`[日報] 已發送 ${pendingLearningNeeds.length} 筆學習需求給管理員`);

  // 清空已發送的需求
  pendingLearningNeeds.length = 0;
}

// ============================================================
//  觸發判斷引擎 — 決定是否回覆
// ============================================================

function shouldRespond(event, text, senderRole) {
  // 1. 文字中包含觸發關鍵字（取代 @mention，因為 LINE 官方帳號在群組中無法被 @）
  const keywords = config.triggerKeywords || [config.botName];
  for (const keyword of keywords) {
    if (keyword && text.includes(keyword)) {
      return { respond: true, reason: `提及關鍵字 (${keyword})` };
    }
  }

  // 2. 公司成員下指令（以特定前綴開頭）
  if (senderRole === 'admin' || senderRole === 'member') {
    const prefixes = config.commandPrefixes || ['/ai', '/助理'];
    for (const prefix of prefixes) {
      if (text.startsWith(prefix)) {
        return { respond: true, reason: `成員指令 (${prefix})` };
      }
    }
  }

  // 3. 1 對 1 私訊，總是回覆
  if (event.source.type === 'user') {
    return { respond: true, reason: '私訊' };
  }

  // 4. 以上皆非 → 沉默
  return { respond: false, reason: '未觸發' };
}

// ============================================================
//  建立 AI 訊息（System Prompt + 對話歷史）
// ============================================================

function buildSystemPrompt() {
  // 動態插入成員清單到 System Prompt
  const memberList = config.members
    .map(m => `- ${m.name}（${m.role === 'admin' ? '管理者' : '公司成員'}，LINE ID: ${m.userId}）`)
    .join('\n');

  return systemPromptTemplate
    .replace('{{BOT_NAME}}', config.botName || 'AI助理')
    .replace('{{COMPANY_NAME}}', config.companyName || '本公司')
    .replace('{{MEMBER_LIST}}', memberList || '（尚未設定）')
    .replace('{{COMPANY_INFO}}', config.companyInfo || '（尚未設定公司資訊）');
}

function buildMessages(sourceId, currentText, senderRole, senderName) {
  const systemPrompt = buildSystemPrompt();
  const history = getHistory(sourceId);

  // 將對話歷史轉為 OpenRouter 格式
  const messages = [{ role: 'system', content: systemPrompt }];

  // 加入歷史紀錄（不含當前這則，因為會另外加）
  for (const entry of history.slice(0, -1)) {
    if (entry.role === 'assistant') {
      messages.push({ role: 'assistant', content: entry.content });
    } else {
      const roleLabel = entry.role === 'admin' ? '管理者'
        : entry.role === 'member' ? '公司成員'
        : '客戶';
      messages.push({
        role: 'user',
        content: `[${roleLabel} ${entry.name}]: ${entry.content}`,
      });
    }
  }

  // 加入當前訊息
  const currentRoleLabel = senderRole === 'admin' ? '管理者'
    : senderRole === 'member' ? '公司成員'
    : '客戶';
  messages.push({
    role: 'user',
    content: `[${currentRoleLabel} ${senderName}]: ${currentText}`,
  });

  return messages;
}

// ============================================================
//  OpenRouter API 呼叫
// ============================================================

async function callOpenRouter(messages) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': config.siteUrl || 'https://line-ai-assistant.local',
        'X-Title': 'LINE AI Assistant',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`OpenRouter API 錯誤 [${res.status}]: ${errText}`);
      return null;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('OpenRouter API 呼叫失敗:', err.message);
    return null;
  }
}

// ============================================================
//  核心事件處理
// ============================================================

async function handleEvent(event) {
  // ----- 加入群組事件 -----
  if (event.type === 'join') {
    console.log(`[加入群組] ${event.source.groupId}`);
    const keywordHint = (config.triggerKeywords || [config.botName]).slice(0, 3).join('、');
    await lineReply(event.replyToken,
      `大家好，我是${config.botName || 'AI助理'}，${config.companyName || ''}的助教 😊\n` +
      `需要我幫忙的時候，訊息中提到「${keywordHint}」就可以叫我囉！\n` +
      `平常我會安靜待在旁邊，不會打擾大家的對話。`
    );
    return;
  }

  // ----- 只處理文字訊息 -----
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const sourceId = event.source.groupId || event.source.roomId || event.source.userId;
  const userId = event.source.userId;
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  // 忽略 Bot 自己的訊息
  if (userId === botProfile.userId) return;

  // 識別發言者身份
  const memberInfo = config.members.find(m => m.userId === userId);
  const senderRole = memberInfo?.role || 'customer';
  const displayName = await getDisplayName(userId, event.source.groupId);

  // 儲存到對話歷史
  addToHistory(sourceId, {
    role: senderRole,
    name: displayName,
    userId,
    content: text,
    timestamp: new Date().toISOString(),
  });

  // ----- 通用指令：查詢自己的 LINE userId -----
  if (text === '/myid' || text === '/我的ID') {
    await lineReply(replyToken,
      `【你的 LINE 資訊】\n` +
      `顯示名稱：${displayName}\n` +
      `userId：${userId}\n\n` +
      `請將此 userId 提供給管理者，\n` +
      `設定到 config.json 即可成為公司成員。`
    );
    return;
  }

  // ----- 管理者專用指令 -----
  if (senderRole === 'admin' && text.startsWith('/')) {
    const handled = await handleAdminCommand(text, replyToken, sourceId);
    if (handled) return;
  }

  // ----- 判斷是否回覆 -----
  const { respond, reason } = shouldRespond(event, text, senderRole);

  if (!respond) {
    console.log(`[靜默 | ${reason}] ${displayName}(${senderRole}): ${text.slice(0, 50)}`);
    return;
  }

  console.log(`[回覆 | ${reason}] ${displayName}(${senderRole}): ${text.slice(0, 50)}`);

  // 建立 AI 訊息並呼叫 OpenRouter
  const messages = buildMessages(sourceId, text, senderRole, displayName);
  const aiReply = await callOpenRouter(messages);

  if (aiReply) {
    // 解析動作標記並移除（使用者不會看到）
    const { cleanText, actions } = parseActionTags(aiReply);

    // 執行動作（學習需求記錄、講師申請轉發等）
    if (actions.length > 0) {
      processActions(actions, userId, displayName, sourceId).catch(err =>
        console.error('動作執行錯誤:', err)
      );
    }

    await lineReply(replyToken, cleanText);

    // 存入歷史（存乾淨版本）
    addToHistory(sourceId, {
      role: 'assistant',
      name: config.botName,
      userId: botProfile.userId,
      content: cleanText,
      timestamp: new Date().toISOString(),
    });
  } else {
    await lineReply(replyToken, '抱歉，目前系統繁忙，請稍後再試。');
  }
}

// ============================================================
//  管理者指令
// ============================================================

async function handleAdminCommand(text, replyToken, sourceId) {
  const cmd = text.split(/\s+/);

  switch (cmd[0]) {
    case '/摘要': {
      const history = getHistory(sourceId);
      if (history.length === 0) {
        await lineReply(replyToken, '目前沒有對話紀錄可摘要。');
        return true;
      }
      const summaryMessages = [
        { role: 'system', content: '請用繁體中文，將以下對話做一個簡潔的重點摘要，列出關鍵討論事項和結論。' },
        { role: 'user', content: history.map(h => `[${h.name}]: ${h.content}`).join('\n') },
      ];
      const summary = await callOpenRouter(summaryMessages);
      if (summary) await lineReply(replyToken, `【對話摘要】\n${summary}`);
      return true;
    }

    case '/清除歷史': {
      conversationHistory.delete(sourceId);
      await lineReply(replyToken, '已清除此群組的對話歷史紀錄。');
      return true;
    }

    case '/狀態': {
      const history = getHistory(sourceId);
      const status = [
        `【系統狀態】`,
        `Bot 名稱: ${config.botName}`,
        `AI 模型: ${AI_MODEL}`,
        `對話紀錄: ${history.length} 筆`,
        `已知成員: ${config.members.length} 人`,
        `運行時間: ${formatUptime(process.uptime())}`,
      ].join('\n');
      await lineReply(replyToken, status);
      return true;
    }

    case '/講師碼': {
      // 格式：/講師碼 <userId> <邀請碼>
      if (cmd.length < 3) {
        await lineReply(replyToken, '格式：/講師碼 <userId> <講師邀請碼>');
        return true;
      }
      const targetUserId = cmd[1];
      const instructorCode = cmd.slice(2).join(' ');
      const app = pendingInstructorApps.get(targetUserId);

      if (!app) {
        await lineReply(replyToken, `找不到 userId 為 ${targetUserId} 的講師申請記錄。`);
        return true;
      }

      await linePush(targetUserId,
        `嗨 ${app.displayName}！好消息 🎉\n\n` +
        `您的講師申請已經通過審核！\n` +
        `以下是您的講師邀請碼：\n\n` +
        `${instructorCode}\n\n` +
        `請使用此邀請碼在凝聚力學院官網完成講師身份設定。\n` +
        `如有任何問題，隨時可以找我喔！😊`
      );

      app.status = 'approved';
      await lineReply(replyToken, `已將講師邀請碼傳送給 ${app.displayName}（${targetUserId}）。`);
      return true;
    }

    case '/查看申請': {
      if (pendingInstructorApps.size === 0) {
        await lineReply(replyToken, '目前沒有待處理的講師申請。');
        return true;
      }
      const appList = Array.from(pendingInstructorApps.values())
        .map((app, i) => [
          `${i + 1}. ${app.displayName}`,
          `   學院名稱：${app.academyName}`,
          `   Email：${app.email}`,
          `   userId：${app.userId}`,
          `   狀態：${app.status === 'approved' ? '已通過' : '待審核'}`,
        ].join('\n'))
        .join('\n\n');
      await lineReply(replyToken, `【講師申請列表】\n\n${appList}`);
      return true;
    }

    case '/查看需求': {
      if (pendingLearningNeeds.length === 0) {
        await lineReply(replyToken, '目前沒有待彙整的學習需求。');
        return true;
      }
      const needsList = pendingLearningNeeds
        .map((item, i) => `${i + 1}. ${item.displayName}：${item.need}`)
        .join('\n');
      await lineReply(replyToken,
        `【待彙整學習需求】（共 ${pendingLearningNeeds.length} 筆）\n\n${needsList}\n\n` +
        `系統將於每晚 20:00 自動彙整發送。\n如需立即發送，請使用 /發送需求`
      );
      return true;
    }

    case '/發送需求': {
      if (pendingLearningNeeds.length === 0) {
        await lineReply(replyToken, '目前沒有待彙整的學習需求。');
        return true;
      }
      await sendDailyLearningReport();
      await lineReply(replyToken, '已手動發送學習需求彙整報告。');
      return true;
    }

    case '/help':
    case '/說明': {
      const help = [
        `【管理者指令】`,
        `/摘要 — 產生目前對話的重點摘要`,
        `/清除歷史 — 清除此群組的對話紀錄`,
        `/狀態 — 查看系統狀態`,
        `/查看申請 — 查看待處理的講師申請`,
        `/查看需求 — 查看待彙整的學習需求`,
        `/發送需求 — 立即發送學習需求彙整`,
        `/講師碼 <userId> <碼> — 發送講師邀請碼`,
        `/說明 — 顯示此說明`,
        ``,
        `【一般使用】`,
        `訊息中提到「${(config.triggerKeywords || [config.botName]).join('、')}」即可觸發回覆`,
      ].join('\n');
      await lineReply(replyToken, help);
      return true;
    }

    default:
      return false;  // 不是管理者指令，繼續正常流程
  }
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} 小時 ${m} 分鐘` : `${m} 分鐘`;
}

// ============================================================
//  Express 伺服器
// ============================================================

const app = express();

// LINE Webhook（需要 raw body 驗證簽名）
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // 驗證 LINE 簽名
  const signature = req.headers['x-line-signature'];
  if (!signature) return res.status(400).send('Missing signature');

  const hash = crypto
    .createHmac('SHA256', LINE_CHANNEL_SECRET)
    .update(req.body)
    .digest('base64');

  if (hash !== signature) {
    console.warn('LINE 簽名驗證失敗');
    return res.status(403).send('Invalid signature');
  }

  // 立即回應 200（避免 LINE 重試）
  res.status(200).send('OK');

  // 背景處理事件
  try {
    const body = JSON.parse(req.body.toString());
    for (const event of body.events) {
      handleEvent(event).catch(err => console.error('事件處理錯誤:', err));
    }
  } catch (err) {
    console.error('解析 Webhook 內容失敗:', err);
  }
});

// 健康檢查
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    bot: config.botName,
    model: AI_MODEL,
    uptime: formatUptime(process.uptime()),
  });
});

// ============================================================
//  啟動
// ============================================================

async function start() {
  console.log('========================================');
  console.log(`  LINE AI 客服助理`);
  console.log(`  Bot 名稱: ${config.botName}`);
  console.log(`  AI 模型:  ${AI_MODEL}`);
  console.log(`  成員人數: ${config.members.length}`);
  console.log('========================================');

  // 取得 Bot 自身資訊
  await fetchBotProfile();

  // 啟動每日學習需求彙整排程
  scheduleDailyLearningReport();

  app.listen(PORT, () => {
    console.log(`伺服器啟動: http://localhost:${PORT}`);
    console.log(`Webhook URL: https://你的域名/webhook`);
    console.log('等待 LINE 訊息...');

    // ===== 自我保活機制（防止 Render 免費方案休眠）=====
    const KEEP_ALIVE_URL = process.env.RENDER_EXTERNAL_URL || process.env.KEEP_ALIVE_URL;
    if (KEEP_ALIVE_URL) {
      const INTERVAL = 14 * 60 * 1000; // 每 14 分鐘（Render 休眠門檻為 15 分鐘）
      setInterval(() => {
        fetch(KEEP_ALIVE_URL)
          .then(() => console.log(`[保活] ${new Date().toLocaleTimeString('zh-TW')} ping 成功`))
          .catch(err => console.warn(`[保活] ping 失敗:`, err.message));
      }, INTERVAL);
      console.log(`[保活] 已啟動，每 14 分鐘自動 ping ${KEEP_ALIVE_URL}`);
    } else {
      console.log('[保活] 未偵測到 RENDER_EXTERNAL_URL 或 KEEP_ALIVE_URL，保活機制未啟動');
      console.log('       如部署在 Render，此變數會自動提供；其他平台請手動設定 KEEP_ALIVE_URL');
    }
  });
}

start().catch(err => {
  console.error('啟動失敗:', err);
  process.exit(1);
});
