const { SlashCommandBuilder } = require('discord.js');
const { getProfile } = require('../services/profileService');
const perfilCmd = require('./perfil');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verproxies')
    .setDescription('Muestra los proxies de Tupperbox vinculados a tu perfil')
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Ver proxies de otro usuario (solo staff)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const executor = interaction.user;
    const member   = interaction.member;
    const target   = interaction.options.getUser('usuario') || executor;
    const isSelf   = target.id === executor.id;

    // Verificación de privilegios administrativos para consultas de terceros
    if (!isSelf) {
      const isPrivileged = perfilCmd.helpers.isOwnerOrAuthorized(executor.id) ||
                           perfilCmd.helpers.isAdmin(member);
      if (!isPrivileged) {
        return interaction.reply({
          content: '❌ **[N-OS]**: No tienes autorización para ver los proxies de otros usuarios.',
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

    const proxies = Array.isArray(profile.proxies) && profile.proxies.length > 0
      ? profile.proxies.map((p, i) => `\`${i + 1}.\` ${p}`).join('\n')
      : 'Sin proxies registrados.';

    return interaction.reply({
      content:
        `📋 **[N-OS] — PROXIES DE ${isSelf ? 'TU PERFIL' : `<@${target.id}>`}**\n` +
        `${proxies}`,
      flags: 64
    });
  }
};