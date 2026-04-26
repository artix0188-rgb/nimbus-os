const { SlashCommandBuilder, REST, Routes } = require('discord.js');

const { getProfile, createProfile } = require('../services/profileService');

module.exports = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName('clearcommands')
    .setDescription('🧹 Elimina comandos globales'),

  async execute(interaction) {
    // Verificación de credenciales de operador raíz
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({
        content: '❌ No tienes permiso.',
        flags: 64
      });
    }

    await interaction.deferReply({ flags: 64 });

    // Inicialización del cliente REST para la API de Discord
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
      // Purga del registro global de comandos de la aplicación
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: [] }
      );

      await interaction.editReply({
        content: '✅ Comandos globales eliminados.\n⏳ Puede tardar unos minutos.'
      });

    } catch (error) {
      console.error(error);

      await interaction.editReply({
        content: '❌ Error limpiando comandos.'
      });
    }
  }
};