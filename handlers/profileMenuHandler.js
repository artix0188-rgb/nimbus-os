const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { getProfile, updateProfile, deleteProfile } = require('../services/profileService');
const perfilCmd = require('../commands/perfil');
const handleInventory = require('./inventoryHandler');

// ---------------------------------------------------------------------------
// RACE CONDITIONS
// ---------------------------------------------------------------------------
const activeCollectors = new Map();

// ---------------------------------------------------------------------------
// HELPERS DE URL
// ---------------------------------------------------------------------------

function parseEmbedUrl(message) {
  const url = message.embeds?.[0]?.author?.url;
  if (!url) return { ownerId: null, editorId: null };

  const staffMatch = url.match(/\/user\/(\d+)\/editor\/(\d+)$/);
  if (staffMatch) return { ownerId: staffMatch[1], editorId: staffMatch[2] };

  const ownerMatch = url.match(/\/user\/(\d+)$/);
  if (ownerMatch) return { ownerId: ownerMatch[1], editorId: ownerMatch[1] };

  return { ownerId: null, editorId: null };
}

// ---------------------------------------------------------------------------
// HELPERS DE PERMISOS
// ---------------------------------------------------------------------------

function canEdit(userId, member) {
  return perfilCmd.helpers.isOwnerOrAuthorized(userId) || perfilCmd.helpers.isAdmin(member);
}

function canDelete(userId) {
  return perfilCmd.helpers.isOwnerOrAuthorized(userId);
}

function validarURLImagen(input) {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol))
      return { valido: false, error: 'URL_PROTOCOLO_INVALIDO' };

    const esImagen = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url.pathname);
    if (!esImagen && !url.hostname.includes('imgur') && !url.hostname.includes('cdn.discordapp'))
      return { valido: false, error: 'URL_NO_ES_IMAGEN' };

    return { valido: true };
  } catch {
    return { valido: false, error: 'URL_FORMATO_INVALIDO' };
  }
}

async function borrarMensajesSeguros(mensajes) {
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

// ---------------------------------------------------------------------------
// HANDLER PRINCIPAL
// ---------------------------------------------------------------------------

module.exports = async function handleProfileButtons(interaction) {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const member = interaction.member;
  const client = interaction.client;
  const customId = interaction.customId; // Ej: perfil_edit_mode

  const { ownerId, editorId } = parseEmbedUrl(interaction.message);
  
  // 🔍 RASTREADOR DE TARGET: Leemos de la URL o del Botón (si venimos del inventario)
  let targetId = ownerId || userId;
  if (customId.includes('_target_')) {
    targetId = customId.split('_target_')[1].split('_orig_')[0];
  }
  
  const profile = getProfile(targetId);

  if (!profile) return interaction.reply({ content: '❌ Perfil no encontrado.', flags: 64 });

  // 🛡️ GATEKEEPER ESTRICTO
  let isAuthorized = userId === targetId || userId === editorId;

  // 🟢 EXCEPCIÓN DE RETORNO: Si el inventario borró la URL, pero es el Staff regresando, le damos pase.
  if (!isAuthorized && customId.startsWith('perfil_back_target_')) {
    if (perfilCmd.helpers.isStaff(userId, member)) {
      isAuthorized = true; 
    }
  }

  if (!isAuthorized) {
    const isStaff = perfilCmd.helpers.isStaff(userId, member);
    
    // 📢 Log de Auditoría (Embed Azul)
    await perfilCmd.helpers.sendToLogChannel(interaction, 'INTENTO_ACCESO_DENEGADO', [
      `**OPERADOR :** <@${userId}> ${isStaff ? '(⚠️ NIVEL STAFF)' : ''}`,
      `**SUJETO   :** <@${targetId}> — ${profile.nombre}`,
      `**ACCIÓN   :** Clic en botón \`${customId}\``,
      `**RESULTADO:** ACCESO BLOQUEADO (Sesión ajena)`
    ]);

    return interaction.reply({
      content: isStaff 
        ? `❌ **[N-OS]**: ACCESO_DENEGADO. Como staff, debes usar \`/perfil <usuario>\` para abrir tu propia terminal de intervención.`
        : `❌ **[N-OS]**: ACCESO_DENEGADO. No puedes manipular una terminal ajena.`,
      flags: 64
    });
  }

  const isSelf = targetId === userId;

  // -----------------------------------------------------------------------
  // ACCIONES INSTANTÁNEAS
  // -----------------------------------------------------------------------

  if (customId === 'perfil_inv_open') {
    return await handleInventory(interaction, targetId);
  }

  if (customId === 'perfil_close') {
    return interaction.message.delete().catch(() => null);
  }

  if (customId === 'perfil_edit_mode') {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('perfil_edit_nombre')
        .setLabel('Nombre')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('perfil_edit_edad')
        .setLabel('Edad')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('perfil_edit_sexo')
        .setLabel('Género')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('perfil_edit_bio')
        .setLabel('Biografía')
        .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('perfil_edit_nacionalidad')
        .setLabel('Nacionalidad')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('perfil_edit_foto')
        .setLabel('Foto')
        .setStyle(ButtonStyle.Secondary),
      ...(isSelf || canDelete(userId)
        ? [
            new ButtonBuilder()
              .setCustomId('perfil_delete_char')
              .setLabel('BORRAR')
              .setStyle(ButtonStyle.Danger)
          ]
        : []),
      new ButtonBuilder()
        .setCustomId('perfil_back')
        .setLabel('Volver')
        .setStyle(ButtonStyle.Success)
    );

    return interaction.update({ components: [row1, row2] });
  }

  // 🔥 FIX DE RETORNO: Ahora lee si empieza con 'perfil_back' para aceptar el ID del inventario
  if (customId.startsWith('perfil_back')) {
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

    // Al restaurar la ficha, volvemos a pasar "userId" como editor para RESTAURAR la URL perdida
    const embed = isSelf
      ? perfilCmd.helpers.generarRespuestaPerfil(profile, targetId)
      : perfilCmd.helpers.generarRespuestaPerfilConEditor(profile, targetId, userId);

    return interaction.update({ embeds: [embed], components: [mainRow] });
  }

  // -----------------------------------------------------------------------
  // PROCESAR ENTRADAS DE TEXTO (PDA + AUDITORÍA)
  // -----------------------------------------------------------------------

  const configMap = {
    perfil_edit_nombre: { field: 'nombre', msg: '`[PDA] >> REGISTRO_IDENTIDAD`\n> Ingrese la nueva designación del operador:' },
    perfil_edit_edad: { field: 'edad', msg: '`[PDA] >> BIOMETRÍA`\n> Especifique los años de supervivencia del sujeto:' },
    perfil_edit_sexo: { field: 'sexo', msg: '`[PDA] >> BIOMETRÍA`\n> Determine el género del operador:' },
    perfil_edit_bio: { field: 'bio', msg: '`[PDA] >> ARCHIVO_PERSONAL`\n> Redacte la actualización de la bitácora:' },
    perfil_edit_nacionalidad: { field: 'nacionalidad', msg: '`[PDA] >> ORIGEN`\n> Especifique lugar de procedencia o facción base:' },
    perfil_edit_foto: { field: 'foto', msg: '`[PDA] >> ADJUNTO_VISUAL`\n> Transmita la URL directa de la imagen:' },
    perfil_delete_char: { field: 'delete', msg: '`[PDA] >> ALERTA_CRÍTICA` ☢️\n> Escriba **CONFIRMAR** para purgar el expediente.' }
  };

  const action = configMap[customId];
  if (!action) return;

  await interaction.deferUpdate();
  const promptMessage = await interaction.channel.send(`📟 **[N-OS // INTERFAZ PDA ACTIVA]**\n${action.msg}`);

  const filter = m => m.author.id === userId;

  try {
    const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
    const responseMessage = collected.first();
    const userInput = responseMessage.content.trim();
    
    // Capturamos el valor antiguo antes de cambiarlo para el log
    const oldValue = profile[action.field] || 'N/A';
    let success = false;
    let logTitle = 'MODIFICACIÓN_FICHA';

    // ── Lógica de borrado ──────────────────────────────────────────────
    if (action.field === 'delete') {
      if (userInput.toUpperCase() === 'CONFIRMAR') {
        // Log de borrado antes de eliminar el objeto
        await perfilCmd.helpers.sendToLogChannel(interaction, 'FICHA_PURGADA', [
          `**OPERADOR :** <@${userId}> ${!isSelf ? '(⚠️ ACCIÓN DE STAFF)' : ''}`,
          `**SUJETO   :** ${profile.nombre} (<@${targetId}>)`,
          `**SYNC_ID  :** \`${profile.systemID}\``,
          `**RESULTADO:** IDENTIDAD ELIMINADA DEL SISTEMA`
        ]);
        
        deleteProfile(targetId);
        await interaction.channel.send(`☢️ **[N-OS]**: PROTOCOLO DE PURGA COMPLETADO.`);
        return interaction.message.delete().catch(() => null);
      } else {
        await interaction.channel.send(`ℹ️ **[N-OS]**: Purga abortada.`);
      }
    } 
    
    // ── Lógica de foto ────────────────────────────────────────────────
    else if (action.field === 'foto') {
      const val = validarURLImagen(userInput);
      if (val.valido) {
        updateProfile(targetId, { foto: userInput });
        success = true;
      } else {
        await interaction.channel.send(`❌ **[N-OS]**: ERROR DE RED. URL inválida.`);
      }
    } 
    
    // ── Lógica general (Nombre, edad, etc.) ───────────────────────────
    else {
      const finalValue = action.field === 'edad' ? parseInt(userInput) : userInput;
      if (action.field === 'edad' && isNaN(finalValue)) {
        await interaction.channel.send(`❌ **[N-OS]**: El valor debe ser numérico.`);
      } else {
        updateProfile(targetId, { [action.field]: finalValue });
        success = true;
      }
    }

    // 🔥 SINCRONIZACIÓN Y AUDITORÍA EN TIEMPO REAL
    if (success) {
      const updatedProfile = getProfile(targetId);
      const newValue = updatedProfile[action.field];

      // Enviamos el log detallado al canal azul
      await perfilCmd.helpers.sendToLogChannel(interaction, 'SINCRONIZACIÓN_DATOS', [
        `**OPERADOR :** <@${userId}> ${!isSelf ? '(⚠️ ACCIÓN DE STAFF)' : ''}`,
        `**SUJETO   :** <@${targetId}> — ${profile.nombre}`,
        `**CAMBIO   :** \`${action.field.toUpperCase()}\``,
        `**ANTERIOR :** ${oldValue}`,
        `**NUEVO    :** ${newValue}`
      ]);

      const newEmbed = isSelf 
        ? perfilCmd.helpers.generarRespuestaPerfil(updatedProfile, targetId)
        : perfilCmd.helpers.generarRespuestaPerfilConEditor(updatedProfile, targetId, userId);

      await interaction.message.edit({ embeds: [newEmbed] });
      await interaction.channel.send(`✅ **[N-OS]**: Sincronización exitosa.`);
    }

    setTimeout(() => {
      borrarMensajesSeguros([promptMessage, responseMessage]);
    }, 4000);

  } catch (error) {
    const timeoutMsg = await interaction.channel.send(`⏳ **[N-OS]**: Conexión de PDA perdida por inactividad.`);
    setTimeout(() => {
      borrarMensajesSeguros([promptMessage, timeoutMsg]);
    }, 4000);
  }
};