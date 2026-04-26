const { 
  SlashCommandBuilder 
} = require('discord.js');

const { getProfile, updateProfile } = require('../services/profileService');
const { 
  itemsMaster, 
  generarItemUUID, 
  calcularMaxSlots, 
  calcularSlotsOcupados 
} = require('../services/inventoryService');
const perfilCmd = require('./perfil');

module.exports = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName('admin_items')
    .setDescription('Gestión administrativa de suministros (Solo OWNER)')
    .addSubcommand(sub =>
      sub.setName('dar')
        .setDescription('Inyectar un objeto en un inventario')
        .addStringOption(o => 
          o.setName('id')
            .setDescription('ID técnico del objeto')
            .setRequired(true)
        )
        .addIntegerOption(o => 
          o.setName('cantidad')
            .setDescription('Cantidad de unidades')
            .setRequired(true)
        )
        .addUserOption(o => 
          o.setName('objetivo')
            .setDescription('Usuario receptor')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('limpiar')
        .setDescription('Purgar inventario y equipo de un usuario')
        .addUserOption(o => 
          o.setName('objetivo')
            .setDescription('Usuario a limpiar')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    // 🛡️ CONTROL DE ACCESO PROPIETARIO
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ 
        content: '❌ **[N-OS]**: ACCESO_DENEGADO. Protocolo reservado al Operador Raíz.', 
        flags: 64 
      });
    }

    const subcommand = interaction.options.getSubcommand();

    // ===========================================================================
    // SUBCOMANDO: DAR
    // ===========================================================================
    if (subcommand === 'dar') {
      const itemId = interaction.options.getString('id');
      const qty = interaction.options.getInteger('cantidad');
      const target = interaction.options.getUser('objetivo') || interaction.user;
      
      const profile = getProfile(target.id);
      if (!profile) {
        return interaction.reply({ 
          content: '❌ **[N-OS]**: Perfil no localizado en el Registro Ciudadano.', 
          flags: 64 
        });
      }

      const itemData = itemsMaster[itemId];
      if (!itemData) {
        return interaction.reply({ 
          content: `❌ **[N-OS]**: El identificador técnico \`${itemId}\` no existe en el catálogo maestro.`, 
          flags: 64 
        });
      }

      // ⚖️ VERIFICACIÓN TÁCTICA DE CARGA
      const max = calcularMaxSlots(target.id);
      const actual = calcularSlotsOcupados(target.id);
      const pesoNuevo = Math.ceil(qty / (itemData.stack || 1)) * (itemData.slots || 1);

      if (actual + pesoNuevo > max) {
        // 📟 LOGGER NATIVO (CONSOLA)
        interaction.client.logger.warn(`[ADMIN_GIVE_FAIL] ${interaction.user.tag} intentó dar ${itemId} x${qty} a ${profile.nombre} pero el inventario está LLENO.`);

        // 📂 LOG AZUL (DISCORD)
        await perfilCmd.helpers.sendToLogChannel(interaction, 'ALERTA_CARGA_ADMINISTRATIVA', [
          `**OPERADOR :** <@${interaction.user.id}>`,
          `**SUJETO   :** ${profile.nombre} (<@${target.id}>)`,
          `**MENSAJE   :** Intento de inyección de \`${itemData.name}\` fallido por sobrecarga de slots.`,
          `**ESTADO    :** Operación abortada automáticamente.`
        ]);

        return interaction.reply({ 
          content: `⚠️ **[N-OS]**: El inventario de **${profile.nombre}** no posee capacidad para esta carga. Aviso registrado en logs.`, 
          flags: 64 
        });
      }

      // 🛠️ ASEGURAR ESTRUCTURA (MIGRACIÓN DINÁMICA)
      if (!profile.inventory) profile.inventory = [];

      // 💉 INYECTAR OBJETO CON IDENTIFICADOR ÚNICO
      const nuevoItem = {
        uid: generarItemUUID(),
        itemId: itemId,
        cantidad: qty
      };

      profile.inventory.push(nuevoItem);
      updateProfile(target.id, { inventory: profile.inventory });

      // 📟 LOGGER NATIVO
      interaction.client.logger.info(`[ADMIN_GIVE] ${interaction.user.tag} inyectó ${itemId} x${qty} en la terminal de ${profile.nombre}`);

      // 📂 LOG AZUL
      await perfilCmd.helpers.sendToLogChannel(interaction, 'SUMINISTRO_INYECTADO', [
        `**OPERADOR :** <@${interaction.user.id}>`,
        `**RECEPTOR :** ${profile.nombre} (<@${target.id}>)`,
        `**OBJETO   :** \`${itemData.name}\` x${qty}`,
        `**UUID     :** \`${nuevoItem.uid.substring(0, 8)}\``
      ]);

      return interaction.reply({ 
        content: `✅ **[N-OS]**: Suministro de **${itemData.name}** x${qty} transferido con éxito a **${profile.nombre}**.`, 
        flags: 64 
      });
    }

    // ===========================================================================
    // SUBCOMANDO: LIMPIAR
    // ===========================================================================
    if (subcommand === 'limpiar') {
      const target = interaction.options.getUser('objetivo');
      const profile = getProfile(target.id);

      if (!profile) {
        return interaction.reply({ 
          content: '❌ **[N-OS]**: Perfil no localizado.', 
          flags: 64 
        });
      }
      
      // PURGA COMPLETA
      updateProfile(target.id, { 
        inventory: [], 
        equipment: {} 
      });

      // 📟 LOGGER NATIVO
      interaction.client.logger.warn(`[ADMIN_CLEAN] ${interaction.user.tag} purgó remotamente la terminal de ${profile.nombre} (${target.id})`);

      // 📂 LOG AZUL
      await perfilCmd.helpers.sendToLogChannel(interaction, 'PURGA_SUMINISTROS', [
        `**OPERADOR :** <@${interaction.user.id}>`,
        `**SUJETO   :** ${profile.nombre} (<@${target.id}>)`,
        `**ACCIÓN   :** Vaciado completo de mochila y equipo táctico.`
      ]);

      return interaction.reply({ 
        content: `☢️ **[N-OS]**: Se ha ejecutado la purga total de suministros para **${profile.nombre}**.`, 
        flags: 64 
      });
    }
  }
};