const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { getProfile, updateProfile } = require('../services/profileService');
const { itemsMaster } = require('../services/inventoryService'); 
const perfilCmd = require('../commands/perfil');

// ===========================================================================
// Funciones auxiliares
// ===========================================================================

function getOwnerIdFromEmbed(message) {
  if (!message.embeds?.length) return null;
  const url = message.embeds[0].author?.url;
  if (!url) return null;
  const staffMatch = url.match(/\/user\/(\d+)\/editor\/(\d+)$/);
  if (staffMatch) return staffMatch[1];
  const ownerMatch = url.match(/\/user\/(\d+)$/);
  return ownerMatch ? ownerMatch[1] : null;
}

function getEditorIdFromEmbed(message) {
  if (!message.embeds?.length) return null;
  const url = message.embeds[0].author?.url;
  if (!url) return null;
  const staffMatch = url.match(/\/user\/(\d+)\/editor\/(\d+)$/);
  if (staffMatch) return staffMatch[2];
  const ownerMatch = url.match(/\/user\/(\d+)$/);
  return ownerMatch ? ownerMatch[1] : null;
}

function generarBarra(porcentaje, longitud = 10) {
  const lleno = Math.round((porcentaje / 100) * longitud);
  const vacio = Math.max(0, longitud - lleno);
  return '█'.repeat(lleno) + '░'.repeat(vacio);
}

function generarBarraAP(valor, max = 50, longitud = 10) {
  const porcentaje = Math.max(0, Math.min(100, (valor / max) * 100));
  const lleno = Math.round((porcentaje / 100) * longitud);
  const vacio = Math.max(0, longitud - lleno);
  return '█'.repeat(lleno) + '░'.repeat(vacio);
}

function calculateArmor(profile) {
  let ap = 0;
  if (!profile || !profile.equipment) return 0;
  const slots = ['cabeza', 'torso', 'piernas', 'brazos'];
  slots.forEach(slot => {
    const itemId = profile.equipment[slot]?.itemId;
    if (itemId && itemsMaster[itemId]?.armor) ap += itemsMaster[itemId].armor;
  });
  return Math.min(50, ap); // Límite máximo de blindaje fijado en 50 unidades
}

// Estandarización de nomenclaturas de estado
function getEstadoHp(porcentaje) {
  if (porcentaje >= 70) {
    return { estado: 'SANO', color: 0x00ff00, descripcion: 'Signos vitales estables. No se detectan anomalías críticas.' };
  } else if (porcentaje >= 30) {
    return { estado: 'HERIDO LEVEMENTE', color: 0xffaa00, descripcion: 'Se detectan lesiones menores. Se recomienda atención médica básica.' };
  } else if (porcentaje >= 1) {
    return { estado: 'HERIDO GRAVEMENTE', color: 0xff0000, descripcion: '⚠️ ALERTA CRÍTICA: Lesiones graves detectadas. Atención médica urgente requerida.' };
  } else {
    return { estado: 'CRÍTICO', color: 0x8B0000, descripcion: '💀 ESTADO TERMINAL: Signos vitales en fallo sistémico.' };
  }
}

function getNivelRadiacion(porcentaje) {
  if (porcentaje === 0) return { nivel: 'NULO', color: 0x00ff00, descripcion: 'No se detecta radiación. Niveles normales.' };
  if (porcentaje <= 25) return { nivel: 'BAJO', color: 0xffff00, descripcion: 'Exposición mínima detectada. Sin riesgo inmediato.' };
  if (porcentaje <= 60) return { nivel: 'MODERADO', color: 0xff9900, descripcion: '⚠️ Niveles de radiación elevados. Sugiere RadAway.' };
  return { nivel: 'ALTO', color: 0xff0000, descripcion: '☢️ PELIGRO: Exposición crítica a radiación.' };
}

function getNivelHambre(porcentaje) {
  if (porcentaje >= 70) return { estado: 'Satisfecho', alerta: false };
  if (porcentaje >= 30) return { estado: 'Con hambre', alerta: false };
  return { estado: '⚠️ Muy hambriento', alerta: true };
}

function getNivelSed(porcentaje) {
  if (porcentaje >= 70) return { estado: 'Hidratado', alerta: false };
  if (porcentaje >= 30) return { estado: 'Con sed', alerta: false };
  return { estado: '⚠️ Muy sediento', alerta: true };
}

function getCategoriaStats(valor) {
  if (valor >= -2 && valor <= 0) return 'Deficiente';
  if (valor >= 1 && valor <= 3) return 'Pobre';
  if (valor >= 4 && valor <= 6) return 'Promedio';
  if (valor >= 7 && valor <= 9) return 'Adepto';
  if (valor === 10) return 'Superior';
  return 'Inválido';
}

function generarEstadoEmbed(profile, userId) {
  const status = profile.status || {};
  // Extracción segura del valor de integridad física (HP)
  const hp = Math.floor(Math.max(0, Math.min(100, status.hp ?? 100)));
  const radiacion = status.radiacion ?? 0;
  const hambre = status.hambre ?? 50;
  const sed = status.sed ?? 50;
  const stats = status.stats || { fuerza: 1, destreza: 1, percepcion: 1, ingenio: 1, temple: 1 };
  const blindaje = calculateArmor(profile);

  const estadoFisico = getEstadoHp(hp);
  const nivelRadiacion = getNivelRadiacion(radiacion);
  const estadoHambre = getNivelHambre(hambre);
  const estadoSed = getNivelSed(sed);

  return new EmbedBuilder()
    .setAuthor({
      name: `ESCANEO BIOMÉTRICO: ${(profile.nombre || 'DESCONOCIDO').toUpperCase()}`,
      url: `https://nimbus-os.invalid/user/${userId}`
    })
    .setDescription(
      '```ansi\n' +
      '\u001b[32m[NIMBUS-OS] — ANALIZADOR TÁCTICO v2.1\n' +
      '// Escaneando signos vitales e integridad de equipo...\u001b[0m\n' +
      '```'
    )
    .setColor(estadoFisico.color)
    .addFields(
      {
        name: '🏥 CONDICIÓN FÍSICA',
        value: `\`\`\`ansi\nEstado: \u001b[1m${estadoFisico.estado}\u001b[0m\nHP: ${generarBarra(hp)} ${hp}/100\nAP: ${generarBarraAP(blindaje)} ${blindaje}/50\n${estadoFisico.descripcion}\n\`\`\``,
        inline: false
      },
      {
        name: '☢️ RADIACIÓN',
        value: `\`\`\`ansi\nNivel: \u001b[1m${nivelRadiacion.nivel}\u001b[0m\n${generarBarra(radiacion)} ${radiacion}%\n${nivelRadiacion.descripcion}\n\`\`\``,
        inline: false
      },
      {
        name: '🍖 HAMBRE',
        value: `${generarBarra(hambre)} ${hambre}% — ${estadoHambre.estado}`,
        inline: true
      },
      {
        name: '💧 SED',
        value: `${generarBarra(sed)} ${sed}% — ${estadoSed.estado}`,
        inline: true
      },
      {
        name: '\u200b',
        value: '\u200b',
        inline: false
      },
      {
        name: '📊 ESTADÍSTICAS DEL SUJETO',
        value: `\`\`\`ansi\n` +
          `💪 Fuerza      : ${stats.fuerza.toString().padStart(3)} [${getCategoriaStats(stats.fuerza)}]\n` +
          `🎯 Destreza    : ${stats.destreza.toString().padStart(3)} [${getCategoriaStats(stats.destreza)}]\n` +
          `👁️ Percepción  : ${stats.percepcion.toString().padStart(3)} [${getCategoriaStats(stats.percepcion)}]\n` +
          `🧠 Ingenio     : ${stats.ingenio.toString().padStart(3)} [${getCategoriaStats(stats.ingenio)}]\n` +
          `🛡️ Temple      : ${stats.temple.toString().padStart(3)} [${getCategoriaStats(stats.temple)}]\n\`\`\``,
        inline: false
      }
    )
    .setFooter({ text: `SYNC_ID: ${profile.systemID} | MEDICAL SCANNER v2.1` });
}

// ===========================================================================
// Controlador principal de interfaz gráfica (Botones y Formularios)
// ===========================================================================

module.exports = async function handleStatusButtons(interaction) {
  const userId = interaction.user.id;
  const member = interaction.member;
  const customId = interaction.customId;

  const ownerId  = getOwnerIdFromEmbed(interaction.message);
  const editorId = getEditorIdFromEmbed(interaction.message);
  const targetId = ownerId || userId;
  const profile  = getProfile(targetId);

  if (!profile) {
    return interaction.reply({ content: '❌ **[N-OS]**: Perfil no encontrado.', flags: 64 });
  }

  if (ownerId && userId !== ownerId && userId !== editorId) {
    const isStaff = perfilCmd.helpers.isStaff(userId, member);
    const msg = isStaff
      ? `❌ **[N-OS]**: ACCESO_DENEGADO. Como staff, debes usar \`/perfil <usuario>\` para abrir tu propia terminal.`
      : `❌ **[N-OS]**: ACCESO_DENEGADO. No puedes manipular una terminal ajena.`;

    return interaction.reply({ content: msg, flags: 64 });
  }

  if (customId === 'estado_open') {
    const embed = generarEstadoEmbed(profile, targetId);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('estado_edit_stats').setLabel('EDITAR ESTADÍSTICAS').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('perfil_back').setLabel('VOLVER').setStyle(ButtonStyle.Secondary)
    );

    return interaction.update({ embeds: [embed], components: [row] });
  }

  if (customId === 'estado_edit_stats') {
    const stats = profile.status?.stats || { fuerza: 1, destreza: 1, percepcion: 1, ingenio: 1, temple: 1 };

    const modal = new ModalBuilder()
      .setCustomId('estado_modal_edit_stats')
      .setTitle('NIMBUS-OS // EDITOR DE ESTADÍSTICAS');

    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stat_fuerza').setLabel('💪 Fuerza (-2 a 10)').setStyle(TextInputStyle.Short).setValue(stats.fuerza.toString()).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stat_destreza').setLabel('🎯 Destreza (-2 a 10)').setStyle(TextInputStyle.Short).setValue(stats.destreza.toString()).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stat_percepcion').setLabel('👁️ Percepción (-2 a 10)').setStyle(TextInputStyle.Short).setValue(stats.percepcion.toString()).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stat_ingenio').setLabel('🧠 Ingenio (-2 a 10)').setStyle(TextInputStyle.Short).setValue(stats.ingenio.toString()).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stat_temple').setLabel('🛡️ Temple (-2 a 10)').setStyle(TextInputStyle.Short).setValue(stats.temple.toString()).setRequired(true))
    );

    return interaction.showModal(modal);
  }

  if (customId === 'estado_modal_edit_stats') {
    try {
      const fuerza = parseInt(interaction.fields.getTextInputValue('stat_fuerza'));
      const destreza = parseInt(interaction.fields.getTextInputValue('stat_destreza'));
      const percepcion = parseInt(interaction.fields.getTextInputValue('stat_percepcion'));
      const ingenio = parseInt(interaction.fields.getTextInputValue('stat_ingenio'));
      const temple = parseInt(interaction.fields.getTextInputValue('stat_temple'));

      const stats = { fuerza, destreza, percepcion, ingenio, temple };
      for (const [nombre, valor] of Object.entries(stats)) {
        if (isNaN(valor) || valor < -2 || valor > 10) {
          return interaction.reply({ content: `❌ **[N-OS]**: ERROR_VALOR_INVALIDO\n> La estadística "${nombre}" debe estar entre -2 y 10.`, flags: 64 });
        }
      }

      const newStatus = { ...profile.status, stats: stats };
      updateProfile(targetId, { status: newStatus });

      const updatedProfile = getProfile(targetId);
      const embed = generarEstadoEmbed(updatedProfile, targetId);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('estado_edit_stats').setLabel('EDITAR ESTADÍSTICAS').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('perfil_back').setLabel('VOLVER').setStyle(ButtonStyle.Secondary)
      );

      await interaction.update({ embeds: [embed], components: [row] });
      await interaction.followUp({ content: '✅ **[N-OS]**: Estadísticas actualizadas.', flags: 64 });

    } catch (error) {
      return interaction.reply({ content: '❌ **[N-OS]**: ERROR_PROCESAMIENTO.', flags: 64 });
    }
  }
};