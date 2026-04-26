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

// ===========================================================================
// Funciones auxiliares para limpieza de memoria y canales
// ===========================================================================

async function borrarMensajesSeguros(mensajes) {
  await Promise.allSettled(
    mensajes.map(msg =>
      msg.deletable
        ? msg.delete().catch(() => null)
        : Promise.resolve()
    )
  );
}

// ===========================================================================
// Controlador principal de interacciones físicas
// ===========================================================================

module.exports = async function handleAction(interaction) {
  const userId = interaction.user.id;
  const customId = interaction.customId;
  const profile = getProfile(userId);

  // Control de integridad: Inicialización de estructuras de datos ausentes
  if (!profile.inventory) profile.inventory = [];
  if (!profile.equipment) profile.equipment = {};
  if (!profile.status.estados) profile.status.estados = { sangrado: false, toxicidad: false };

  // Control de entorno: Ejecución restringida a zonas de despliegue (RP)
  if (interaction.channel.parentId !== process.env.RP_CATEGORY_ID) {
    return interaction.reply({ 
      content: '❌ **[N-OS]**: Error de topografía. Las interacciones de entorno están restringidas a canales de simulación (RP).', 
      flags: 64 
    });
  }

  // ===========================================================================
  // Protocolo 1: Descarte de suministros (Intercepción asíncrona de chat)
  // ===========================================================================
  if (customId === 'floor_drop_select') {
    const itemUid = interaction.values[0];
    const item = profile.inventory.find(i => i.uid === itemUid);

    if (!item) {
      return interaction.reply({ content: '❌ **[N-OS]**: Suministro ilocalizable en la base de datos local.', flags: 64 });
    }

    const itemData = itemsMaster[item.itemId];

    // Emisión de prompt temporal
    await interaction.reply({ 
      content: `📟 **[N-OS // PROTOCOLO DE DESCARTE]**\n> Objeto seleccionado: **${itemData.name}**\n> Disponibilidad: **${item.cantidad}** unidades.\n> 💬 Transmita la **cantidad** a descartar mediante la consola (Tiempo máximo: 30s):`, 
      flags: 64 
    });

    try {
      const collected = await interaction.channel.awaitMessages({ filter: m => m.author.id === userId, max: 1, time: 30000, errors: ['time'] });
      const msg = collected.first();
      const amount = parseInt(msg.content.trim());

      // Eliminación del mensaje de entrada para sanear la terminal
      if (msg.deletable) await msg.delete().catch(() => null);

      if (isNaN(amount) || amount <= 0 || amount > item.cantidad) {
        return interaction.followUp({ content: '❌ **[N-OS]**: Parámetro numérico no procesable o saldo insuficiente.', flags: 64 });
      }

      const invIdx = profile.inventory.findIndex(i => i.uid === itemUid);
      if (invIdx === -1) return interaction.followUp({ content: '❌ **[N-OS]**: Falla de indexación. Descarte abortado.', flags: 64 });

      // Registro de la entidad de datos en el canal actual
      dropItem(interaction.channelId, {
        uid: item.uid,
        itemId: item.itemId,
        cantidad: amount
      });

      profile.inventory[invIdx].cantidad -= amount;
      if (profile.inventory[invIdx].cantidad <= 0) profile.inventory.splice(invIdx, 1);
      updateProfile(userId, { inventory: profile.inventory });

      await interaction.channel.send({
        content: `📦 **${profile.nombre}** ha transferido **${itemData.name}** x${amount} a la superficie del sector.`
      });

      await perfilCmd.helpers.sendToLogChannel(interaction, 'SUMINISTRO_DESCARTADO', [
        `**SUJETO :** ${profile.nombre} (<@${userId}>)`,
        `**OBJETO :** ${itemData.name} x${amount}`,
        `**SECTOR :** <#${interaction.channelId}>`,
        `**ESTADO :** El material se degradará en un período de 20 minutos.`
      ]);

      if (interaction.message?.deletable) await interaction.message.delete().catch(() => null);
      return interaction.followUp({ content: `✅ Descarte confirmado: **${itemData.name}** x${amount}.`, flags: 64 });

    } catch (error) {
      return interaction.followUp({ content: `⏳ **[N-OS]**: Latencia de respuesta superada. Operación terminada.`, flags: 64 });
    }
  }

  // ===========================================================================
  // Protocolo 2: Recolección de suministros (Resolución condicional)
  // ===========================================================================
  if (customId === 'floor_pick_select') {
    const dropId = interaction.values[0];
    const drops = floorDrops.get(interaction.channelId) || [];
    const dropIdx = drops.findIndex(d => d.dropId === dropId);

    if (dropIdx === -1) return interaction.reply({ content: '❌ La firma del suministro ya no se encuentra en las lecturas del sector.', flags: 64 });

    const drop = drops[dropIdx];
    const itemData = itemsMaster[drop.itemData.itemId];

    // Escenario A: Selección de cantidad parcial
    if (drop.itemData.cantidad > 1) {
      await interaction.reply({ 
        content: `📟 **[N-OS // PROTOCOLO DE RECOLECCIÓN]**\n> Firma confirmada: **${itemData.name}**\n> Detección en zona: **${drop.itemData.cantidad}** | Límite estructural (Stack): **${itemData?.stack || 1}**\n> 💬 Transmita la **cantidad** a recuperar (Tiempo máximo: 30s):`, 
        flags: 64 
      });

      try {
        const collected = await interaction.channel.awaitMessages({ filter: m => m.author.id === userId, max: 1, time: 30000, errors: ['time'] });
        const msg = collected.first();
        const amount = parseInt(msg.content.trim());

        if (msg.deletable) await msg.delete().catch(() => null);

        // Revalidación de existencia del objeto tras la espera de red
        const currentDrops = floorDrops.get(interaction.channelId) || [];
        const currentDropIdx = currentDrops.findIndex(d => d.dropId === dropId);
        if (currentDropIdx === -1) return interaction.followUp({ content: '❌ **[N-OS]**: El suministro fue sustraído durante el periodo de cálculo.', flags: 64 });
        
        const currentDrop = currentDrops[currentDropIdx];

        if (isNaN(amount) || amount <= 0 || amount > currentDrop.itemData.cantidad) {
          return interaction.followUp({ content: '❌ **[N-OS]**: Parámetro numérico no procesable. Reintente.', flags: 64 });
        }

        const slotsRequeridos = Math.ceil(amount / (itemData?.stack || 1)) * (itemData?.slots || 1);
        if (calcularSlotsOcupados(userId) + slotsRequeridos > calcularMaxSlots(userId)) {
          return interaction.followUp({ content: `❌ **[N-OS]**: Límite de carga excedido (${slotsRequeridos} unidades de volumen).`, flags: 64 });
        }

        profile.inventory.push({ ...currentDrop.itemData, cantidad: amount });
        
        currentDrop.itemData.cantidad -= amount;
        if (currentDrop.itemData.cantidad <= 0) currentDrops.splice(currentDropIdx, 1);
        
        floorDrops.set(interaction.channelId, currentDrops);
        updateProfile(userId, { inventory: profile.inventory });

        await interaction.channel.send({
          content: `🔎 **${profile.nombre}** ha extraído y almacenado **${itemData.name}** x${amount}.`
        });

        await perfilCmd.helpers.sendToLogChannel(interaction, 'SUMINISTRO_RECOGIDO', [
          `**SUJETO :** ${profile.nombre} (<@${userId}>)`,
          `**OBJETO :** ${itemData.name} x${amount}`,
          `**SECTOR :** <#${interaction.channelId}>`
        ]);

        if (interaction.message?.deletable) await interaction.message.delete().catch(() => null);
        return interaction.followUp({ content: `✅ Extracción exitosa: **${itemData.name}** x${amount}.`, flags: 64 });

      } catch (error) {
        return interaction.followUp({ content: `⏳ **[N-OS]**: Tiempo de respuesta concluido. Interrupción forzada.`, flags: 64 });
      }
    }

    // Escenario B: Recolección íntegra y prevención de expiración
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: 64 });
    }

    const slotsRequeridos = itemData?.slots || 1;
    if (calcularSlotsOcupados(userId) + slotsRequeridos > calcularMaxSlots(userId)) {
      return interaction.editReply({ content: `❌ **[N-OS]**: Carga crítica alcanzada. El objeto requiere ${slotsRequeridos} unidades de volumen.` });
    }

    profile.inventory.push(drop.itemData);
    drops.splice(dropIdx, 1);
    floorDrops.set(interaction.channelId, drops);
    updateProfile(userId, { inventory: profile.inventory });

    await interaction.channel.send({
      content: `🔎 **${profile.nombre}** ha localizado y guardado **${itemData.name}**.`
    });

    await perfilCmd.helpers.sendToLogChannel(interaction, 'SUMINISTRO_RECOGIDO', [
      `**SUJETO :** ${profile.nombre} (<@${userId}>)`,
      `**OBJETO :** ${itemData.name} x1`,
      `**SECTOR :** <#${interaction.channelId}>`
    ]);

    if (interaction.message?.deletable) await interaction.message.delete().catch(() => null);
    return interaction.editReply({ content: `✅ Lectura positiva. **${itemData.name}** añadido al inventario.` });
  }

  // ===========================================================================
  // Protocolo 3: Aplicación de suministros de recuperación
  // ===========================================================================
  if (customId === 'inv_consume_select') {
    const itemUid = interaction.values[0];
    const invIdx = profile.inventory.findIndex(i => i.uid === itemUid);

    if (invIdx === -1) {
      return interaction.reply({ content: '❌ **[N-OS]**: Objeto no localizado en la matriz de equipamiento.', flags: 64 });
    }

    const item = profile.inventory[invIdx];
    const itemData = itemsMaster[item.itemId];

    // Extracción de parámetros desde el catálogo maestro
    const hpCurado = itemData.heal || 0;
    const radiacionAumentada = itemData.radPenalty || 0;
    const radiacionCurada = itemData.radCure || 0;
    const curaSangrado = itemData.cures?.includes('sangrado') || false;
    const curaToxicidad = itemData.cures?.includes('toxicidad') || false;

    let logMsg = `💉 **${profile.nombre}** se ha administrado **${itemData.name}**.`;
    let detailMsg = [];

    // Cálculo y aplicación de alteraciones biométricas
    const newStatus = { ...profile.status };
    const newEstados = { ...newStatus.estados };

    // Recuperación de integridad física (HP)
    if (hpCurado > 0) {
      const topeVidaReal = Math.max(1, (newStatus.maxHp || 100) - (newStatus.radiacion || 0));
      newStatus.hp = Math.min(newStatus.hp + hpCurado, topeVidaReal);
      detailMsg.push(`+${hpCurado} HP`);
    }

    // Estabilización de anomalías biológicas
    if (curaSangrado && newEstados.sangrado) {
      newEstados.sangrado = false;
      detailMsg.push(`Hemorragia detenida`);
    }
    if (curaToxicidad && newEstados.toxicidad) {
      newEstados.toxicidad = false;
      detailMsg.push(`Fallo por toxicidad mitigado`);
    }

    // Procesamiento de contaminación por radiación
    if (radiacionCurada > 0) {
      newStatus.radiacion = Math.max(0, (newStatus.radiacion || 0) - radiacionCurada);
      detailMsg.push(`-${radiacionCurada}% Radiación`);
    }
    if (radiacionAumentada > 0) {
      newStatus.radiacion = Math.min(100, (newStatus.radiacion || 0) + radiacionAumentada);
      detailMsg.push(`⚠️ +${radiacionAumentada}% Radiación`);
      // Ajuste del límite vital basado en la degradación por radiación
      const topeVidaReal = Math.max(1, (newStatus.maxHp || 100) - newStatus.radiacion);
      if (newStatus.hp > topeVidaReal) newStatus.hp = topeVidaReal;
    }

    newStatus.estados = newEstados;

    // Deducción de existencias en base de datos
    profile.inventory[invIdx].cantidad -= 1;
    if (profile.inventory[invIdx].cantidad <= 0) {
      profile.inventory.splice(invIdx, 1);
    }

    // Sincronización y finalización del protocolo
    updateProfile(userId, { status: newStatus, inventory: profile.inventory });

    const finalLog = `${logMsg} ${detailMsg.length > 0 ? `(${detailMsg.join(', ')})` : ''}`;

    await interaction.channel.send({ content: `> ${finalLog}` });
    
    // Limpieza de interfaces previas si el contexto lo permite
    if (interaction.message?.deletable) await interaction.message.delete().catch(() => null);
    
    return interaction.reply({ content: `✅ Secuencia de aplicación finalizada con éxito.`, flags: 64 });
  }

};