const { SlashCommandBuilder } = require('discord.js');
const { initWeatherSystem, stopWeatherSystem, cambiarClima, CLIMAS } = require('../services/weatherService');
const perfilCmd = require('./perfil');

module.exports = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName('admin_clima')
    .setDescription('Gestión operativa del motor meteorológico')
    .addSubcommand(sub =>
      sub.setName('iniciar')
        .setDescription('Activa el ciclo automático de clima')
    )
    .addSubcommand(sub =>
      sub.setName('detener')
        .setDescription('Desactiva el ciclo automático de clima')
    )
    .addSubcommand(sub =>
      sub.setName('forzar')
        .setDescription('Inyecta una alteración meteorológica inmediata')
        .addStringOption(opt =>
          opt.setName('clima')
            .setDescription('Selecciona un estado específico (Opcional)')
            .setRequired(false)
            .addChoices(
              ...CLIMAS.map(c => ({ name: c.nombre, value: c.id }))
            )
        )
    ),

  async execute(interaction) {
    const isStaff = perfilCmd.helpers.isStaff(interaction.user.id, interaction.member);
    if (!isStaff && interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ content: '❌ Acceso denegado.', flags: 64 });
    }

    const subcomando = interaction.options.getSubcommand();

    if (subcomando === 'iniciar') {
      const result = initWeatherSystem(interaction.client);
      return interaction.reply({ content: `📟 **[N-OS]**: ${result.msg}`, flags: 64 });
    }

    if (subcomando === 'detener') {
      const result = stopWeatherSystem();
      return interaction.reply({ content: `📟 **[N-OS]**: ${result.msg}`, flags: 64 });
    }

    if (subcomando === 'forzar') {
      const climaId = interaction.options.getString('clima');
      await interaction.reply({ content: `⚠️ **[N-OS]**: Procesando alteración ambiental...`, flags: 64 });
      
      // Ejecución con parámetro opcional de ID
      await cambiarClima(interaction.client, climaId);
    }
  }
};