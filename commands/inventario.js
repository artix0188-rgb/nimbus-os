const { SlashCommandBuilder } = require('discord.js');
const handleInventory = require('../handlers/inventoryHandler');
const perfilCmd = require('./perfil');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventario')
    .setDescription('Abre tu interfaz táctica de suministros')
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Ver el inventario de otro ciudadano (Staff)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('usuario') || interaction.user;
    const isSelf = target.id === interaction.user.id;
    
    // Verificación de credenciales de administrador para acceso a inventarios de terceros
    if (!isSelf) {
      const isStaff = perfilCmd.helpers.isStaff(interaction.user.id, interaction.member);
      if (!isStaff) {
        return interaction.reply({ 
          content: '❌ **[N-OS]**: ACCESO DENEGADO. No tienes autorización para inspeccionar a otros ciudadanos.', 
          flags: 64 
        });
      }
    }

    // Despliegue de la interfaz de inventario
    return await handleInventory(interaction, target.id, 'inv');
  }
};