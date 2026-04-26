const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { itemsMaster } = require('../services/inventoryService');
const perfilCmd = require('./perfil'); 

const nombresCategorias = {
  'arma_1h': '🔫 ARMAS DE FUEGO (1 MANO)',
  'arma_2h_ligera': '🔫 ARMAS LIGERAS (2 MANOS)',
  'arma_2h_pesada': '💣 ARMAS PESADAS (2 MANOS)',
  'arma_blanca': '🔪 ARMAS BLANCAS',
  'arma_contundente': '🔨 ARMAS CONTUNDENTES',
  'utilidad_combate': '🧨 ARMAS CASERAS Y EXPLOSIVOS',
  'utilidad': '🔋 OBJETOS DE UTILIDAD',
  'mochila': '🎒 MOCHILAS',
  'torso': '🛡️ PROTECCIÓN (TORSO)',
  'cabeza': '🪖 PROTECCIÓN (CABEZA)',
  'municion': '📦 MUNICIÓN',
  'medicina': '💉 MEDICINAS Y CURACIONES',
  'comida': '🍔 RACIONES DE COMIDA',
  'bebida': '💧 BEBIDAS E HIDRATACIÓN'
};

module.exports = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName('admin_catalogo')
    .setDescription('Publica y actualiza el catálogo maestro en el canal actual.'),

  async execute(interaction) {
    // Control de acceso y verificación de nivel de autorización
    const isStaff = perfilCmd.helpers.isStaff(interaction.user.id, interaction.member);
    if (!isStaff && interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ 
        content: '❌ **[N-OS]**: ACCESO_DENEGADO. Nivel de autorización insuficiente.', 
        flags: 64 
      });
    }

    await interaction.deferReply({ flags: 64 });

    // 1. Purga del catálogo anterior
    // Recupera los últimos 50 mensajes del canal y elimina aquellos generados por el bot.
    try {
      const fetched = await interaction.channel.messages.fetch({ limit: 50 });
      const botMessages = fetched.filter(m => m.author.id === interaction.client.user.id);
      
      if (botMessages.size > 0) {
        // Eliminación secuencial para evitar conflictos con la limitación de mensajes de más de 14 días en la API de Discord.
        for (const [id, msg] of botMessages) {
          await msg.delete().catch(() => null);
        }
      }
    } catch (error) {
      interaction.client.logger.warn('Fallo en la eliminación de los mensajes anteriores del catálogo.');
    }

    // 2. Agrupación y categorización de objetos
    const categorias = {};
    for (const [id, data] of Object.entries(itemsMaster)) {
      const tipo = data.type || 'otros';
      if (!categorias[tipo]) categorias[tipo] = [];
      
      categorias[tipo].push(`> **${data.name}** | \`${id}\``);
    }

    // 3. Construcción de embeds (Sujeto al límite de 2000 caracteres de Discord)
    const embeds = [];
    let currentDescription = "";
    let isFirstEmbed = true;

    for (const [tipo, itemsList] of Object.entries(categorias)) {
      const titulo = nombresCategorias[tipo] || `🏷️ ${tipo.toUpperCase()}`;
      let bloqueCategoria = `\n### ${titulo}\n` + itemsList.join('\n') + '\n';

      if (currentDescription.length + bloqueCategoria.length > 2000) {
        const embed = new EmbedBuilder()
          .setColor(0x0055ff)
          .setDescription(currentDescription);
        
        if (isFirstEmbed) {
          embed.setTitle('📟 N-OS // CATÁLOGO MAESTRO DE SUMINISTROS');
          isFirstEmbed = false;
        }
        
        embeds.push(embed);
        currentDescription = bloqueCategoria; 
      } else {
        currentDescription += bloqueCategoria;
      }
    }

    if (currentDescription.length > 0) {
      const embed = new EmbedBuilder()
        .setColor(0x0055ff)
        .setDescription(currentDescription);
        
      if (isFirstEmbed) embed.setTitle('📟 N-OS // CATÁLOGO MAESTRO DE SUMINISTROS');
      embeds.push(embed);
    }

    // 4. Envío de datos por lotes
    // Prevención de errores de la API dividiendo el envío en paquetes máximos de 10 embeds o 5500 caracteres.
    let currentChunk = [];
    let currentLength = 0;

    for (const embed of embeds) {
      const embedLength = embed.data.description.length + (embed.data.title?.length || 0);
      
      if (currentChunk.length >= 10 || currentLength + embedLength > 5500) {
        await interaction.channel.send({ embeds: currentChunk });
        currentChunk = [embed];
        currentLength = embedLength;
      } else {
        currentChunk.push(embed);
        currentLength += embedLength;
      }
    }
    
    if (currentChunk.length > 0) {
      await interaction.channel.send({ embeds: currentChunk });
    }

    // Confirmación de ejecución exitosa
    return interaction.editReply({ content: '✅ Catálogo maestro actualizado y desplegado en este canal.' });
  }
};