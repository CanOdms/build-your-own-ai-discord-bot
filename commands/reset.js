module.exports = {
  name: 'reset',
  async execute(message, { clearConversation }) {
    const deleted = clearConversation(message);

    return message.reply(
      deleted
        ? 'Your conversation history in this channel has been cleared.'
        : 'There is no conversation history to clear in this channel.'
    );
  }
};
