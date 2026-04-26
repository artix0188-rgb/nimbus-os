const { SlashCommandBuilder } = require('discord.js');
const { getProfile, updateProfile } = require('../services/profileService');
const { itemsMaster, generarItemUUID, calcularMaxSlots, calcularSlotsOcupados } = require('../services/inventoryService');
const perfilCmd = require('./perfil');

module.exports = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName('admin_items')
    .setDescription('Gestión administrativa de suministros (Solo OWNER)')
    .addSubcommand(sub =>
      sub.setName('dar')
        .setDescription('Inyectar un objeto en un inventario')
        .addStringOption(o => o.setName('id').setDescription('ID técnico del objeto').setRequired(true))
        .addIntegerOption(o => o.setName('cantidad').setDescription('Cantidad de unidades').setRequired(true))
        .addUserOption(o => o.setName('objetivo').setDescription('Usuario receptor').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('limpiar')
        .setDescription('Purgar inventario y equipo de un usuario')
        .addUserOption(o => o.setName('objetivo').setDescription('Usuario a limpiar').setRequired(true))
    ),

  async execute(interaction) {
    // Verificación de credenciales de nivel de sistema (Propietario)
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ 
        content: '❌ **[N-OS]**: ACCESO_DENEGADO. Protocolo reservado al Operador Raíz.', 
        flags: 64 
      });
    }

    const subcommand = interaction.options.getSubcommand();

    // ===========================================================================
    // SUBCOMANDO: TRANSFERENCIA DE SUMINISTROS (DAR)
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

      // Validación de capacidad de carga en el inventario de destino
      const max = calcularMaxSlots(target.id);
      const actual = calcularSlotsOcupados(target.id);
      const pesoNuevo = Math.ceil(qty / (itemData.stack || 1)) * (itemData.slots || 1);

      if (actual + pesoNuevo > max) {
        // Registro en la consola del servidor
        interaction.client.logger.warn(`[ADMIN_GIVE_FAIL] ${interaction.user.tag} intentó dar ${itemId} x${qty} a ${profile.nombre} pero el inventario excede su capacidad máxima.`);

        // Registro de auditoría en el canal correspondiente
        await perfilCmd.helpers.sendToLogChannel(interaction, 'ALERTA_CARGA_ADMINISTRATIVA', [
          `**OPERADOR :** <@${interaction.user.id}>`,
          `**SUJETO   :** ${profile.nombre} (<@${target.id}>)`,
          `**MENSAJE   :** Intento de inyección de \`${itemData.name}\` fallido por sobrecarga de capacidad.`,
          `**ESTADO    :** Operación abortada automáticamente.`
        ]);

        return interaction.reply({ 
          content: `⚠️ **[N-OS]**: El inventario de **${profile.nombre}** carece de capacidad física para esta carga. El aviso ha sido registrado.`, 
          flags: 64 
        });
      }

      // Asegurar la consistencia de la estructura de datos (Migración en caliente)
      if (!profile.inventory) profile.inventory = [];

      // Generación e inserción del nuevo objeto con su identificador único (UUID)
      const nuevoItem = {
        uid: generarItemUUID(),
        itemId: itemId,
        cantidad: qty
      };

      profile.inventory.push(nuevoItem);
      updateProfile(target.id, { inventory: profile.inventory });

      // Registro de transacción exitosa en consola
      interaction.client.logger.info(`[ADMIN_GIVE] ${interaction.user.tag} inyectó ${itemId} x${qty} en el sistema de ${profile.nombre}`);

      // Registro de transacción exitosa en auditoría
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
    // SUBCOMANDO: PURGA DE INVENTARIO (LIMPIAR)
    // ===========================================================================
    if (subcommand === 'limpiar') {
      const target = interaction.options.getUser('objetivo');
      const profile = getProfile(target.id);

      if (!profile) {
        return interaction.reply({ 
          content: '❌ **[N-OS]**: Perfil no localizado en los registros.', 
          flags: 64 
        });
      }
      
      // Eliminación total de existencias en el inventario y equipo
      updateProfile(target.id, { 
        inventory: [], 
        equipment: {} 
      });

      // Registro de la acción destructiva en consola y auditoría
      interaction.client.logger.warn(`[ADMIN_CLEAN] ${interaction.user.tag} ejecutó un borrado remoto de los registros de ${profile.nombre} (${target.id})`);

      await perfilCmd.helpers.sendToLogChannel(interaction, 'PURGA_SUMINISTROS', [
        `**OPERADOR :** <@${interaction.user.id}>`,
        `**SUJETO   :** ${profile.nombre} (<@${target.id}>)`,
        `**ACCIÓN   :** Vaciado total de contenedores e indumentaria.`
      ]);

      return interaction.reply({ 
        content: `☢️ **[N-OS]**: Operación de limpieza total finalizada con éxito para **${profile.nombre}**.`, 
        flags: 64 
      });
    }
  }
};