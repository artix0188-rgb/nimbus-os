const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const { getProfile } = require('../services/profileService');
const { itemsMaster } = require('../services/inventoryService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tirar')
    .setDescription('Arroja suministros de tu mochila al suelo'),

  async execute(interaction) {
    // 🛡️ RESTRICCIÓN DE CATEGORÍA (RP)
    if (interaction.channel.parentId !== process.env.RP_CATEGORY_ID) {
      return interaction.reply({
        content: '❌ **[N-OS]**: Este protocolo solo puede ejecutarse en sectores de la Zona (Canales de RP).',
        flags: 64
      });
    }

    const profile = getProfile(interaction.user.id);

    if (!profile || !profile.inventory || profile.inventory.length === 0) {
      return interaction.reply({
        content: '❌ **[N-OS]**: Tu mochila está vacía.',
        flags: 64
      });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('floor_drop_select')
      .setPlaceholder('Selecciona qué objeto deseas tirar...');

    const opcionesMap = new Map(); // Usamos un Map para garantizar que no haya UIDs repetidos

    profile.inventory.forEach((item, index) => {
      // 1. PARCHE DE SEGURIDAD: Si el objeto es viejo y no tiene UID, le inventamos uno rápido
      if (!item.uid) {
        item.uid = `legacy_${Date.now()}_${index}`;
      }

      // 2. Solo añadimos la opción si el UID no está ya en la lista
      if (!opcionesMap.has(item.uid)) {
        const data = itemsMaster[item.itemId];
        
        opcionesMap.set(item.uid, {
          label: `${data ? data.name : item.itemId} x${item.cantidad}`,
          description: `UID: ${item.uid.substring(0, 8)}`,
          value: item.uid // 🔥 ESTO ES LO QUE DISCORD EXIGE QUE SEA ÚNICO
        });
      }
    });

    // Convertimos el Map en un array y limitamos a 25 (el máximo que permite Discord en un menú)
    const opcionesFinales = Array.from(opcionesMap.values()).slice(0, 25);

    if (opcionesFinales.length === 0) {
      return interaction.reply({ content: '❌ Tu mochila está vacía.', flags: 64 });
    }

    select.addOptions(opcionesFinales);

    const row = new ActionRowBuilder()
      .addComponents(select);

    return interaction.reply({
      content: '📟 **[N-OS]**: Selecciona qué suministro quieres dejar en este sector.',
      components: [row],
      flags: 64
    });
  }
};