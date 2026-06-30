# Contextual AI Discord Bot

A lightweight Discord bot powered by OpenRouter. It supports contextual
conversations, persistent conversation history, configurable rate limiting,
and simple prefix commands.

## Features

- Ask questions by mentioning the bot or using the `!` prefix
- Continue a conversation by replying directly to the bot
- Separate conversation history for each user and channel
- Persistent history across bot restarts
- Configurable OpenRouter model
- Configurable per-user rate limiting
- English user interface and commands

## Requirements

- Node.js 18 or newer
- A Discord bot token
- An OpenRouter API key

## Installation

1. Download or clone the repository.
2. Install the dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root:

   ```env
   BOT_TOKEN=your_discord_bot_token
   OPENROUTER_API_KEY=your_openrouter_api_key
   OPENROUTER_MODEL=openrouter/free
   RATE_LIMIT_MAX_REQUESTS=15
   ```

4. In the Discord Developer Portal, open your application and enable
   **Bot > Privileged Gateway Intents > Message Content Intent**.
5. Invite the bot to your server with permission to view channels, send
   messages, read message history, and add reactions.
6. Start the bot:

   ```bash
   npm start
   ```

For development with automatic restarts:

```bash
npm run dev
```

## Usage

| Input | Description |
| --- | --- |
| `!ping` | Display the Discord WebSocket latency |
| `!help` | Display the available commands |
| `!reset` | Clear your conversation history in the current channel |
| `!your question` | Ask the AI a question |
| `@Bot your question` | Ask the AI by mentioning the bot |
| Reply to a bot response | Continue the same conversation |

## Model selection

The default model is OpenRouter's free model router:

```env
OPENROUTER_MODEL=openrouter/free
```

To use another free or paid model, replace this value with a valid model ID
from OpenRouter. Your API key must have access to the selected model.

## Conversation history

The bot keeps the latest 50 messages for each user and channel. History is
stored locally in `data/conversations.json` and remains available after a
restart. This file is excluded from Git because it may contain private
conversation content. Users can erase their history with `!reset`.

## Rate limiting

The default limit is 15 AI requests per user per minute. Change it in `.env`:

```env
RATE_LIMIT_MAX_REQUESTS=15
```

## Security

Never commit a `.env` file containing real credentials. If a Discord token or
API key is exposed, revoke and replace it immediately.

## License

This project is licensed under the [MIT License](LICENSE).
