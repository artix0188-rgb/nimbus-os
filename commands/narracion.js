const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getProfile, updateProfile } = require('../services/profileService');

// Mapeo de intervalos de ejecución activos: userId -> intervalId
// Almacenamiento volátil; los intervalos se restablecen durante el reinicio del sistema
// La bandera de pausa en el registro persiste, restableciendo el recordatorio en su primera invocación
const pauseIntervals = new Map();

/**
 * Valida si el usuario posee los roles necesarios para ejecutar el comando de narración
 */
function isNarratorAuthorized(member) {
  // Autorización predeterminada para el operador principal
  if (member.user.id === process.env.OWNER_ID) return true;
  // Autorización predeterminada para administradores del sistema
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const narratorRoles = (process.env.NARRATOR_ROLES || '')
    .split(',')
    .map(r => r.trim())
    .filter(Boolean);

  return member.roles.cache.some(role => narratorRoles.includes(role.id));
}

/**
 * Inicializa un temporizador recurrente para notificaciones en el canal de auditoría
 */
function activarRecordatorio(userId, username, client) {
  // Depuración de intervalos preexistentes para prevenir redundancias
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
  }, 60 * 60 * 1000); // Intervalo de ejecución: 1 hora

  pauseIntervals.set(userId, interval);
}

/**
 * Detiene y elimina el temporizador de notificaciones activo
 */
function desactivarRecordatorio(userId) {
  if (pauseIntervals.has(userId)) {
    clearInterval(pauseIntervals.get(userId));
    pauseIntervals.delete(userId);
  }
}

// Exposición de la estructura de datos para la rutina de limpieza global
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

    // Fase 1: Validación de autorizaciones del usuario
    if (!isNarratorAuthorized(member)) {
      return interaction.reply({
        content: '🔒 **[N-OS]**: Acceso restringido. No tienes el rol necesario para usar este comando.',
        flags: 64
      });
    }

    // Fase 2: Identificación del sujeto objetivo
    const targetUser = interaction.options.getUser('usuario') || executor;
    const targetId   = targetUser.id;
    const isSelf     = targetId === executor.id;

    // Restricción de manipulación de registros de terceros a personal autorizado
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

    // Fase 3: Consulta del registro de perfil
    const profile = getProfile(targetId);
    if (!profile) {
      return interaction.reply({
        content: `❌ **[N-OS]**: <@${targetId}> no tiene perfil registrado en el sistema.`,
        flags: 64
      });
    }

    const pausedActual = profile.status?.paused ?? false;
    const nuevoPaused  = !pausedActual;

    // Fase 4: Persistencia del nuevo estado de pausa
    updateProfile(targetId, {
      status: {
        ...profile.status,
        paused: nuevoPaused
      }
    });

    // Fase 5: Actualización del motor de notificaciones
    if (nuevoPaused) {
      activarRecordatorio(targetId, targetUser.username, client);
    } else {
      desactivarRecordatorio(targetId);
    }

    // Fase 6: Emisión del registro de auditoría
    const perfilCmd = require('./perfil');
    await perfilCmd.helpers.sendToLogChannel(client, 'MODO_NARRACIÓN', [
      `EVENTO   : ${nuevoPaused ? 'MEDIDORES_PAUSADOS' : 'MEDIDORES_REACTIVADOS'}`,
      `OPERADOR : ${executor.tag} (${executor.id})`,
      ...(isSelf ? [] : [`SUJETO   : ${targetUser.tag} (${targetId})`]),
    ]);

    // Fase 7: Transmisión de respuesta final a la interfaz
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