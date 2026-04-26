const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { getProfile, updateProfile } = require('../services/profileService');
const { itemsMaster, calcularMaxSlots, calcularSlotsOcupados } = require('../services/inventoryService');
const { dropItem } = require('../services/floorService');

// ===========================================================================
// 📡 SISTEMA DE RASTREO DE CUERPOS (RADAR)
// ===========================================================================
const activeBodies = new Map();

function registerBody(targetId, name, type, channelId) {
  activeBodies.set(targetId, { name, type, channelId, timestamp: Date.now() });
}

function removeBody(targetId) {
  activeBodies.delete(targetId);
}

function getBodiesInChannel(channelId) {
  const bodies = [];
  for (const [id, body] of activeBodies.entries()) {
    if (body.channelId === channelId) {
      // Verificación: Si estaba inconsciente, miramos si ya se curó
      if (body.type === 'unconscious') {
        const prof = getProfile(id);
        if (!prof || (prof.status && prof.status.hp > 0)) {
          activeBodies.delete(id); // Despertó, lo borramos del radar
          continue;
        }
      }
      bodies.push({ id, ...body });
    }
  }
  return bodies;
}

// ⏳ CRONÓMETRO DE DESCOMPOSICIÓN (1 HORA MÁXIMO)
setInterval(() => {
  const now = Date.now();
  for (const [id, body] of activeBodies.entries()) {
    if (body.type === 'corpse' && now - body.timestamp > 3600000) { // 1 hora
      activeBodies.delete(id);
      try {
        const { deleteProfile } = require('../services/profileService');
        deleteProfile(id); 
      } catch (e) {}
    }
  }
}, 60000); 

// ===========================================================================
// 🎒 RENDERIZADO DEL MENÚ PÚBLICO
// ===========================================================================
async function renderPublicLoot(interaction, targetId, existingMessage = null, manualChannel = null) {
  const profile = getProfile(targetId);
  if (!profile) return;

  const itemsMochila = profile.inventory || [];
  const equipo = profile.equipment || {};

  const optionsArmas = [];
  const optionsEquipo = [];
  const optionsObjetos = [];

  const addOption = (list, label, desc, value) => {
    if (list.length < 25) { 
      list.push({ label: label.substring(0, 100), description: desc.substring(0, 100), value });
    }
  };

  Object.keys(equipo).forEach(slot => {
    const eqItem = equipo[slot];
    if (!eqItem) return;
    const data = itemsMaster[eqItem.itemId];
    if (!data) return;

    const valueStr = `eq_${slot}`;
    const prefix = '[EQUIPADO]';

    if (data.type.includes('arma')) {
      addOption(optionsArmas, `${prefix} ${data.name}`, `Ranura: ${slot.toUpperCase()}`, valueStr);
    } else if (data.type === 'mochila') {
      const isLocked = itemsMochila.length > 0;
      const lockMsg = isLocked ? ' 🔒 (BLOQUEADA: Vacía el contenido primero)' : '';
      addOption(optionsEquipo, `${prefix} ${data.name}`, `Mochila${lockMsg}`, valueStr);
    } else {
      addOption(optionsEquipo, `${prefix} ${data.name}`, `Protección: ${slot.toUpperCase()}`, valueStr);
    }
  });

  itemsMochila.forEach(it => {
    const data = itemsMaster[it.itemId];
    if (!data) return;

    const valueStr = `inv_${it.uid}`;
    const prefix = '[MOCHILA]';
    const desc = `x${it.cantidad} | Peso: ${data.slots || 1} slots c/u`;

    if (data.type.includes('arma')) addOption(optionsArmas, `${prefix} ${data.name}`, desc, valueStr);
    else if (['cabeza', 'cara', 'torso', 'brazos', 'piernas', 'pies'].includes(data.type)) addOption(optionsEquipo, `${prefix} ${data.name}`, desc, valueStr);
    else addOption(optionsObjetos, `${prefix} ${data.name}`, desc, valueStr);
  });

  const components = [];

  if (optionsObjetos.length > 0) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`loot_sel_obj_${targetId}`).setPlaceholder('📦 Sustraer Objetos Varios...').addOptions(optionsObjetos)));
  if (optionsArmas.length > 0) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`loot_sel_wep_${targetId}`).setPlaceholder('🔫 Sustraer Armas...').addOptions(optionsArmas)));
  if (optionsEquipo.length > 0) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`loot_sel_eq_${targetId}`).setPlaceholder('🛡️ Sustraer Equipamiento...').addOptions(optionsEquipo)));

  const estadoTxt = profile.isDead ? 'Cadáver (Fallecido)' : 'Sujeto Inconsciente';
  const embed = new EmbedBuilder()
    .setTitle(`🎒 REGISTRO DE CUERPO: ${profile.nombre.toUpperCase()}`)
    .setColor(0x3a3a3a)
    .setDescription(
      components.length > 0 
      ? `> **Estado:** ${estadoTxt}\n> Utiliza los menús para revisar y apropiarte de sus pertenencias.` 
      : `> 🦴 El cuerpo ha sido despojado de todo valor material.`
    );

  const payload = { content: '', embeds: [embed], components: components };

  if (existingMessage) {
    await existingMessage.edit(payload).catch(() => null);
  } else if (interaction && !interaction.replied && !interaction.deferred) {
    await interaction.reply(payload);
  } else if (interaction && (interaction.replied || interaction.deferred)) {
    await interaction.followUp(payload);
  } else if (manualChannel) {
    await manualChannel.send(payload);
  }
}

// ===========================================================================
// 🛠️ HANDLER PRINCIPAL DE INTERACCIONES
// ===========================================================================
async function handleLootInteraction(interaction) {
  const parts = interaction.customId.split('_');
  const action = parts[1]; 
  
  // ── 0. SELECCIÓN DE CUERPO (CUANDO HAY MÚLTIPLES CAÍDOS) ──
  if (action === 'selbody') {
    const selectedId = interaction.values[0];
    await interaction.update({ content: `📟 Procesando apertura táctica del cuerpo...`, components: [] });
    return await renderPublicLoot(null, selectedId, null, interaction.channel);
  }

  // ── 1. SELECCIÓN DE OBJETO (LANZA BURBUJA EFÍMERA) ──
  if (action === 'sel') {
    const targetId = parts[3];
    const itemRef = interaction.values[0];
    
    const targetProfile = getProfile(targetId);
    if (!targetProfile) return interaction.reply({ content: "El cuerpo ya no existe o se ha descompuesto.", flags: 64 });

    if (itemRef === 'eq_mochila' && targetProfile.inventory?.length > 0) {
      return interaction.reply({ 
        content: `❌ **[N-OS]**: La mochila aún contiene objetos. Tienes que vaciarla primero antes de poder llevártela.`, 
        flags: 64 
      });
    }

    let itemName = "Objeto desconocido";
    let cantidad = 1;

    if (itemRef.startsWith('eq_')) {
      const slot = itemRef.split('_')[1];
      const eqItem = targetProfile.equipment?.[slot];
      if (!eqItem) return interaction.reply({ content: "El objeto ya fue saqueado por alguien más.", flags: 64 });
      itemName = itemsMaster[eqItem.itemId]?.name || "Desconocido";
    } else {
      const uid = itemRef.split('_')[1];
      const invItem = targetProfile.inventory?.find(i => i.uid === uid);
      if (!invItem) return interaction.reply({ content: "El objeto ya fue saqueado por alguien más.", flags: 64 });
      itemName = itemsMaster[invItem.itemId]?.name || "Desconocido";
      cantidad = invItem.cantidad;
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`loot_act_take_${targetId}_${itemRef}`).setLabel('🎒 GUARDAR').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`loot_act_drop_${targetId}_${itemRef}`).setLabel('🗑️ TIRAR AL SUELO').setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({ 
      content: `Sostienes **${itemName}** (x${cantidad}). ¿Qué deseas hacer con ello?`, 
      components: [row], 
      flags: 64 
    });
  }

  // ── 2. ACCIÓN: GUARDAR O TIRAR ──
  if (action === 'act') {
    const subAction = parts[2]; 
    const targetId = parts[3];
    const itemRef = parts.slice(4).join('_'); 
    
    const looterId = interaction.user.id;
    const targetProfile = getProfile(targetId);
    const looterProfile = getProfile(looterId);

    if (!targetProfile || !looterProfile) return interaction.update({ content: "Error: Perfiles no encontrados.", components: [] });

    let itemToMove = null;
    let slotEquipado = null;
    let indexInventario = -1;

    if (itemRef.startsWith('eq_')) {
      slotEquipado = itemRef.split('_')[1];
      itemToMove = targetProfile.equipment?.[slotEquipado];
    } else {
      const uid = itemRef.split('_')[1];
      indexInventario = targetProfile.inventory?.findIndex(i => i.uid === uid);
      if (indexInventario !== -1) itemToMove = targetProfile.inventory[indexInventario];
    }

    if (!itemToMove) return interaction.update({ content: `❌ Objeto no encontrado. Es posible que otro jugador lo haya tomado antes.`, components: [] });

    const itemData = itemsMaster[itemToMove.itemId];
    const pesoTotal = (itemData?.slots || 1) * (itemToMove.cantidad || 1);

    if (subAction === 'take') {
      const maxSlots = calcularMaxSlots(looterId);
      const ocupados = calcularSlotsOcupados(looterId);

      if (ocupados + pesoTotal > maxSlots) {
        return interaction.update({ 
          content: `❌ **[N-OS]**: No tienes espacio en tu mochila. (Requiere ${pesoTotal} slots).`, 
          components: [] 
        });
      }

      if (!looterProfile.inventory) looterProfile.inventory = [];
      const looterExistingItem = looterProfile.inventory.find(i => i.itemId === itemToMove.itemId);
      if (looterExistingItem && (itemData.stack || 1) > 1) {
        looterExistingItem.cantidad += (itemToMove.cantidad || 1);
      } else {
        looterProfile.inventory.push({ ...itemToMove });
      }

      if (slotEquipado) delete targetProfile.equipment[slotEquipado];
      if (indexInventario !== -1) targetProfile.inventory.splice(indexInventario, 1);

      updateProfile(looterId, { inventory: looterProfile.inventory });
      updateProfile(targetId, { equipment: targetProfile.equipment, inventory: targetProfile.inventory });

      await interaction.update({ content: `✅ Guardaste **${itemData.name}** en tu mochila.`, components: [] });
      await interaction.channel.send(`> 🎒 **${looterProfile.nombre}** tomó **${itemData.name}** del cuerpo.`);
    }

    if (subAction === 'drop') {
      if (slotEquipado) delete targetProfile.equipment[slotEquipado];
      if (indexInventario !== -1) targetProfile.inventory.splice(indexInventario, 1);

      updateProfile(targetId, { equipment: targetProfile.equipment, inventory: targetProfile.inventory });

      dropItem(interaction.channelId, { ...itemToMove });

      await interaction.update({ content: `🗑️ Tiraste **${itemData.name}** al suelo. (Aparecerá al \`/rebuscar\`)`, components: [] });
      await interaction.channel.send(`> 🗑️ **${looterProfile.nombre}** arrojó **${itemData.name}** al suelo.`);
    }

    try {
      const msgs = await interaction.channel.messages.fetch({ limit: 10 });
      const publicLootMsg = msgs.find(m => m.author.id === interaction.client.user.id && m.embeds[0]?.title?.includes(`REGISTRO DE CUERPO: ${targetProfile.nombre.toUpperCase()}`));
      
      if (publicLootMsg) {
        await renderPublicLoot(null, targetId, publicLootMsg);
      }
    } catch (e) {}
  }
}

// Fíjate en cómo aquí exportamos las funciones del radar que faltaban
module.exports = {
  iniciarSaqueo: async (interaction, targetId, manualChannel) => {
    await renderPublicLoot(interaction, targetId, null, manualChannel);
  },
  handleLootInteraction,
  registerBody,
  removeBody,
  getBodiesInChannel
};