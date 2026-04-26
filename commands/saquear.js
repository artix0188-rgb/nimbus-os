const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const lootHandler = require('../handlers/lootHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('saquear')
    .setDescription('Escanea el sector actual en busca de sujetos caídos para registrar su equipo.'),

  async execute(interaction) {
    const channelId = interaction.channelId;
    
    // 1. Consultar al radar de cuerpos si hay alguien tirado en este canal
    const bodies = lootHandler.getBodiesInChannel(channelId);

    if (bodies.length === 0) {
      return interaction.reply({ 
        content: '📟 **[N-OS]**: `ESCANEO_COMPLETO`. No se detectan sujetos incapacitados o cadáveres en este sector.', 
        flags: 64 
      });
    }

    // 2. Si solo hay 1 cuerpo, lo abrimos directamente
    if (bodies.length === 1) {
      await interaction.reply({ content: `📟 **[N-OS]**: Registrando cuerpo de **${bodies[0].name}**...`, flags: 64 });
      return lootHandler.iniciarSaqueo(null, bodies[0].id, interaction.channel);
    }

    // 3. Si hay Varios Cuerpos, mostramos un menú para elegir
    const select = new StringSelectMenuBuilder()
      .setCustomId('loot_selbody_public')
      .setPlaceholder('Selecciona el cuerpo a registrar...');
    
    bodies.forEach(b => {
      select.addOptions({
        label: b.name,
        description: b.type === 'corpse' ? 'Estado: Cadáver (Fallecido)' : 'Estado: Inconsciente (Desangrándose)',
        value: b.id
      });
    });

    const row = new ActionRowBuilder().addComponents(select);
    
    return interaction.reply({ 
      content: '📟 **[N-OS]**: Se han detectado múltiples sujetos caídos en el área. Selecciona tu objetivo:', 
      components: [row], 
      flags: 64 
    });
  }
};