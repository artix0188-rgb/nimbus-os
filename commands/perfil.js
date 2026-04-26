const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { getProfile } = require('../services/profileService');
const { loadDB } = require('../utils/db');

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function isOwnerOrAuthorized(userId) {
  if (userId === process.env.OWNER_ID) return true;
  const authorizedIds = (process.env.AUTHORIZED_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(id => /^\d+$/.test(id));
  return authorizedIds.includes(userId);
}

function isAdmin(member) {
  return member?.permissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

function isStaff(userId, member) {
  return isOwnerOrAuthorized(userId) || isAdmin(member);
}

// 🔥 ACTUALIZADO: Ahora genera Embeds azules con menciones y contexto de canal
async function sendToLogChannel(interaction, titulo, lineas) {
  const logChannelId = process.env.LOG_CHANNEL_ID;
  if (!logChannelId) return;
  try {
    const client = interaction.client;
    let channel = client.channels.cache.get(logChannelId);
    if (!channel) channel = await client.channels.fetch(logChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(`📟 NIMBUS-OS // ${titulo}`)
      .setColor(0x0099ff) // Azul táctico
      .setDescription(lineas.join('\n'))
      .addFields(
        { name: '📍 Sector de Origen', value: `<#${interaction.channelId}>`, inline: true },
        { name: '🕒 Registro Temporal', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('❌ Error enviando log:', err);
  }
}

function generarRespuestaPerfil(profile, userId) {
  return new EmbedBuilder()
    .setAuthor({
      name: `ENLACE: ${(profile.nombre || 'DESCONOCIDO').toUpperCase()}`,
      url: `https://nimbus-os.invalid/user/${userId}`
    })
    .setDescription(
      '```ansi\n' +
      '\u001b[32mSISTEMA OPERATIVO NIMBUS-OS v4.0.2\n' +
      '// ESTADO: ACTIVO\u001b[0m\n' +
      '```' +
      '\n─────────────────────────────────'
    )
    .addFields(
      {
        name: '▼ BIOGRAFÍA / ARCHIVO',
        value: '```ansi\n\u001b[32m' + (profile.bio || 'Sin datos registrados.') + '\u001b[0m\n```'
      },
      {
        name: '▼ INFORMACIÓN DEL SUJETO',
        value: [
          `> EDAD: ${profile.edad || 'N/A'}`,
          `> ORIGEN: ${profile.nacionalidad || 'N/A'}`,
          `> SEXO: ${profile.sexo || 'N/A'}`
        ].join('\n')
      }
    )
    .setImage(profile.foto || null)
    .setColor(0x1a1a1a)
    .setFooter({
      text: `SYNC_ID: ${profile.systemID} | TERMINAL KERNEL v4.0.2`
    });
}

function generarRespuestaPerfilConEditor(profile, ownerId, editorId) {
  return new EmbedBuilder()
    .setAuthor({
      name: `ENLACE: ${(profile.nombre || 'DESCONOCIDO').toUpperCase()}`,
      url: `https://nimbus-os.invalid/user/${ownerId}/editor/${editorId}`
    })
    .setDescription(
      '```ansi\n' +
      '\u001b[32mSISTEMA OPERATIVO NIMBUS-OS v4.0.2\n' +
      '// ESTADO: ACTIVO\u001b[0m\n' +
      '```' +
      '\n─────────────────────────────────'
    )
    .addFields(
      {
        name: '▼ BIOGRAFÍA / ARCHIVO',
        value: '```ansi\n\u001b[32m' + (profile.bio || 'Sin datos registrados.') + '\u001b[0m\n```'
      },
      {
        name: '▼ INFORMACIÓN DEL SUJETO',
        value: [
          `> EDAD: ${profile.edad || 'N/A'}`,
          `> ORIGEN: ${profile.nacionalidad || 'N/A'}`,
          `> SEXO: ${profile.sexo || 'N/A'}`
        ].join('\n')
      }
    )
    .setImage(profile.foto || null)
    .setColor(0x1a1a1a)
    .setFooter({
      text: `SYNC_ID: ${profile.systemID} | TERMINAL KERNEL v4.0.2`
    });
}

// ---------------------------------------------------------------------------
// MÓDULO EXPORTADO
// ---------------------------------------------------------------------------

module.exports = {
  data: new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Muestra la ficha de un usuario.')
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuario a consultar (opcional)')
        .setRequired(false)
    ),

  helpers: {
    isOwnerOrAuthorized,
    isAdmin,
    isStaff,
    sendToLogChannel,
    generarRespuestaPerfil,
    generarRespuestaPerfilConEditor
  },

  async execute(interaction) {
    const targetUser  = interaction.options.getUser('usuario') || interaction.user;
    const targetId    = targetUser.id;
    const requesterId = interaction.user.id;
    const member      = interaction.member;
    const client      = interaction.client;
    const isSelf      = targetId === requesterId;
    const staffActing = !isSelf && isStaff(requesterId, member);

    const profile = getProfile(targetId);

    // ── Sin ficha ──────────────────────────────────────────────────────
    if (!profile) {
      if (staffActing) {
        await sendToLogChannel(interaction, 'ACCESO_DESCONOCIDO', [
          `**OPERADOR :** <@${requesterId}>`,
          `**SUJETO   :** <@${targetId}>`,
          `**RESULTADO:** SIN_FICHA_REGISTRADA`
        ]);
        return interaction.reply({
          content: `⚠️ **[N-OS]**: El usuario <@${targetId}> no tiene ficha registrada en el sistema.`,
          flags: 64
        });
      }
      if (isSelf) {
        return interaction.reply({
          content: `🔒 **[N-OS]**: No tienes ninguna ficha registrada. Usa \`/registrar\` para crear tu perfil.`,
          flags: 64
        });
      }
      return interaction.reply({
        content: `❌ **[N-OS]**: EXPEDIENTE_NO_ENCONTRADO. El usuario indicado no tiene ficha.`,
        flags: 64
      });
    }

    // ── Log cuando staff abre ficha ajena ─────────────────────────────
    if (staffActing) {
      await sendToLogChannel(interaction, 'ACCESO_FICHA_AJENA', [
        `**EVENTO   :** FICHA_ABIERTA`,
        `**OPERADOR :** <@${requesterId}>`,
        `**SUJETO   :** <@${targetId}> — ${profile.nombre}`,
        `**SYNC_ID  :** \`${profile.systemID}\``
      ]);
    }

    // ── Generar embed ──────────────────────────────────────────────────
    const embed = staffActing
      ? generarRespuestaPerfilConEditor(profile, targetId, requesterId)
      : generarRespuestaPerfil(profile, targetId);

    const mainRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('estado_open')
        .setLabel('ESTADO')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('perfil_inv_open')
        .setLabel('INVENTARIO')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('perfil_edit_mode')
        .setLabel('CONFIG. PDA')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('perfil_close')
        .setLabel('DESCONECTAR')
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({ 
      embeds: [embed], 
      components: [mainRow] 
    });
  }
};