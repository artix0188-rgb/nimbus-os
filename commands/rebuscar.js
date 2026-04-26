const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const { floorDrops } = require('../services/floorService');
const { itemsMaster } = require('../services/inventoryService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rebuscar')
    .setDescription('Escanea el sector actual en busca de suministros caídos'),

  async execute(interaction) {
    // 🛡️ RESTRICCIÓN DE CATEGORÍA (RP)
    if (interaction.channel.parentId !== process.env.RP_CATEGORY_ID) {
      return interaction.reply({
        content: '❌ **[N-OS]**: El sensor de búsqueda solo opera en zonas de despliegue (RP).',
        flags: 64
      });
    }

    const channelId = interaction.channelId;
    const drops = floorDrops.get(channelId) || [];

    if (drops.length === 0) {
      return interaction.reply({
        content: '📟 **[N-OS]**: `ESCANEO_COMPLETO`. No se detectan firmas materiales en este sector.',
        flags: 64
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('📟 PDA // ESCANEO DE SUPERFICIE')
      .setColor(0x32a852)
      .setDescription(`Detección de firmas materiales en el sector <#${channelId}>:`);

    const select = new StringSelectMenuBuilder()
      .setCustomId('floor_pick_select')
      .setPlaceholder('Selecciona qué objeto recoger...');

    let lista = '';
    drops.forEach((d, i) => {
      const data = itemsMaster[d.itemData.itemId];
      const minutos = Math.floor((Date.now() - d.timestamp) / 60000);
      const stackMax = data?.stack || 1;
      
      lista += `**${i + 1}.** ${data ? data.name : d.itemData.itemId} x${d.itemData.cantidad} \`(Max Stack: ${stackMax} | Hace ${minutos}m)\`\n`;
      
      select.addOptions({
        label: `${data ? data.name : d.itemData.itemId} x${d.itemData.cantidad}`,
        description: `Capacidad de stack: ${stackMax}`,
        value: d.dropId
      });
    });

    embed.addFields({
      name: '▼ SUMINISTROS DETECTADOS',
      value: lista
    });

    const row = new ActionRowBuilder().addComponents(select);

    return interaction.reply({
      embeds: [embed],
      components: [row],
      flags: 64
    });
  }
};