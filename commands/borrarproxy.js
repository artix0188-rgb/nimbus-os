const { SlashCommandBuilder } = require('discord.js');
const { getProfile, updateProfile } = require('../services/profileService');
const perfilCmd = require('./perfil');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('borrarproxy')
    .setDescription('Elimina un proxy de Tupperbox vinculado a tu perfil')
    .addStringOption(opt =>
      opt.setName('nombre')
        .setDescription('Nombre exacto del proxy a eliminar')
        .setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuario al que borrar el proxy (solo staff)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const executor = interaction.user;
    const member   = interaction.member;
    const nombre   = interaction.options.getString('nombre').trim();
    const target   = interaction.options.getUser('usuario') || executor;
    const isSelf   = target.id === executor.id;

    // Solo staff puede gestionar proxies de otros
    if (!isSelf) {
      const isPrivileged = perfilCmd.helpers.isOwnerOrAuthorized(executor.id) ||
                           perfilCmd.helpers.isAdmin(member);
      if (!isPrivileged) {
        return interaction.reply({
          content: '❌ **[N-OS]**: No tienes autorización para borrar proxies de otros usuarios.',
          flags: 64
        });
      }
    }

    const profile = getProfile(target.id);
    if (!profile) {
      return interaction.reply({
        content: `❌ **[N-OS]**: <@${target.id}> no tiene perfil registrado en el sistema.`,
        flags: 64
      });
    }

    const proxiesActuales = Array.isArray(profile.proxies) ? [...profile.proxies] : [];
    const nombreLower     = nombre.toLowerCase();
    const idx             = proxiesActuales.map(p => p.toLowerCase()).indexOf(nombreLower);

    if (idx === -1) {
      return interaction.reply({
        content: `⚠️ **[N-OS]**: El proxy \`${nombre}\` no está registrado en ese perfil.`,
        flags: 64
      });
    }

    proxiesActuales.splice(idx, 1);
    updateProfile(target.id, { proxies: proxiesActuales });

    // 🔥 CORRECCIÓN: Usar 'interaction' y formato de log azul con menciones
    await perfilCmd.helpers.sendToLogChannel(interaction, 'PROXY_ELIMINADO', [
      `**OPERADOR :** <@${executor.id}> ${!isSelf ? '(⚠️ ACCIÓN DE STAFF)' : ''}`,
      ...(isSelf ? [] : [`**SUJETO   :** <@${target.id}>`]),
      `**PROXY    :** \`${nombre}\``,
      `**RESTANTES:** ${proxiesActuales.length} proxy(s)`
    ]);

    return interaction.reply({
      content:
        `✅ **[N-OS]**: Proxy \`${nombre}\` eliminado${isSelf ? '' : ` del perfil de <@${target.id}>`}.\n` +
        `> Proxies restantes: ${proxiesActuales.length > 0 ? proxiesActuales.map(p => `\`${p}\``).join(', ') : 'ninguno'}`,
      flags: 64
    });
  }
};