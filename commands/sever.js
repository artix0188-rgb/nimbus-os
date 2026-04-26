const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sever')
    .setDescription('El tigre hace meow'),

  async execute(interaction) {
    // Comando de prueba de conectividad y respuesta básica
    await interaction.reply('🐯 : meow');
  },
};