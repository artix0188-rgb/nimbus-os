const { SlashCommandBuilder } = require('discord.js');
const { initWeatherSystem, stopWeatherSystem, cambiarClima } = require('../services/weatherService');
const perfilCmd = require('./perfil');

module.exports = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName('admin_clima')
    .setDescription('Gestión operativa del motor meteorológico y de radiación')
    .addSubcommand(sub =>
      sub.setName('iniciar')
        .setDescription('Arranca el ciclo de clima automático (rotación cada 6 horas)')
    )
    .addSubcommand(sub =>
      sub.setName('detener')
        .setDescription('Suspende la rotación automática del clima')
    )
    .addSubcommand(sub =>
      sub.setName('forzar')
        .setDescription('Inyecta una alteración meteorológica inmediata en la Zona')
    ),

  async execute(interaction) {
    // Verificación de credenciales de nivel Staff
    const isStaff = perfilCmd.helpers.isStaff(interaction.user.id, interaction.member);
    if (!isStaff && interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ 
        content: '❌ **[N-OS]**: ACCESO DENEGADO. Nivel de autorización insuficiente.', 
        flags: 64 
      });
    }

    const subcomando = interaction.options.getSubcommand();

    // Protocolo de arranque del motor
    if (subcomando === 'iniciar') {
      const result = initWeatherSystem(interaction.client);
      return interaction.reply({ content: `📟 **[N-OS]**: ${result.msg}`, flags: 64 });
    }

    // Protocolo de suspensión del motor
    if (subcomando === 'detener') {
      const result = stopWeatherSystem();
      return interaction.reply({ content: `📟 **[N-OS]**: ${result.msg}`, flags: 64 });
    }

    // Protocolo de inyección forzada (Cambio inmediato)
    if (subcomando === 'forzar') {
      await interaction.reply({ content: `⚠️ **[N-OS]**: Forzando anomalía ambiental en el sector...`, flags: 64 });
      await cambiarClima(interaction.client);
    }
  }
};