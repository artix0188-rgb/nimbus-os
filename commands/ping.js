const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Muestra las estadísticas detalladas del bot'),

  async execute(interaction) {
    // Cálculo del tiempo de actividad del sistema (Uptime)
    let totalSeconds = (interaction.client.uptime / 1000);
    let days = Math.floor(totalSeconds / 86400);
    totalSeconds %= 86400;
    let hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = Math.floor(totalSeconds % 60);

    const uptimeString = `${days} days, ${hours} hrs, ${minutes} mins, ${seconds} secs`;

    // Extracción de métricas de rendimiento (Consumo de memoria y latencia)
    const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const latency = Date.now() - interaction.createdTimestamp;

    // Generación de interfaz visual con métricas de rendimiento
    const statsEmbed = new EmbedBuilder()
      .setColor('#57F287') // Asignación de código de color predeterminado
      .setTitle('Pong!')
      .setDescription(
        `data only applies to (this) child process\n` +
        `• time \`${latency} ms\`\n` +
        `• version \`${process.version}\`\n` +
        `• uptime \`${uptimeString}\`\n` +
        `• ram \`${ramUsage} mb\`\n` +
        `• this cluster has \`${interaction.client.guilds.cache.size}\` servers\n` +
        `• cluster \`422\` running \`${interaction.client.ws.shards.size}\` of \`3584\` shards\n` +
        `• shard \`${interaction.guild?.shardId || 0}\``
      );

    await interaction.reply({ embeds: [statsEmbed] });
  }
};