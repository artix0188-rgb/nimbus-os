const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getProfile, createProfile } = require('../services/profileService');

// ===========================================================================
// Sistema de limitación de tasa (Prevención de sobrecarga de servidor)
// ===========================================================================
const cooldowns = new Map();
const COOLDOWN_TIME = 10000; // Intervalo de 10 segundos

// ===========================================================================
// Funciones auxiliares
// ===========================================================================

function generarSystemID() {
  const longitud = Math.floor(Math.random() * 2) + 10;
  let id = '';
  for (let i = 0; i < longitud; i++) id += Math.floor(Math.random() * 10);
  return id;
}

function obtenerFotoDePool() {
  const poolRaw = process.env.PHOTO_POOL || '';
  const fotos = poolRaw.split(',')
    .map(url => url.replace(/['"]*/g, '').trim())
    .filter(url => url.startsWith('http'));
  return fotos.length > 0
    ? fotos[Math.floor(Math.random() * fotos.length)]
    : 'https://i.imgur.com/HifVRqT.jpg';
}

// Mejora: Registro de auditoría estandarizado en formato Embed.
async function registrarLogEvento(interaction, titulo, detalles) {
  const client = interaction.client;
  const logChannelId = process.env.LOG_CHANNEL_ID;
  if (!logChannelId) return;
  try {
    const channel = await client.channels.fetch(logChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(`📟 ${titulo}`)
      .setColor(0x0099ff) // Azul
      .setDescription(detalles.join('\n'))
      .addFields(
        { name: '📍 Contexto', value: `**Canal:** <#${interaction.channelId}>` }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('❌ [N-OS]: Error de transmisión de registro de auditoría:', e.message);
  }
}

async function enviarConDelay(channel, texto, ms = 0) {
  const msg = await channel.send(texto);
  if (ms > 0) await new Promise(r => setTimeout(r, ms));
  return msg;
}

async function borrarMensajes(mensajes) {
  await Promise.allSettled(
    mensajes.map(msg => 
      msg.deletable 
        ? Promise.race([
            msg.delete(),
            new Promise((_, reject) => setTimeout(() => reject('timeout'), 5000))
          ]).catch(() => null)
        : Promise.resolve()
    )
  );
}

function validarNombre(nombre) {
  if (!nombre || nombre.length === 0) {
    return { valido: false, error: 'ERROR_EMPTY_INPUT' };
  }
  
  if (nombre.length < 2 || nombre.length > 32) {
    return { valido: false, error: 'NOMBRE_LONGITUD_INVALIDA (2-32 caracteres)' };
  }
  
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(nombre)) {
    return { valido: false, error: 'NOMBRE_CARACTERES_INVALIDOS (solo letras y espacios)' };
  }
  
  return { valido: true };
}

// ===========================================================================
// Definición y ejecución del comando
// ===========================================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName('registrar')
    .setDescription('Inicia el protocolo de registro de identidad en Nimbus-OS'),

  async execute(interaction) {
    const user = interaction.user;
    const client = interaction.client;

    if (cooldowns.has(user.id)) {
      const expirationTime = cooldowns.get(user.id) + COOLDOWN_TIME;
      if (Date.now() < expirationTime) {
        const tiempoRestante = Math.ceil((expirationTime - Date.now()) / 1000);
        return interaction.reply({
          content: `⏳ **[N-OS]**: LIMITACIÓN_TASA_ACTIVA. Reintente en ${tiempoRestante}s.`,
          flags: 64
        });
      }
    }

    if (getProfile(user.id)) {
      return interaction.reply({
        content:
          `⚠️ **[N-OS]**: ERROR: \`ID_DUPLICADA\`\n` +
          `> El sistema detecta un registro activo previo para este operador.\n` +
          `> Ejecute \`/perfil\` para acceder a la terminal de datos.`,
        flags: 64
      });
    }

    cooldowns.set(user.id, Date.now());

    await interaction.reply({ 
      content: `*️⃣ **[N-OS]**: Estableciendo comunicación bidireccional...`, 
      flags: 64
    });

    const ch = interaction.channel;
    const tempMessages = [];

    try {
      tempMessages.push(await enviarConDelay(ch,
        `\`\`\`ansi\n\u001b[32m[NIMBUS-OS v4.0.2] — TERMINAL KERNEL ACTIVO\u001b[0m\n\`\`\``,
        1500));

      tempMessages.push(await enviarConDelay(ch,
        `> **[N-OS]**: Enlace cifrado establecido.\n> **[N-OS]**: Ejecutando verificación de identidad...`,
        1500));

      tempMessages.push(await enviarConDelay(ch,
        `> **[N-OS]**: Operador no identificado. Procediendo con la **INDUCCIÓN DE SISTEMA**.\n` +
        `> **[N-OS]**: <@${user.id}>, proporcione su **designación oficial** para la generación de la credencial biométrica.`,
        0));

      const filter = m => m.author.id === user.id;
      const collector = ch.createMessageCollector({ filter, time: 45_000, max: 1 });

      collector.on('collect', async m => {
        const nombreInput = m.content.trim();
        tempMessages.push(m);

        const validacion = validarNombre(nombreInput);
        if (!validacion.valido) {
          await borrarMensajes(tempMessages);
          return ch.send(`❌ **[N-OS]**: \`${validacion.error}\` — Secuencia de registro abortada.`);
        }

        const { loadDB } = require('../utils/db');
        const db = loadDB();
        const nombreLower = nombreInput.toLowerCase();
        const nombreDuplicado = Object.values(db).some(
          p => p.nombre && p.nombre.toLowerCase() === nombreLower
        );
        if (nombreDuplicado) {
          await borrarMensajes(tempMessages);
          return ch.send(
            `❌ **[N-OS]**: \`CONFLICTO_DESIGNACIÓN\` — El alias **${nombreInput}** ya está asignado. ` +
            `Seleccione una variante distinta.`
          );
        }

        tempMessages.push(await enviarConDelay(ch,
          `> **[N-OS]**: Procesando alias \`${nombreInput}\`...`,
          1000));

        tempMessages.push(await enviarConDelay(ch,
          `> **[N-OS]**: Sincronización de bases de datos en progreso...`,
          1500));

        const sID = generarSystemID();
        const fotoInicial = obtenerFotoDePool();

        createProfile(user.id, {
          nombre: nombreInput,
          edad: 18,
          nacionalidad: 'Zona Central',
          sexo: 'N/A',
          bio: 'Registro estándar de ciudadano. Pendiente de actualización de datos biográficos.',
          foto: fotoInicial,
          systemID: sID
        });

        // Transmisión de auditoría de registro utilizando el contexto de la interacción
        await registrarLogEvento(interaction, 'NIMBUS-OS // ALTA_SISTEMA', [
          `**SUJETO:** <@${user.id}>`,
          `**DESIGNACIÓN:** ${nombreInput}`,
          `**SYNC_ID:** \`${sID}\``,
          `**ESTADO:** COMPILACIÓN_EXITOSA`
        ]);

        await borrarMensajes(tempMessages);

        await ch.send(
          `\`\`\`ansi\n\u001b[32m[NIMBUS-OS] — COMPILACIÓN COMPLETADA\u001b[0m\n\`\`\`` +
          `✅ <@${user.id}>, las credenciales han sido generadas y validadas.\n` +
          `> **DESIGNACIÓN:** ${nombreInput}\n` +
          `> **SYNC_ID:** \`${sID}\`\n\n` +
          `⚠️ *AVISO AUTOMÁTICO: Se aplicaron parámetros básicos. ` +
          `Utilice \`/perfil\` para acceder a la herramienta de personalización.*`
        );
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          await borrarMensajes(tempMessages);
          ch.send(`❌ **[N-OS]**: \`TIEMPO_AGOTADO\` — Desconexión por inactividad. Procedimiento cancelado.`);
        }
      });

    } catch (error) {
      console.error('❌ Error de tiempo de ejecución en comando registrar:', error);
      await borrarMensajes(tempMessages);
      ch.send('❌ **[N-OS]**: ERROR_FATAL — Fallo sistémico inesperado.');
    }
  }
};