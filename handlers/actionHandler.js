const { 
  ActionRowBuilder,
  EmbedBuilder
} = require('discord.js');

const { getProfile, updateProfile } = require('../services/profileService');
const { 
  itemsMaster, 
  calcularMaxSlots, 
  calcularSlotsOcupados 
} = require('../services/inventoryService');
const { floorDrops, dropItem } = require('../services/floorService');
const perfilCmd = require('../commands/perfil');

// ---------------------------------------------------------------------------
// HELPERS DE LIMPIEZA
// ---------------------------------------------------------------------------

async function borrarMensajesSeguros(mensajes) {
  await Promise.allSettled(
    mensajes.map(msg =>
      msg.deletable
        ? msg.delete().catch(() => null)
        : Promise.resolve()
    )
  );
}

// ---------------------------------------------------------------------------
// HANDLER PRINCIPAL
// ---------------------------------------------------------------------------

module.exports = async function handleAction(interaction) {
  const userId = interaction.user.id;
  const customId = interaction.customId;
  const profile = getProfile(userId);

  // 🛡️ SEGURIDAD: Inicializar estructuras si no existen
  if (!profile.inventory) profile.inventory = [];
  if (!profile.equipment) profile.equipment = {};
  if (!profile.status.estados) profile.status.estados = { sangrado: false, toxicidad: false };

  // 🛡️ CONTROL DE CATEGORÍA: Solo funciona en canales de RP
  if (interaction.channel.parentId !== process.env.RP_CATEGORY_ID) {
    return interaction.reply({ 
      content: '❌ **[N-OS]**: Error de sector. Estas acciones físicas solo están permitidas en zonas de despliegue (RP).', 
      flags: 64 
    });
  }

  // ===========================================================================
  // 1. TIRAR OBJETO (Escucha en Chat)
  // ===========================================================================
  if (customId === 'floor_drop_select') {
    const itemUid = interaction.values[0];
    const item = profile.inventory.find(i => i.uid === itemUid);

    if (!item) {
      return interaction.reply({ content: '❌ **[N-OS]**: Objeto no localizado.', flags: 64 });
    }

    const itemData = itemsMaster[item.itemId];

    // Pregunta Efímera
    await interaction.reply({ 
      content: `📟 **[N-OS // PROTOCOLO DE DESCARTE]**\n> Objeto seleccionado: **${itemData.name}**\n> Tienes **${item.cantidad}** unidades.\n> 💬 Escribe en el chat la **cantidad** que deseas soltar (Tienes 30 segundos):`, 
      flags: 64 
    });

    try {
      const collected = await interaction.channel.awaitMessages({ filter: m => m.author.id === userId, max: 1, time: 30000, errors: ['time'] });
      const msg = collected.first();
      const amount = parseInt(msg.content.trim());

      // Borramos el mensaje del usuario para limpiar el chat
      if (msg.deletable) await msg.delete().catch(() => null);

      if (isNaN(amount) || amount <= 0 || amount > item.cantidad) {
        return interaction.followUp({ content: '❌ **[N-OS]**: Cantidad no válida o insuficiente. Operación abortada.', flags: 64 });
      }

      const invIdx = profile.inventory.findIndex(i => i.uid === itemUid);
      if (invIdx === -1) return interaction.followUp({ content: '❌ **[N-OS]**: Error interno. Objeto perdido.', flags: 64 });

      // Registrar en el suelo
      dropItem(interaction.channelId, {
        uid: item.uid,
        itemId: item.itemId,
        cantidad: amount
      });

      profile.inventory[invIdx].cantidad -= amount;
      if (profile.inventory[invIdx].cantidad <= 0) profile.inventory.splice(invIdx, 1);
      updateProfile(userId, { inventory: profile.inventory });

      await interaction.channel.send({
        content: `📦 **${profile.nombre}** ha dejado **${itemData.name}** x${amount} en el suelo.`
      });

      await perfilCmd.helpers.sendToLogChannel(interaction, 'SUMINISTRO_DESCARTADO', [
        `**SUJETO :** ${profile.nombre} (<@${userId}>)`,
        `**OBJETO :** ${itemData.name} x${amount}`,
        `**SECTOR :** <#${interaction.channelId}>`,
        `**ESTADO :** El objeto desaparecerá en 20 minutos.`
      ]);

      if (interaction.message?.deletable) await interaction.message.delete().catch(() => null);
      return interaction.followUp({ content: `✅ Has dejado **${itemData.name}** x${amount} en el suelo.`, flags: 64 });

    } catch (error) {
      return interaction.followUp({ content: `⏳ **[N-OS]**: Tiempo agotado. Protocolo cancelado.`, flags: 64 });
    }
  }

  // ===========================================================================
  // 2. RECOGER DEL SUELO (Lógica Inteligente con Escucha en Chat)
  // ===========================================================================
  if (customId === 'floor_pick_select') {
    const dropId = interaction.values[0];
    const drops = floorDrops.get(interaction.channelId) || [];
    const dropIdx = drops.findIndex(d => d.dropId === dropId);

    if (dropIdx === -1) return interaction.reply({ content: '❌ El suministro ya no se encuentra en el sector.', flags: 64 });

    const drop = drops[dropIdx];
    const itemData = itemsMaster[drop.itemData.itemId];

    // ── CASO A: CANTIDAD MAYOR A 1 (Preguntar en Chat) ──
    if (drop.itemData.cantidad > 1) {
      await interaction.reply({ 
        content: `📟 **[N-OS // PROTOCOLO DE RECOGIDA]**\n> Objeto detectado: **${itemData.name}**\n> Disponible en el suelo: **${drop.itemData.cantidad}** | Stack máximo: **${itemData?.stack || 1}**\n> 💬 Escribe en el chat la **cantidad** que deseas recoger (Tienes 30 segundos):`, 
        flags: 64 
      });

      try {
        const collected = await interaction.channel.awaitMessages({ filter: m => m.author.id === userId, max: 1, time: 30000, errors: ['time'] });
        const msg = collected.first();
        const amount = parseInt(msg.content.trim());

        if (msg.deletable) await msg.delete().catch(() => null);

        // Re-verificar si el objeto sigue ahí después de los segundos que tardó en escribir
        const currentDrops = floorDrops.get(interaction.channelId) || [];
        const currentDropIdx = currentDrops.findIndex(d => d.dropId === dropId);
        if (currentDropIdx === -1) return interaction.followUp({ content: '❌ **[N-OS]**: Alguien recogió el objeto mientras respondías.', flags: 64 });
        
        const currentDrop = currentDrops[currentDropIdx];

        if (isNaN(amount) || amount <= 0 || amount > currentDrop.itemData.cantidad) {
          return interaction.followUp({ content: '❌ **[N-OS]**: Cantidad no válida. Operación abortada.', flags: 64 });
        }

        const slotsRequeridos = Math.ceil(amount / (itemData?.stack || 1)) * (itemData?.slots || 1);
        if (calcularSlotsOcupados(userId) + slotsRequeridos > calcularMaxSlots(userId)) {
          return interaction.followUp({ content: `❌ **[N-OS]**: Demasiado pesado (${slotsRequeridos} slots). No tienes espacio.`, flags: 64 });
        }

        profile.inventory.push({ ...currentDrop.itemData, cantidad: amount });
        
        currentDrop.itemData.cantidad -= amount;
        if (currentDrop.itemData.cantidad <= 0) currentDrops.splice(currentDropIdx, 1);
        
        floorDrops.set(interaction.channelId, currentDrops);
        updateProfile(userId, { inventory: profile.inventory });

        await interaction.channel.send({
          content: `🔎 **${profile.nombre}** rebuscó y recogió **${itemData.name}** x${amount}.`
        });

        await perfilCmd.helpers.sendToLogChannel(interaction, 'SUMINISTRO_RECOGIDO', [
          `**SUJETO :** ${profile.nombre} (<@${userId}>)`,
          `**OBJETO :** ${itemData.name} x${amount}`,
          `**SECTOR :** <#${interaction.channelId}>`
        ]);

        if (interaction.message?.deletable) await interaction.message.delete().catch(() => null);
        return interaction.followUp({ content: `✅ Recogido **${itemData.name}** x${amount}.`, flags: 64 });

      } catch (error) {
        return interaction.followUp({ content: `⏳ **[N-OS]**: Tiempo agotado. Protocolo de recogida cancelado.`, flags: 64 });
      }
    }

    // ── CASO B: CANTIDAD IGUAL A 1 (Recogida Directa con Anti-Timeout local) ──
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: 64 });
    }

    const slotsRequeridos = itemData?.slots || 1;
    if (calcularSlotsOcupados(userId) + slotsRequeridos > calcularMaxSlots(userId)) {
      return interaction.editReply({ content: `❌ **[N-OS]**: Demasiado pesado (${slotsRequeridos} slots).` });
    }

    profile.inventory.push(drop.itemData);
    drops.splice(dropIdx, 1);
    floorDrops.set(interaction.channelId, drops);
    updateProfile(userId, { inventory: profile.inventory });

    await interaction.channel.send({
      content: `🔎 **${profile.nombre}** rebuscó y recogió **${itemData.name}**.`
    });

    await perfilCmd.helpers.sendToLogChannel(interaction, 'SUMINISTRO_RECOGIDO', [
      `**SUJETO :** ${profile.nombre} (<@${userId}>)`,
      `**OBJETO :** ${itemData.name} x1`,
      `**SECTOR :** <#${interaction.channelId}>`
    ]);

    if (interaction.message?.deletable) await interaction.message.delete().catch(() => null);
    return interaction.editReply({ content: `✅ Has recogido **${itemData.name}**.` });
  }

  // ===========================================================================
  // 3. CONSUMIR OBJETO MÉDICO / ALIMENTO
  // ===========================================================================
  if (customId === 'inv_consume_select') {
    const itemUid = interaction.values[0];
    const invIdx = profile.inventory.findIndex(i => i.uid === itemUid);

    if (invIdx === -1) {
      return interaction.reply({ content: '❌ **[N-OS]**: No se encuentra el objeto en la mochila.', flags: 64 });
    }

    const item = profile.inventory[invIdx];
    const itemData = itemsMaster[item.itemId];

    // Extraemos propiedades de tu itemsMaster (las que configuraremos en el siguiente paso)
    const hpCurado = itemData.heal || 0;
    const radiacionAumentada = itemData.radPenalty || 0;
    const radiacionCurada = itemData.radCure || 0;
    const curaSangrado = itemData.cures?.includes('sangrado') || false;
    const curaToxicidad = itemData.cures?.includes('toxicidad') || false;

    let logMsg = `💉 **${profile.nombre}** consumió **${itemData.name}**.`;
    let detailMsg = [];

    // --- APLICAR EFECTOS ---
    const newStatus = { ...profile.status };
    const newEstados = { ...newStatus.estados };

    // 1. Curar Vida
    if (hpCurado > 0) {
      const topeVidaReal = Math.max(1, (newStatus.maxHp || 100) - (newStatus.radiacion || 0));
      newStatus.hp = Math.min(newStatus.hp + hpCurado, topeVidaReal);
      detailMsg.push(`+${hpCurado} HP`);
    }

    // 2. Curar Estados
    if (curaSangrado && newEstados.sangrado) {
      newEstados.sangrado = false;
      detailMsg.push(`Hemorragia detenida`);
    }
    if (curaToxicidad && newEstados.toxicidad) {
      newEstados.toxicidad = false;
      detailMsg.push(`Toxicidad neutralizada`);
    }

    // 3. Sistema de Radiación
    if (radiacionCurada > 0) {
      newStatus.radiacion = Math.max(0, (newStatus.radiacion || 0) - radiacionCurada);
      detailMsg.push(`-${radiacionCurada}% Radiación`);
    }
    if (radiacionAumentada > 0) {
      newStatus.radiacion = Math.min(100, (newStatus.radiacion || 0) + radiacionAumentada);
      detailMsg.push(`⚠️ +${radiacionAumentada}% Radiación`);
      // Si la radiación aumenta y supera el HP actual, bajamos el HP para no romper las matemáticas
      const topeVidaReal = Math.max(1, (newStatus.maxHp || 100) - newStatus.radiacion);
      if (newStatus.hp > topeVidaReal) newStatus.hp = topeVidaReal;
    }

    newStatus.estados = newEstados;

    // --- RESTAR DEL INVENTARIO ---
    profile.inventory[invIdx].cantidad -= 1;
    if (profile.inventory[invIdx].cantidad <= 0) {
      profile.inventory.splice(invIdx, 1);
    }

    // --- GUARDAR Y RESPONDER ---
    updateProfile(userId, { status: newStatus, inventory: profile.inventory });

    const finalLog = `${logMsg} ${detailMsg.length > 0 ? `(${detailMsg.join(', ')})` : ''}`;

    await interaction.channel.send({ content: `> ${finalLog}` });
    
    // Si la interacción es un mensaje (ej: menú desplegable del inventario), podemos borrar el mensaje original
    if (interaction.message?.deletable) await interaction.message.delete().catch(() => null);
    
    return interaction.reply({ content: `✅ Objeto consumido con éxito.`, flags: 64 });
  }

};