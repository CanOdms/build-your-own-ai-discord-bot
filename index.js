require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Message Content Intent must also be enabled in the Discord Developer Portal.

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const PREFIX = '!';
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 50;
const configuredRateLimit = Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10);
const RATE_LIMIT_MAX_REQUESTS =
  Number.isInteger(configuredRateLimit) && configuredRateLimit > 0
    ? configuredRateLimit
    : 15;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';
const dataDir = path.join(__dirname, 'data');
const historyFile = path.join(dataDir, 'conversations.json');

// Command system
const commands = new Map();
const commandsDir = path.join(__dirname, 'commands');

fs.readdirSync(commandsDir)
  .filter(f => f.endsWith('.js'))
  .forEach(file => {
    const cmd = require(path.join(commandsDir, file));
    commands.set(cmd.name, cmd);
  });

// Each user gets a separate conversation in each channel.
const conversations = new Map();
const conversationQueues = new Map();
const rateLimits = new Map();

function loadConversations() {
  if (!fs.existsSync(historyFile)) return;

  try {
    const savedConversations = JSON.parse(fs.readFileSync(historyFile, 'utf8'));

    for (const [key, conversation] of Object.entries(savedConversations)) {
      if (Array.isArray(conversation.messages)) {
        conversations.set(key, conversation);
      }
    }
  } catch (err) {
    console.warn(`[warning] Conversation history could not be loaded: ${err.message}`);
  }
}

function saveConversations() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      historyFile,
      JSON.stringify(Object.fromEntries(conversations), null, 2),
      'utf8'
    );
  } catch (err) {
    console.error(`[error] Conversation history could not be saved: ${err.message}`);
  }
}

function clearConversation(message) {
  const deleted = conversations.delete(getConversationKey(message));
  saveConversations();
  return deleted;
}

function getRateLimitRetryAfter(userId) {
  const now = Date.now();
  const existing = rateLimits.get(userId);

  if (!existing || now - existing.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(userId, { count: 1, windowStartedAt: now });
    return 0;
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return Math.ceil(
      (RATE_LIMIT_WINDOW_MS - (now - existing.windowStartedAt)) / 1000
    );
  }

  existing.count += 1;
  return 0;
}

loadConversations();

function truncate(text, max = MAX_MESSAGE_LENGTH) {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}

function getConversationKey(message) {
  return `${message.guildId || 'dm'}:${message.channelId}:${message.author.id}`;
}

function getConversation(key) {
  const existing = conversations.get(key);

  if (!existing) {
    const conversation = { messages: [], updatedAt: Date.now() };
    conversations.set(key, conversation);
    return conversation;
  }

  return existing;
}

function enqueueConversation(key, task) {
  const previous = conversationQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  conversationQueues.set(key, current);

  return current.finally(() => {
    if (conversationQueues.get(key) === current) {
      conversationQueues.delete(key);
    }
  });
}

async function askAI(messages) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'your_openrouter_api_key') {
    throw new Error('OPENROUTER_API_KEY is missing from the .env file.');
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful Discord bot. Reply clearly and concisely in the same language as the user. Keep each response within 2000 characters.'
          },
          ...messages
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI request failed with HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('The AI returned an empty response.');
    return content;
  } catch (err) {
    throw new Error(`AI request error: ${err.message}`);
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  let shouldTriggerAI = false;
  let aiInput = '';

  if (message.mentions.has(client.user)) {
    shouldTriggerAI = true;
    aiInput = message.content.replace(/<@!?(\d+)>/g, '').trim();
  }
  else if (message.content.startsWith(PREFIX)) {
    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const commandName = args.shift()?.toLowerCase();

    if (commandName && commands.has(commandName)) {
      await commands.get(commandName).execute(message, { clearConversation });
      return;
    }

    shouldTriggerAI = true;
    aiInput = message.content.slice(PREFIX.length).trim();
  } else if (message.reference?.messageId) {
    try {
      const referencedMessage = await message.fetchReference();
      if (referencedMessage.author.id === client.user.id) {
        shouldTriggerAI = true;
        aiInput = message.content.trim();
      }
    } catch (err) {
      console.warn(`[warning] Could not fetch referenced message: ${err.message}`);
    }
  }

  if (shouldTriggerAI && aiInput) {
    const retryAfter = getRateLimitRetryAfter(message.author.id);
    if (retryAfter > 0) {
      await message.reply(
        `You are sending messages too quickly. Please try again in ${retryAfter} seconds.`
      );
      return;
    }

    const conversationKey = getConversationKey(message);

    await enqueueConversation(conversationKey, async () => {
      await message.channel.sendTyping();
      const conversation = getConversation(conversationKey);
      const pendingMessages = [
        ...conversation.messages,
        { role: 'user', content: aiInput }
      ];

      try {
        const reply = truncate(await askAI(pendingMessages));
        conversation.messages = [
          ...pendingMessages,
          { role: 'assistant', content: reply }
        ].slice(-MAX_HISTORY_MESSAGES);
        conversation.updatedAt = Date.now();
        saveConversations();
        await message.reply(reply);
      } catch (err) {
        console.error(err.message);
        await message.reply('Sorry, I could not complete that request. Please try again in a moment.');
      }
    });
  }
});

client.once(Events.ClientReady, () => {
  console.log(`[ready] Logged in as ${client.user.tag}`);
  console.log(`[i] Prefix: ${PREFIX}`);
  console.log(`[i] AI model: ${OPENROUTER_MODEL}`);
  console.log(`[i] Commands loaded: ${commands.size}`);
  console.log('[i] Listening for mentions, replies, and prefixed messages.');
});

client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('[error] Bot login failed. BOT_TOKEN may be invalid:', err.message);
});
