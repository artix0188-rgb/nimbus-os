const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sever')
    .setDescription('El tigre hace meow'),

  async execute(interaction) {
    await interaction.reply('🐯 : meow');
  },
};