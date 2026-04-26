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
    // Verificación de zona: Restricción de ejecución a canales de simulación de rol (RP)
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

    // Implementación de un mapa de datos para garantizar la unicidad de los identificadores (UIDs)
    const opcionesMap = new Map(); 

    profile.inventory.forEach((item, index) => {
      // Rutina de compatibilidad: Generación de identificador temporal para suministros heredados sin UID
      if (!item.uid) {
        item.uid = `legacy_${Date.now()}_${index}`;
      }

      // Prevención de entradas duplicadas en la lista de opciones
      if (!opcionesMap.has(item.uid)) {
        const data = itemsMaster[item.itemId];
        
        opcionesMap.set(item.uid, {
          label: `${data ? data.name : item.itemId} x${item.cantidad}`,
          description: `UID: ${item.uid.substring(0, 8)}`,
          value: item.uid // Requiere identificador único estricto para el componente de Discord
        });
      }
    });

    // Conversión de datos y aplicación de límite estructural de la API (Máximo 25 opciones)
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