const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getProfile, updateProfile } = require('../services/profileService');

// Mapa de intervalos activos: userId → intervalId
// Se mantiene en memoria; si el bot reinicia, los intervalos se limpian solos
// (el flag paused en el perfil persiste, pero el recordatorio se reiniciará al primer uso)
const pauseIntervals = new Map();

/**
 * Devuelve true si el userId tiene un rol autorizado para usar /narracion
 */
function isNarratorAuthorized(member) {
  // Owner siempre puede
  if (member.user.id === process.env.OWNER_ID) return true;
  // Admins siempre pueden
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const narratorRoles = (process.env.NARRATOR_ROLES || '')
    .split(',')
    .map(r => r.trim())
    .filter(Boolean);

  return member.roles.cache.some(role => narratorRoles.includes(role.id));
}

/**
 * Activa el recordatorio horario en el canal de logs
 */
function activarRecordatorio(userId, username, client) {
  // Limpiar intervalo anterior si existía
  if (pauseIntervals.has(userId)) {
    clearInterval(pauseIntervals.get(userId));
  }

  const interval = setInterval(async () => {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (!logChannelId) return;

    try {
      const channel = await client.channels.fetch(logChannelId).catch(() => null);
      if (!channel) return;

      await channel.send(
        `⏸️ **[N-OS] — RECORDATORIO DE NARRACIÓN**\n` +
        `> <@${userId}> (\`${username}\`) tiene los medidores de hambre y sed **en pausa** desde hace más de una hora.\n` +
        `> Si ya terminaste de narrar, usa \`/narracion\` para reactivar tus medidores.`
      );
    } catch (err) {
      console.error('[N-OS] Error enviando recordatorio de narración:', err);
    }
  }, 60 * 60 * 1000); // cada hora

  pauseIntervals.set(userId, interval);
}

/**
 * Desactiva el recordatorio horario
 */
function desactivarRecordatorio(userId) {
  if (pauseIntervals.has(userId)) {
    clearInterval(pauseIntervals.get(userId));
    pauseIntervals.delete(userId);
  }
}

// Exportamos el mapa para que index.js pueda limpiar intervalos al cerrar
module.exports = {
  pauseIntervals,

  data: new SlashCommandBuilder()
    .setName('narracion')
    .setDescription('Activa o desactiva la pausa de medidores de hambre y sed (modo narración)')
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuario a pausar/despausar (solo admins/narradores con permiso)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const executor = interaction.user;
    const member   = interaction.member;
    const client   = interaction.client;

    // ── Verificar autorización ──────────────────────────────────────────
    if (!isNarratorAuthorized(member)) {
      return interaction.reply({
        content: '🔒 **[N-OS]**: Acceso restringido. No tienes el rol necesario para usar este comando.',
        flags: 64
      });
    }

    // ── Determinar objetivo ─────────────────────────────────────────────
    const targetUser = interaction.options.getUser('usuario') || executor;
    const targetId   = targetUser.id;
    const isSelf     = targetId === executor.id;

    // Si intenta pausar a otro, debe ser admin u owner
    if (!isSelf) {
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
      const isOwner = executor.id === process.env.OWNER_ID;
      if (!isAdmin && !isOwner) {
        return interaction.reply({
          content: '❌ **[N-OS]**: Solo los administradores pueden pausar los medidores de otros usuarios.',
          flags: 64
        });
      }
    }

    // ── Verificar perfil ────────────────────────────────────────────────
    const profile = getProfile(targetId);
    if (!profile) {
      return interaction.reply({
        content: `❌ **[N-OS]**: <@${targetId}> no tiene perfil registrado en el sistema.`,
        flags: 64
      });
    }

    const pausedActual = profile.status?.paused ?? false;
    const nuevoPaused  = !pausedActual;

    // ── Guardar nuevo estado ────────────────────────────────────────────
    updateProfile(targetId, {
      status: {
        ...profile.status,
        paused: nuevoPaused
      }
    });

    // ── Gestionar recordatorio ──────────────────────────────────────────
    if (nuevoPaused) {
      activarRecordatorio(targetId, targetUser.username, client);
    } else {
      desactivarRecordatorio(targetId);
    }

    // ── Log al canal ────────────────────────────────────────────────────
    const perfilCmd = require('./perfil');
    await perfilCmd.helpers.sendToLogChannel(client, 'MODO_NARRACIÓN', [
      `EVENTO   : ${nuevoPaused ? 'MEDIDORES_PAUSADOS' : 'MEDIDORES_REACTIVADOS'}`,
      `OPERADOR : ${executor.tag} (${executor.id})`,
      ...(isSelf ? [] : [`SUJETO   : ${targetUser.tag} (${targetId})`]),
    ]);

    // ── Respuesta efímera al ejecutor ───────────────────────────────────
    const sujetoMention = isSelf ? 'Tus medidores' : `Los medidores de <@${targetId}>`;

    if (nuevoPaused) {
      return interaction.reply({
        content:
          `⏸️ **[N-OS]**: ${sujetoMention} de hambre y sed han sido **pausados**.\n` +
          `> Mientras estés en modo narración, los mensajes de proxy no reducirán tus niveles.\n` +
          `> Usa \`/narracion\` de nuevo cuando termines para reactivarlos.`,
        flags: 64
      });
    } else {
      return interaction.reply({
        content:
          `▶️ **[N-OS]**: ${sujetoMention} de hambre y sed han sido **reactivados**.\n` +
          `> Los mensajes de proxy volverán a reducir tus niveles con normalidad.`,
        flags: 64
      });
    }
  }
};
