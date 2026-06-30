module.exports = {
  name: 'help',
  async execute(message) {
    const prefix = '!';
    const helpMessage = [
      '**Available commands:**',
      `\`${prefix}ping\` — Check whether the bot is online`,
      `\`${prefix}help\` — Show this help message`,
      `\`${prefix}reset\` — Clear your conversation history in this channel`,
      `\`@${message.client.user.username} message\` — Ask the AI a question`,
      `\`${prefix}message\` — Ask the AI using the prefix`,
      '',
      '**Tip:** Reply directly to the bot to continue the same conversation. Use `!reset` when you want to start over.'
    ].join('\n');
    return message.reply(helpMessage);
  }
};
