const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getProfile, updateProfile } = require('../services/profileService');
const { loadDB } = require('../utils/db');
const perfilCmd = require('./perfil');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('registrarproxy')
    .setDescription('Vincula el nombre de un proxy de Tupperbox a tu perfil de N-OS')
    .addStringOption(opt =>
      opt.setName('nombre')
        .setDescription('Nombre exacto del proxy tal como aparece en Discord')
        .setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuario al que registrar el proxy (solo staff)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const executor = interaction.user;
    const member   = interaction.member;
    const nombre   = interaction.options.getString('nombre').trim();
    const target   = interaction.options.getUser('usuario') || executor;
    const isSelf   = target.id === executor.id;

    // Verificación de privilegios administrativos para registros de terceros
    if (!isSelf) {
      const isPrivileged = perfilCmd.helpers.isOwnerOrAuthorized(executor.id) ||
                           perfilCmd.helpers.isAdmin(member);
      if (!isPrivileged) {
        return interaction.reply({
          content: '❌ **[N-OS]**: No tienes autorización para registrar proxies de otros usuarios.',
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

    if (proxiesActuales.map(p => p.toLowerCase()).includes(nombreLower)) {
      return interaction.reply({
        content: `⚠️ **[N-OS]**: El proxy \`${nombre}\` ya está registrado en ese perfil.`,
        flags: 64
      });
    }

    // Validación de unicidad global del proxy en la base de datos
    const db = loadDB();
    for (const [uid, prof] of Object.entries(db)) {
      if (uid === target.id) continue;
      if (!Array.isArray(prof.proxies)) continue;
      if (prof.proxies.map(p => p.toLowerCase()).includes(nombreLower)) {
        return interaction.reply({
          content: `❌ **[N-OS]**: El proxy \`${nombre}\` ya está vinculado a otro ciudadano del sistema.`,
          flags: 64
        });
      }
    }

    proxiesActuales.push(nombre);
    updateProfile(target.id, { proxies: proxiesActuales });

    // Emisión de registro de auditoría estandarizado
    await perfilCmd.helpers.sendToLogChannel(interaction, 'PROXY_REGISTRADO', [
      `**OPERADOR :** <@${executor.id}> ${!isSelf ? '(⚠️ ACCIÓN DE STAFF)' : ''}`,
      ...(isSelf ? [] : [`**SUJETO   :** <@${target.id}>`]),
      `**PROXY    :** \`${nombre}\``,
      `**TOTAL    :** ${proxiesActuales.length} proxy(s) activos`
    ]);

    return interaction.reply({
      content:
        `✅ **[N-OS]**: Proxy \`${nombre}\` registrado correctamente${isSelf ? '' : ` para <@${target.id}>`}.\n` +
        `> Proxies activos: ${proxiesActuales.map(p => `\`${p}\``).join(', ')}`,
      flags: 64
    });
  }
};