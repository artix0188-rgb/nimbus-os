const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getProfile, createProfile } = require('../services/profileService');

// ---------------------------------------------------------------------------
// COOLDOWN SYSTEM (Previene spam del comando)
// ---------------------------------------------------------------------------
const cooldowns = new Map();
const COOLDOWN_TIME = 10000; // 10 segundos

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

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

// 🔥 MEJORA: Log de registro pasado a Embed Azul
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
    console.error('❌ [N-OS]: Error Log:', e.message);
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

// ---------------------------------------------------------------------------
// COMANDO
// ---------------------------------------------------------------------------

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
          content: `⏳ **[N-OS]**: COOLDOWN_ACTIVO. Espera ${tiempoRestante}s antes de reintentar.`,
          flags: 64
        });
      }
    }

    if (getProfile(user.id)) {
      return interaction.reply({
        content:
          `⚠️ **[N-OS]**: ERROR: \`ID_DUPLICADA\`\n` +
          `> El sistema ya detecta un registro activo para este operador.\n` +
          `> Use \`/perfil\` para acceder a sus entradas en la terminal.`,
        flags: 64
      });
    }

    cooldowns.set(user.id, Date.now());

    await interaction.reply({ 
      content: `*️⃣ **[N-OS]**: Iniciando conexión...`, 
      flags: 64
    });

    const ch = interaction.channel;
    const tempMessages = [];

    try {
      tempMessages.push(await enviarConDelay(ch,
        `\`\`\`ansi\n\u001b[32m[NIMBUS-OS v4.0.2] — TERMINAL KERNEL ACTIVO\u001b[0m\n\`\`\``,
        1500));

      tempMessages.push(await enviarConDelay(ch,
        `> **[N-OS]**: Estableciendo enlace con la red...\n> **[N-OS]**: Verificando identidad del operador...`,
        1500));

      tempMessages.push(await enviarConDelay(ch,
        `> **[N-OS]**: Sujeto no registrado detectado. Iniciando **PROTOCOLO DE INDUCCIÓN**.\n` +
        `> **[N-OS]**: <@${user.id}>, introduzca su **nombre completo** para vincular su identidad a la red.`,
        0));

      const filter = m => m.author.id === user.id;
      const collector = ch.createMessageCollector({ filter, time: 45_000, max: 1 });

      collector.on('collect', async m => {
        const nombreInput = m.content.trim();
        tempMessages.push(m);

        const validacion = validarNombre(nombreInput);
        if (!validacion.valido) {
          await borrarMensajes(tempMessages);
          return ch.send(`❌ **[N-OS]**: \`${validacion.error}\` — Protocolo abortado.`);
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
            `❌ **[N-OS]**: \`NOMBRE_DUPLICADO\` — Ya existe un ciudadano registrado con el nombre **${nombreInput}**. ` +
            `Elige otro nombre para completar el registro.`
          );
        }

        tempMessages.push(await enviarConDelay(ch,
          `> **[N-OS]**: Validando designación \`${nombreInput}\`...`,
          1000));

        tempMessages.push(await enviarConDelay(ch,
          `> **[N-OS]**: Sincronizando datos con el KERNEL...`,
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

        // 🔥 Enviar Log en formato Embed usando interaction
        await registrarLogEvento(interaction, 'NIMBUS-OS // ALTA_SISTEMA', [
          `**SUJETO:** <@${user.id}>`,
          `**DESIGNACIÓN:** ${nombreInput}`,
          `**SYNC_ID:** \`${sID}\``,
          `**ESTADO:** REGISTRADO_EXITOSAMENTE`
        ]);

        await borrarMensajes(tempMessages);

        await ch.send(
          `\`\`\`ansi\n\u001b[32m[NIMBUS-OS] — REGISTRO COMPLETADO\u001b[0m\n\`\`\`` +
          `✅ <@${user.id}>, su identidad ha sido vinculada a la red.\n` +
          `> **DESIGNACIÓN:** ${nombreInput}\n` +
          `> **SYNC_ID:** \`${sID}\`\n\n` +
          `⚠️ *AVISO DEL SISTEMA: Se han detectado parámetros estándar asignados por defecto. ` +
          `Use \`/perfil\` para personalizar sus entradas en la terminal.*`
        );
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          await borrarMensajes(tempMessages);
          ch.send(`❌ **[N-OS]**: \`TIMEOUT\` — El tiempo de respuesta ha expirado. Protocolo cancelado.`);
        }
      });

    } catch (error) {
      console.error('❌ Error en comando registrar:', error);
      await borrarMensajes(tempMessages);
      ch.send('❌ **[N-OS]**: ERROR_CRITICO — El protocolo ha fallado.');
    }
  }
};