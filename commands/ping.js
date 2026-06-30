module.exports = {
  name: 'ping',
  async execute(message) {
    const websocketLatency = Math.round(message.client.ws.ping);

    return message.reply(`Ping: **${websocketLatency} ms**`);
  }
};
