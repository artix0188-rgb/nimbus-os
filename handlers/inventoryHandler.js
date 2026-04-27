const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const { getProfile, updateProfile } = require('../services/profileService');
const { 
  itemsMaster, 
  calcularMaxSlots, 
  calcularSlotsOcupados,
  equiparObjeto,
  desequiparObjeto
} = require('../services/inventoryService');

// ===========================================================================
// Diccionario de capacidades de cargadores por arma
// ===========================================================================
const MAG_SIZES = {
  "pistola_9mm": 15, "pistola_45": 7, "pistola_40": 13, "pistola_380": 8, "pistola_10mm": 10,
  "revolver_38": 6, "revolver_357": 6, "revolver_44": 6, "subfusil_compacto": 20,
  "escopeta_caza": 2, "escopeta_recortada": 2, "subfusil_estandar_9": 30, "subfusil_estandar_45": 25,
  "rifle_aire_mod": 1, "escopeta_imp_12": 1, "escopeta_imp_20": 1,
  "fusil_asalto_556": 30, "fusil_asalto_762": 30, "rifle_combate_762": 20, "rifle_combate_308": 20,
  "rifle_sniper_308": 5, "rifle_sniper_3006": 5, "arma_antigua": 5, "rifle_alto_calibre": 10
};

// ===========================================================================
// Renderizado visual: Menú de selección de consumibles
// ===========================================================================
async function renderUsarMenu(interaction, targetId, origin, notice = '') {
  const profile = getProfile(targetId);
  const baseId = `target_${targetId}_orig_${origin}`;

  const comida = [];
  const bebida = [];
  const medicina = [];

  profile.inventory.forEach(i => {
    const d = itemsMaster[i.itemId];
    if (!d) return;
    
    // Filtro corregido: Habilitamos la detección de cura de radiación en el menú
    if (!d.nutricion && !d.hidratacion && typeof d.heal !== 'number' && !d.radCure && d.type !== 'medicina') return;

    const opt = { label: `Usar: ${d.name} (x${i.cantidad})`, value: i.uid };
    let desc = [];
    
    if (d.nutricion > 0) desc.push(`+${d.nutricion} Hambre`);
    if (d.hidratacion > 0) desc.push(`+${d.hidratacion} Sed`);
    
    // Renderizado preciso del HP basado en el catálogo
    const hpCura = typeof d.heal === 'number' ? d.heal : (d.type === 'medicina' ? 30 : 0);
    if (hpCura > 0) desc.push(`+${hpCura} HP`);
    if (d.radCure > 0) desc.push(`-${d.radCure}% Rad`);
    
    opt.description = desc.join(' | ');

    if (d.nutricion > 0) comida.push(opt);
    else if (d.hidratacion > 0) bebida.push(opt);
    else if (typeof d.heal === 'number' || d.radCure > 0 || d.type === 'medicina') medicina.push(opt);
  });

  const components = [];
  
  if (comida.length > 0) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`inv_do_usar_comida_${baseId}`).setPlaceholder('🍖 Seleccionar Comida...').addOptions(comida.slice(0, 25))));
  if (bebida.length > 0) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`inv_do_usar_bebida_${baseId}`).setPlaceholder('💧 Seleccionar Bebida...').addOptions(bebida.slice(0, 25))));
  if (medicina.length > 0) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`inv_do_usar_medicina_${baseId}`).setPlaceholder('💉 Seleccionar Medicina...').addOptions(medicina.slice(0, 25))));

  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`inv_page_0_${baseId}`).setLabel('◀️ VOLVER A LA MOCHILA').setStyle(ButtonStyle.Secondary)
  ));

  let content = `🎒 **[N-OS // MÓDULO DE CONSUMIBLES]**\n> Selecciona el objeto que deseas utilizar de los desplegables. Puedes usar múltiples objetos antes de volver.`;
  if (notice) content = `✅ **${notice}**\n\n` + content;

  if (comida.length === 0 && bebida.length === 0 && medicina.length === 0) {
     content = `❌ No tienes consumibles (Comida, Bebida o Medicina) en tu mochila.`;
  }

  const payload = { content: content, embeds: [], components: components };

  if (interaction.isMessageComponent()) {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload).catch(() => null);
    } else {
      return interaction.update(payload).catch(() => null);
    }
  } else {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload).catch(() => null);
    } else {
      return interaction.reply(payload).catch(() => null);
    }
  }
}

// ===========================================================================
// Renderizado visual: Inventario principal e interfaz de equipo
// ===========================================================================
async function renderInventory(interaction, targetId, page = 0, notice = '', isEquipMode = false, origin = 'perfil') {
  const profile = getProfile(targetId);
  if (!profile) return;

  if (!profile.inventory) profile.inventory = [];
  if (!profile.equipment) profile.equipment = {};

  const maxSlots = calcularMaxSlots(targetId);
  const ocupados = calcularSlotsOcupados(targetId);
  const isSelf = interaction.user.id === targetId;
  const baseId = `target_${targetId}_orig_${origin}`;

  const embed = new EmbedBuilder()
    .setTitle(`📟 PDA // SUMINISTROS: ${profile.nombre.toUpperCase()}`)
    .setColor(0x1a1a1a)
    .setDescription(
      (notice ? `> ${notice}\n` : '') +
      '```ansi\n' +
      `\u001b[32mCARGA ACTUAL: [ ${ocupados} / ${maxSlots} ] SLOTS\u001b[0m\n` +
      '```'
    );

  const itemsPerPage = 10;
  const start = page * itemsPerPage;
  const items = profile.inventory.slice(start, start + itemsPerPage);

  if (items.length > 0) {
    let list = "";
    items.forEach((it, i) => {
      const data = itemsMaster[it.itemId];
      let ammoInfo = '';

      if (data && data.ammoType) {
        const balasDisponibles = profile.inventory
          .filter(invItem => invItem.itemId === data.ammoType)
          .reduce((total, actual) => total + actual.cantidad, 0);
        ammoInfo = balasDisponibles > 0 ? ` \`[Munición: ${balasDisponibles}]\`` : ` \`(Sin munición)\``;
      }
      list += `\`${start + i + 1}.\` **${data ? data.name : it.itemId}** x${it.cantidad} \`(${data?.slots || 1} slots)\`${ammoInfo}\n`;
    });
    embed.addFields({ name: '▼ CONTENIDO DE MOCHILA', value: list });
  } else {
    embed.addFields({ name: '▼ CONTENIDO DE MOCHILA', value: '*No hay suministros registrados en la terminal.*' });
  }

  const eq = profile.equipment;
  const getEqName = (slot) => {
    const item = eq[slot];
    if (!item) return '---';
    const data = itemsMaster[item.itemId];
    if (!data) return 'Objeto Desconocido';
    
    let displayName = data.name;

    if (data.ammoType && MAG_SIZES[item.itemId]) {
      const slotCorto = slot === 'arma_pri' ? 'pri' : 'sec';
      const maxMag = MAG_SIZES[item.itemId];
      const currentMag = profile.mags?.[slotCorto] !== undefined ? profile.mags[slotCorto] : 0;
      const balasDisponibles = profile.inventory.filter(i => i.itemId === data.ammoType).reduce((total, actual) => total + actual.cantidad, 0);
      
      displayName += ` \`[ 🔋 ${currentMag}/${maxMag} (${balasDisponibles}) ]\``;
    }
    return displayName;
  };

  const eqList = [
    `> **Cabeza:** ${getEqName('cabeza')}`,
    `> **Cara:** ${getEqName('cara')}`,
    `> **Torso:** ${getEqName('torso')}`,
    `> **Brazos:** ${getEqName('brazos')}`,
    `> **Piernas:** ${getEqName('piernas')}`,
    `> **Pies:** ${getEqName('pies')}`,
    `> **Arma Principal:** ${getEqName('arma_pri')}`,
    `> **Arma Secundaria:** ${getEqName('arma_sec')}`,
    `> **Mochila:** ${getEqName('mochila')}`
  ].join('\n');
  embed.addFields({ name: '▼ EQUIPAMIENTO', value: eqList });

  const rows = [];

  if (isEquipMode && isSelf) {
    const equipOptions = items.filter(it => {
      const d = itemsMaster[it.itemId];
      const tiposEquipables = ['cabeza', 'cara', 'torso', 'brazos', 'piernas', 'pies', 'mochila', 'arma_1h', 'arma_2h_ligera', 'arma_2h_pesada', 'arma_blanca', 'arma_contundente'];
      return d && tiposEquipables.includes(d.type);
    }).map(it => ({ label: `Equipar: ${itemsMaster[it.itemId].name}`, description: `UID: ${it.uid.substring(0, 8)}`, value: it.uid }));

    if (equipOptions.length > 0) {
      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`inv_equip_${baseId}`).setPlaceholder('Seleccionar objeto para equipar...').addOptions(equipOptions)));
    }

    const eqKeys = Object.keys(eq).filter(k => eq[k] !== undefined);
    if (eqKeys.length > 0) {
      const unequipOptions = eqKeys.map(k => ({ label: `Quitar: ${itemsMaster[eq[k].itemId] ? itemsMaster[eq[k].itemId].name : 'Objeto desconocido'}`, description: `Ranura: ${k.toUpperCase()}`, value: k }));
      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`inv_unequip_${baseId}`).setPlaceholder('Seleccionar para desequipar...').addOptions(unequipOptions)));
    }

    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`inv_page_0_${baseId}`).setLabel('◀️ VOLVER A LA MOCHILA').setStyle(ButtonStyle.Secondary)));

  } else {
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`inv_page_${page - 1}_${baseId}`).setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`inv_page_${page + 1}_${baseId}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(start + itemsPerPage >= (profile.inventory?.length || 0))
    );

    if (isSelf) {
      navRow.addComponents(new ButtonBuilder().setCustomId(`inv_btn_equip_${baseId}`).setLabel('EQUIPAR / DESEQUIPAR').setStyle(ButtonStyle.Primary));
    }

    if (origin === 'inv') {
      navRow.addComponents(new ButtonBuilder().setCustomId(`inv_close_${baseId}`).setLabel('CERRAR').setStyle(ButtonStyle.Danger));
    } else {
      navRow.addComponents(new ButtonBuilder().setCustomId(`perfil_back_target_${targetId}`).setLabel('VOLVER A FICHA').setStyle(ButtonStyle.Secondary));
    }

    rows.push(navRow);

    if (isSelf) {
      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`inv_btn_usar_${baseId}`).setLabel('USAR OBJETO').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`inv_btn_recargar_${baseId}`).setLabel('RECARGAR ARMAS').setStyle(ButtonStyle.Primary)
      );
      rows.push(actionRow);
    }
  }

  const payload = { content: '', embeds: [embed], components: rows };

  if (interaction.isMessageComponent()) {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload).catch(() => null);
    } else {
      return interaction.update(payload).catch(() => null);
    }
  } else {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload).catch(() => null);
    } else {
      return interaction.reply(payload).catch(() => null);
    }
  }
}

// ===========================================================================
// Controlador principal de interacciones de inventario
// ===========================================================================
module.exports = async function handleInventory(interaction, manualTargetId = null, manualOrigin = null) {
  const userId = interaction.user.id;
  const customId = interaction.customId || '';
  
  let origin = manualOrigin;
  if (!origin) origin = customId.includes('_orig_') ? customId.split('_orig_')[1] : 'perfil';

  let targetId = manualTargetId;
  if (customId.includes('_target_')) targetId = customId.split('_target_')[1].split('_orig_')[0];
  if (!targetId) targetId = userId;

  const profile = getProfile(targetId);
  if (!profile) return;

  if (customId.startsWith('inv_close_')) return interaction.message.delete().catch(() => null);

  // 1. Selección de ranura para armas
  if (customId.startsWith('inv_set_weapon_')) {
    await interaction.update({ content: `⏱️ Procesando equipamiento...`, components: [] }).catch(() => null);
    
    const parts = customId.split('_');
    const slot = parts[3]; 
    const itemUid = parts[4];
    const slotKey = (slot === 'pri') ? 'arma_pri' : 'arma_sec';
    
    const item = profile.inventory?.find(i => i.uid === itemUid);
    if (!item) return interaction.editReply({ content: '❌ Objeto no encontrado.' }).catch(() => null);

    const data = itemsMaster[item.itemId];
    const res = equiparObjeto(targetId, itemUid, slotKey);

    if (!res.success) return interaction.editReply({ content: `❌ **[N-OS]**: ${res.msg}` }).catch(() => null);
    
    if (!profile.mags) profile.mags = {};
    profile.mags[slotKey === 'arma_pri' ? 'pri' : 'sec'] = 0;
    updateProfile(targetId, { mags: profile.mags });

    await interaction.channel.send({ content: `⚔️ **${profile.nombre}** ha desenfundado y equipado su **${data.name}**.` });
    return interaction.editReply({ content: `✅ **[N-OS]**: ${res.msg} (Refresca o navega en tu PDA para ver los cambios)` }).catch(() => null);
  }

  // 2. Equipamiento: Paginación y botones
  if (customId.startsWith('inv_btn_equip_')) {
    if (userId !== targetId) return interaction.reply({ content: '❌ No puedes manipular el equipo de otro usuario.', flags: 64 });
    await interaction.deferUpdate().catch(() => null); 
    return await renderInventory(interaction, targetId, 0, '', true, origin);
  }

  if (customId.startsWith('inv_equip_')) {
    if (userId !== targetId) return;

    const itemUid = interaction.values[0];
    const item = profile.inventory?.find(i => i.uid === itemUid);
    if (!item) return;

    const data = itemsMaster[item.itemId];
    if (data?.type?.includes('arma') && !data?.type?.includes('utilidad')) {
      const weaponRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`inv_set_weapon_pri_${itemUid}_target_${targetId}_orig_${origin}`).setLabel('COLOCAR COMO PRINCIPAL').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`inv_set_weapon_sec_${itemUid}_target_${targetId}_orig_${origin}`).setLabel('COLOCAR COMO SECUNDARIA').setStyle(ButtonStyle.Secondary)
        );
      return interaction.reply({ content: `📟 **[N-OS]**: ¿En qué posición deseas portar tu **${data.name}**, **${profile.nombre}**?`, components: [weaponRow], flags: 64 }).catch(() => null);
    }

    await interaction.deferUpdate().catch(() => null);
    const res = equiparObjeto(targetId, itemUid);
    if (!res.success) return interaction.followUp({ content: `❌ **[N-OS]**: ${res.msg}`, flags: 64 }).catch(() => null);
    
    await interaction.channel.send({ content: `🛡️ **${profile.nombre}** se ha equipado: **${data?.name || 'un objeto'}**.` });
    return await renderInventory(interaction, targetId, 0, res.msg, true, origin);
  }

  if (customId.startsWith('inv_unequip_')) {
    if (userId !== targetId) return;
    await interaction.deferUpdate().catch(() => null);

    const slotToUnequip = interaction.values[0];
    const itemEquipped = profile.equipment[slotToUnequip];
    let itemName = 'un objeto';
    if (itemEquipped) {
      const itemData = itemsMaster[itemEquipped.itemId];
      if (itemData) itemName = itemData.name;
    }

    const res = desequiparObjeto(targetId, slotToUnequip);
    if (!res.success) return interaction.followUp({ content: `⚠️ **[N-OS]**: ${res.msg}`, flags: 64 }).catch(() => null);
    
    await interaction.channel.send({ content: `🎒 **${profile.nombre}** se ha desequipado y guardado: **${itemName}**.` });
    return await renderInventory(interaction, targetId, 0, res.msg, true, origin);
  }

  // =======================================================================
  // Consumo y aplicación de objetos (CORREGIDO PARA RADAWAY Y HP DINÁMICO)
  // =======================================================================
  if (customId.startsWith('inv_btn_usar_')) {
    if (userId !== targetId) return interaction.reply({ content: '❌ Terminal ajena.', flags: 64 });
    await interaction.deferUpdate().catch(() => null);
    return await renderUsarMenu(interaction, targetId, origin);
  }

  if (customId.startsWith('inv_do_usar_')) {
    if (userId !== targetId) return;
    await interaction.deferUpdate().catch(() => null);

    const itemUid = interaction.values[0];
    const itemIdx = profile.inventory.findIndex(i => i.uid === itemUid);
    if (itemIdx === -1) return interaction.followUp({ content: '❌ Objeto no encontrado en la mochila.', flags: 64 });

    const item = profile.inventory[itemIdx];
    const data = itemsMaster[item.itemId];

    if (!profile.status) profile.status = { hambre: 100, sed: 100, hp: 100, radiacion: 0 };
    let replyMsg = [];

    // 1. Nutrición y Sed
    if (data.nutricion) {
      profile.status.hambre = Math.min(100, (profile.status.hambre || 0) + data.nutricion);
      replyMsg.push(`Hambre: [${Math.floor(profile.status.hambre)}%]`);
    }
    if (data.hidratacion) {
      profile.status.sed = Math.min(100, (profile.status.sed || 0) + data.hidratacion);
      replyMsg.push(`Sed: [${Math.floor(profile.status.sed)}%]`);
    }
    
    // 2. Lógica Médica Corregida: Radiación antes de Salud
    const radCure = data.radCure || 0;
    if (radCure > 0) {
      profile.status.radiacion = Math.max(0, (profile.status.radiacion || 0) - radCure);
      replyMsg.push(`Rad: -${radCure}%`);
    }

    // 3. Curación de HP respetando el tope dinámico (MaxHP - Rad)
    const hpCurado = typeof data.heal === 'number' ? data.heal : (data.type === 'medicina' ? 30 : 0);

    if (hpCurado > 0) {
      const topeVidaReal = Math.max(1, (profile.status.maxHp || 100) - (profile.status.radiacion || 0));
      profile.status.hp = Math.min((profile.status.hp || 0) + hpCurado, topeVidaReal);
      replyMsg.push(`HP: [${Math.floor(profile.status.hp)}%]`);
    }

    // 4. Limpieza de estados alterados
    if (data.cures && Array.isArray(data.cures)) {
      if (!profile.status.estados) profile.status.estados = {};
      data.cures.forEach(c => {
        if (profile.status.estados[c]) {
          profile.status.estados[c] = false;
          replyMsg.push(`Curado: ${c.toUpperCase()}`);
        }
      });
    }

    item.cantidad -= 1;
    if (item.cantidad <= 0) profile.inventory.splice(itemIdx, 1);

    updateProfile(targetId, { status: profile.status, inventory: profile.inventory });

    let accionVerbo = "usa";
    let emoji = "🎒";
    if (data.hidratacion && !data.nutricion) { accionVerbo = "bebe un poco de"; emoji = "💧"; }
    else if (data.nutricion) { accionVerbo = "consume"; emoji = "🍖"; }
    else if (hpCurado > 0 || radCure > 0 || data.type === 'medicina') { accionVerbo = "se aplica"; emoji = "💉"; }

    await renderUsarMenu(interaction, targetId, origin);
    await interaction.channel.send({ content: `${emoji} **${profile.nombre}** ${accionVerbo} **${data.name}**.` });

    return interaction.followUp({ content: `✅ **Lectura PDA**:  ${replyMsg.join(' | ')}`, flags: 64 });
  }

  // =======================================================================
  // Recarga balística de armas
  // =======================================================================
  if (customId.startsWith('inv_btn_recargar_')) {
    if (userId !== targetId) return interaction.reply({ content: '❌ Terminal ajena.', flags: 64 });
    await interaction.deferUpdate().catch(() => null);

    const armas = [
      { slot: 'pri', data: profile.equipment?.arma_pri },
      { slot: 'sec', data: profile.equipment?.arma_sec }
    ];

    let logRecargas = [];
    let cambios = false;

    if (!profile.mags) profile.mags = {};

    for (const arma of armas) {
      if (arma.data) {
        const itemId = arma.data.itemId;
        const baseData = itemsMaster[itemId];
        const maxMag = MAG_SIZES[itemId];

        if (baseData && maxMag) {
          const currentMag = profile.mags[arma.slot] || 0;
          const balasNecesarias = maxMag - currentMag;

          if (balasNecesarias > 0) {
            const ammoType = baseData.ammoType;
            let balasDisponibles = profile.inventory
              .filter(i => itemsMaster[i.itemId]?.ammoType === ammoType || i.itemId === ammoType)
              .reduce((a, b) => a + b.cantidad, 0);

            if (balasDisponibles > 0) {
              const recargaEfectiva = Math.min(balasNecesarias, balasDisponibles);
              
              let restante = recargaEfectiva;
              for (let i = 0; i < profile.inventory.length; i++) {
                if (restante <= 0) break;
                const invItem = profile.inventory[i];
                if (itemsMaster[invItem.itemId]?.ammoType === ammoType || invItem.itemId === ammoType) {
                  if (invItem.cantidad >= restante) {
                    invItem.cantidad -= restante;
                    restante = 0;
                  } else {
                    restante -= invItem.cantidad;
                    invItem.cantidad = 0;
                  }
                }
              }
              profile.inventory = profile.inventory.filter(i => i.cantidad > 0);
              profile.mags[arma.slot] += recargaEfectiva;
              cambios = true;
              
              if (recargaEfectiva === balasNecesarias) {
                logRecargas.push(`✅ **${baseData.name}**: Recarga completa (${profile.mags[arma.slot]}/${maxMag}). Te quedan ${balasDisponibles - recargaEfectiva} en mochila.`);
              } else {
                logRecargas.push(`⚠️ **${baseData.name}**: Recarga INCOMPLETA (${profile.mags[arma.slot]}/${maxMag}). ¡No te quedan más balas!`);
              }
            } else {
               logRecargas.push(`❌ **${baseData.name}**: Sin munición compatible en la mochila.`);
            }
          } else {
            logRecargas.push(`🔋 **${baseData.name}**: Cargador ya estaba al máximo.`);
          }
        }
      }
    }

    if (!cambios && logRecargas.length === 0) {
      return interaction.followUp({ content: '❌ No tienes armas de fuego equipadas que necesiten recarga.', flags: 64 });
    }

    if (cambios) {
      updateProfile(targetId, { inventory: profile.inventory, mags: profile.mags });
    }

    await renderInventory(interaction, targetId, 0, '', false, origin);

    await interaction.followUp({ 
      content: `📟 **[N-OS // REPORTE DE RECARGA]**\n\n${logRecargas.join('\n')}`, 
      flags: 64 
    });

    if (cambios) {
      await interaction.channel.send({ content: `🔄 **${profile.nombre}** revisa su equipo y recarga sus armas.` });
    }
    
    return;
  }

  // Paginación base del inventario
  if (customId.startsWith('inv_page_')) {
    const page = parseInt(customId.split('_')[2]);
    await interaction.deferUpdate().catch(() => null);
    return await renderInventory(interaction, targetId, page, '', false, origin);
  }

  // Despliegue primario
  return await renderInventory(interaction, targetId, 0, '', false, origin);
};