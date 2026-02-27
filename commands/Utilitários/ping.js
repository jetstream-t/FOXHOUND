const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Teste de funcionamento do bot'),

  async execute(interaction) {
    await interaction.reply('Pong!');
  },

  async executePrefix(message) {
    await message.reply('Pong!');
  }
};