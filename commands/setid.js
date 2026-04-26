const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadDB, saveDB } = require('../utils/db');
const { getProfile, updateProfile } = require('../services/profileService');
const perfilCmd = require('./perfil');

module.exports = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName('setid')
    .setDescription('Cambiar el ID de Nimbus-OS (Uso Administrativo)')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Usuario a modificar')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Nuevo ID personalizado (letras y números)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const ejecutor = interaction.user;
    const member   = interaction.member;
    const target   = interaction.options.getUser('usuario');
    const nuevoID  = interaction.options.getString('id').trim();

    // 🔒 VERIFICACIÓN DE PERMISOS ESTRICTA
    const isPrivileged = perfilCmd.helpers.isOwnerOrAuthorized(ejecutor.id) ||
                         member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isPrivileged) {
      return interaction.reply({
        content: '❌ **NIMBUS-OS // ACCESS DENIED**: No tienes permisos para sobrescribir registros de sistema.',
        flags: 64
      });
    }

    // 🔍 VALIDACIÓN DE EXISTENCIA
    const profile = getProfile(target.id);
    if (!profile) {
      return interaction.reply({
        content: `❌ **NIMBUS-OS // ERROR**: <@${target.id}> no tiene perfil registrado en el sistema.`,
        flags: 64
      });
    }

    // 📏 VALIDACIONES DE FORMATO
    if (!/^[a-zA-Z0-9_-]+$/.test(nuevoID)) {
      return interaction.reply({
        content: '❌ **NIMBUS-OS // ERROR**: El ID solo puede contener letras, números, guiones y guiones bajos.',
        flags: 64
      });
    }

    if (nuevoID.length < 3 || nuevoID.length > 20) {
      return interaction.reply({
        content: '❌ **NIMBUS-OS // ERROR**: El ID debe tener entre 3 y 20 caracteres.',
        flags: 64
      });
    }

    // 🔁 EVITAR DUPLICADOS
    const db = loadDB();
    const existe = Object.values(db).some(u => u.systemID === nuevoID && u.id !== target.id);
    if (existe) {
      return interaction.reply({
        content: `❌ **NIMBUS-OS // ERROR**: El identificador \`${nuevoID}\` ya está asignado a otro ciudadano.`,
        flags: 64
      });
    }

    const oldID = profile.systemID || 'N/A';

    // 💾 GUARDAR USANDO EL SERVICIO (Para mantener coherencia de datos)
    updateProfile(target.id, { 
      systemID: nuevoID,
      lastModifiedBy: ejecutor.id 
    });

    // 🔥 LOG AL CANAL (Embed Azul con Menciones)
    await perfilCmd.helpers.sendToLogChannel(interaction, 'SOBRESCRITURA_SISTEMA', [
      `**EVENTO   :** CAMBIO_DE_SYSTEM_ID (MANUAL)`,
      `**OPERADOR :** <@${ejecutor.id}> (ADMIN)`,
      `**SUJETO   :** <@${target.id}> — ${profile.nombre}`,
      `**ANTERIOR :** \`${oldID}\``,
      `**NUEVO    :** \`${nuevoID}\``
    ]);

    await interaction.reply({
      content: 
        `✅ **NIMBUS-OS // DATABASE UPDATED**\n\n` +
        `El ciudadano **${target.username}** ahora posee el ID: \`${nuevoID}\`\n` +
        `> ID anterior: \`${oldID}\`\n` +
        `> Modificado por: ${ejecutor.tag}`,
      flags: 64
    });
  }
};