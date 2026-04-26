const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Muestra el estado de la red y diagnóstico del sistema Nimbus-OS.'),

  async execute(interaction) {
    // Cálculo del tiempo de actividad del sistema (Uptime)
    let totalSeconds = (interaction.client.uptime / 1000);
    let days = Math.floor(totalSeconds / 86400);
    totalSeconds %= 86400;
    let hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = Math.floor(totalSeconds % 60);

    const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    // Extracción de métricas de rendimiento (Consumo de memoria y latencia)
    const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const latency = Date.now() - interaction.createdTimestamp;

    // Generación de interfaz visual temática (Estilo PDA Nimbus-OS)
    const statsEmbed = new EmbedBuilder()
      .setColor(0x0099ff) // Azul táctico del sistema
      .setAuthor({ 
        name: 'SISTEMA OPERATIVO NIMBUS-OS', 
        iconURL: interaction.client.user.displayAvatarURL() 
      })
      .setTitle('📟 DIAGNÓSTICO DE RED Y SISTEMA')
      .setDescription(
        '```ansi\n' +
        '\u001b[32m[ESTADO: ONLINE] — Conexión con el servidor central estable.\u001b[0m\n' +
        '```'
      )
      .addFields(
        { name: '📡 LATENCIA DE ENLACE', value: `> \`${latency} ms\``, inline: true },
        { name: '💾 CARGA DE MEMORIA', value: `> \`${ramUsage} MB\``, inline: true },
        { name: '⏱️ TIEMPO EN LÍNEA', value: `> \`${uptimeString}\``, inline: true },
        { name: '🌍 SECTORES ACTIVOS', value: `> \`${interaction.client.guilds.cache.size}\` redes`, inline: true },
        { name: '⚙️ VERSIÓN DEL NÚCLEO', value: `> Node \`${process.version}\``, inline: true }
      )
      .setFooter({ text: 'NIMBUS-OS KERNEL v4.0.2 | TACTICAL NETWORK' })
      .setTimestamp();

    await interaction.reply({ embeds: [statsEmbed] });
  }
};