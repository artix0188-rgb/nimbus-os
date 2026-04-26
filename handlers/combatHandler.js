const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const engine = require('../services/combatEngine');
const { getProfile, updateProfile, deleteProfile } = require('../services/profileService');
const { equiparObjeto, desequiparObjeto, itemsMaster } = require('../services/inventoryService');
const canvasService = require('../services/combatCanvasService');
const deathService = require('../services/deathService');
const lootHandler = require('./lootHandler');

const MAG_SIZES = {
  "pistola_9mm": 15, "pistola_45": 7, "pistola_40": 13, "pistola_380": 8, "pistola_10mm": 10,
  "revolver_38": 6, "revolver_357": 6, "revolver_44": 6, "subfusil_compacto": 20,
  "escopeta_caza": 2, "escopeta_recortada": 2, "subfusil_estandar_9": 30, "subfusil_estandar_45": 25,
  "rifle_aire_mod": 1, "escopeta_imp_12": 1, "escopeta_imp_20": 1,
  "fusil_asalto_556": 30, "fusil_asalto_762": 30, "rifle_combate_762": 20, "rifle_combate_308": 20,
  "rifle_sniper_308": 5, "rifle_sniper_3006": 5, "arma_antigua": 5, "rifle_alto_calibre": 10
};

// ===========================================================================
// Funciones utilitarias
// ===========================================================================
function getAmmoCount(inventory, ammoType) {
  if (!inventory || !ammoType) return 0;
  return inventory.filter(i => itemsMaster[i.itemId]?.ammoType === ammoType || i.itemId === ammoType).reduce((acc, curr) => acc + curr.cantidad, 0);
}

function calculateArmor(profile) {
  let ap = 0;
  if (!profile || !profile.equipment) return 0;
  const slots = ['cabeza', 'torso', 'piernas', 'brazos'];
  slots.forEach(slot => {
    const itemId = profile.equipment[slot]?.itemId;
    if (itemId && itemsMaster[itemId]?.armor) ap += itemsMaster[itemId].armor;
  });
  return Math.min(50, ap); // Límite máximo de blindaje fijado en 50 AP
}

// Persistencia de datos en tiempo real
function guardarEstadoJugador(targetId, hp, inventory, mags) {
  const profile = getProfile(targetId);
  if (!profile) return;
  if (!profile.status) profile.status = {};
  
  profile.status.hp = Math.floor(Math.max(0, Math.min(profile.status.maxHp || 100, hp)));
  // Corrección: el parámetro profile.status.salud ha sido descontinuado de la base de datos
  
  const updates = { status: profile.status, inventory: inventory };
  if (mags) updates.mags = mags;

  updateProfile(targetId, updates);
}

// ===========================================================================
// Módulo de renderizado visual de interfaz (Canvas y ANSI)
// ===========================================================================
async function renderCombat(interaction, combatId) {
  const combat = engine.activeCombats.get(combatId);
  if (!combat) return;

  // Bloque visual superior: Estado de entidades hostiles
  const embedEnemies = new EmbedBuilder().setTitle('⚠️ SISTEMA N-OS // ENFRENTAMIENTO HOSTIL').setColor(0xff0000);

  if (combat.isLethal) {
    embedEnemies.setDescription('☠️ **ALERTA CRÍTICA:** ESTE ENFRENTAMIENTO ES DE CARÁCTER LETAL.');
  }

  const totalE = combat.enemies.length;
  combat.enemies.forEach((e, i) => {
    const status = e.hp > 0 ? `${engine.generarBarra(e.hp, e.maxHp, false)} \`${Math.floor(e.hp)}/${e.maxHp} HP\`` : '💀 ELIMINADO';
    embedEnemies.addFields({ name: `🩸 **${e.name}** [ID: ${i}]`, value: `> ${status}`, inline: true });

    // Corrección de simetría: Inserción de un campo vacío condicional para asegurar alineación visual 2x2
    if (totalE === 4 && i === 1) {
      embedEnemies.addFields({ name: '\u200b', value: '\u200b', inline: true });
    }
  });

  // Bloque visual central: Renderizado del escenario de combate
  const embedImage = new EmbedBuilder()
    .setColor(0x1a1a1a)
    .setImage('attachment://combat_render.png');

  // Bloque visual inferior: Estado del escuadrón táctico
  const embedPlayers = new EmbedBuilder().setTitle('🛡️ ESCUADRÓN ALIADO').setColor(0x3b82f6);

  combat.players.forEach(p => {
    const profile = getProfile(p.id);
    
    if (p.ap === undefined) p.ap = calculateArmor(profile);
    
    const maxHpVisual = p.maxHp || 100;
    const currentHP = Math.floor(p.hp || 0);
    
    let status;
    if (p.isDead) status = '> 💀 **MUERTO EN COMBATE**';
    else if (p.escaped) status = '> 🏃 **ESCAPÓ DE LA ZONA**';
    else if (p.hp <= 0) status = '> ⚠️ **INCONSCIENTE / DESANGRÁNDOSE**';
    else {
      const currentAP = Math.floor(p.ap || 0);
      const apBar = engine.generarBarra(currentAP, 50);
      const hpBar = engine.generarBarra(currentHP, maxHpVisual);
      
      status = `> 🛡️ ${apBar} \`${currentAP}/50 AP\`\n> ❤️ ${hpBar} \`${currentHP}/${maxHpVisual} HP\``;
    }

    let wepDisplay = '';
    if (profile && p.hp > 0 && !p.escaped && !p.isDead) {
      const priId = profile.equipment?.arma_pri?.itemId;
      const secId = profile.equipment?.arma_sec?.itemId;
      
      if (priId) wepDisplay += `\n> PRI: **${itemsMaster[priId]?.name}**`;
      if (secId) wepDisplay += `\n> SEC: **${itemsMaster[secId]?.name}**`;
      if (!priId && !secId) wepDisplay += `\n> 👊 **Desarmado**`;

      const armasFuego = [];
      if (priId && MAG_SIZES[priId]) armasFuego.push({ id: priId, slot: 'pri' });
      if (secId && MAG_SIZES[secId]) armasFuego.push({ id: secId, slot: 'sec' });

      if (!p.mags) p.mags = profile.mags ? { ...profile.mags } : {};

      if (armasFuego.length > 0) {
        const wep = armasFuego[0];
        const ammoType = itemsMaster[wep.id]?.ammoType;
        const maxMag = MAG_SIZES[wep.id];
        
        const currentMag = p.mags[wep.slot] !== undefined ? p.mags[wep.slot] : maxMag;
        p.mags[wep.slot] = currentMag; 
        
        const totalAmmo = getAmmoCount(profile.inventory, ammoType);
        wepDisplay += `\n> 🔋 Mun: \`${currentMag}/${maxMag} (${totalAmmo})\``;
      }
    }

    const isTurn = (!combat.ended && combat.turnQueue[combat.currentTurn]?.id === p.id) ? '▶️ ' : '👤 ';
    const defendTag = p.isDefending ? ' 🛡️' : '';
    embedPlayers.addFields({ name: `${isTurn}${p.name}${defendTag}`, value: `${status}${wepDisplay}`, inline: true });
  });

  // Registro de eventos tácticos (Log independiente)
  let ansiLog = '```ansi\n';
  const ultimosLogs = combat.log.slice(-6); // Restricción del historial a los 6 últimos eventos para legibilidad
  
  if (ultimosLogs.length === 0) {
    ansiLog += '\u001b[30mEsperando comandos tácticos...\u001b[0m\n';
  } else {
    ultimosLogs.forEach(line => {
      // Limpieza de marcadores markdown no procesables por sintaxis ANSI
      let cleanLine = line.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '');
      
      if (cleanLine.includes('¡CRÍTICO!') || cleanLine.includes('MUERTO') || cleanLine.includes('fatal') || cleanLine.includes('derribado')) {
        ansiLog += `\u001b[1;31m${cleanLine}\u001b[0m\n`; // Alerta roja para eventos letales o críticos
      } else if (cleanLine.includes('falla') || cleanLine.includes('escapa') || cleanLine.includes('evadir') || cleanLine.includes('mitiga')) {
        ansiLog += `\u001b[34m${cleanLine}\u001b[0m\n`; // Alerta azul para eventos de evasión o defensa
      } else if (cleanLine.includes('usa [') || cleanLine.includes('recupera') || cleanLine.includes('estabilizado')) {
        ansiLog += `\u001b[32m${cleanLine}\u001b[0m\n`; // Alerta verde para intervenciones de estabilización médica
      } else {
        ansiLog += `\u001b[33m${cleanLine}\u001b[0m\n`; // Alerta estándar (amarilla) para hostilidades comunes
      }
    });
  }
  ansiLog += '```';
  
  const embedLog = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle('▼ REGISTRO TÁCTICO DE COMBATE')
    .setDescription(ansiLog);

  const currentEntity = combat.turnQueue[combat.currentTurn];
  
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  if (!combat.ended) {
    if (currentEntity && !currentEntity.isMonster && currentEntity.hp > 0 && !currentEntity.escaped && !currentEntity.isDead) {
      row1.addComponents(
        new ButtonBuilder().setCustomId(`cb_attack_${combatId}`).setLabel('ATACAR').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`cb_reload_${combatId}`).setLabel('RECARGAR').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cb_item_${combatId}`).setLabel('OBJETOS').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`cb_equip_${combatId}`).setLabel('EQUIPO').setStyle(ButtonStyle.Secondary)
      );
      row2.addComponents(
        new ButtonBuilder().setCustomId(`cb_defend_${combatId}`).setLabel('DEFENDER').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`cb_flee_${combatId}`).setLabel('HUIR').setStyle(ButtonStyle.Secondary)
      );
    } else if (currentEntity && currentEntity.isMonster) {
      row1.addComponents(
        new ButtonBuilder().setCustomId(`cb_ai_step_${combatId}`).setLabel('PROCESANDO ENEMIGO...').setStyle(ButtonStyle.Secondary).setDisabled(true)
      );
    }
  }

  const components = [];
  if (row1.components.length > 0) components.push(row1);
  if (row2.components.length > 0) components.push(row2);

  // Eliminación de ping temporal anterior
  if (combat.lastPingMsgId) {
    try {
      const oldPing = await combat.message.channel.messages.fetch(combat.lastPingMsgId);
      if (oldPing && oldPing.deletable) await oldPing.delete();
    } catch (e) {}
    combat.lastPingMsgId = null; 
  }

  // Ensamblado del lienzo perimetral
  let combatImageAttachment;
  try {
    const channelCategoryId = combat.message.channel.parentId; 
    const channelId = combat.message.channel.id; 
    combatImageAttachment = await canvasService.generateCombatImage(combat, channelCategoryId, channelId);
  } catch (error) {
    console.log('Error generando canvas de combate:', error);
  }

  const payload = { 
    content: '', 
    embeds: [embedEnemies, embedImage, embedPlayers, embedLog],
    components: components,
    files: combatImageAttachment ? [combatImageAttachment] : [] 
  };

  try {
    if (interaction && interaction.isMessageComponent() && !interaction.replied && !interaction.deferred) {
      await interaction.update(payload);
    } else {
      await combat.message.edit(payload);
    }
  } catch (error) {}

  if (!combat.ended && currentEntity && !currentEntity.isMonster && currentEntity.hp > 0 && !currentEntity.escaped && !currentEntity.isDead && interaction) {
    const pingMsg = await combat.message.channel.send(`<@${currentEntity.id}>, es tu turno.`);
    combat.lastPingMsgId = pingMsg.id; 
  }
}

// ===========================================================================
// Inicializador del flujo de combate
// ===========================================================================
async function arrancarCombate(interaction, combatId) {
  const combat = engine.activeCombats.get(combatId);
  
  if (combat) {
    combat.players.forEach(p => {
      const profile = getProfile(p.id);
      if (profile) {
        p.maxHp = profile.status?.maxHp !== undefined ? profile.status.maxHp : 100;
        p.hp = profile.status?.hp !== undefined ? profile.status.hp : p.maxHp;
        p.ap = calculateArmor(profile);
      }
    });
  }

  await renderCombat(interaction, combatId);
  
  if (combat && combat.turnQueue[combat.currentTurn].isMonster) {
    setTimeout(() => procesarTurnoIA(combat), 1500);
  } else if (combat && combat.turnQueue[combat.currentTurn]) {
    const currentEntity = combat.turnQueue[combat.currentTurn];
    const pingMsg = await combat.message.channel.send(`<@${currentEntity.id}>, inician las hostilidades. Es tu turno.`);
    combat.lastPingMsgId = pingMsg.id; 
  }
}

// ── MANEJO DE ACCIONES ──
const handleCombatInteraction = async function(interaction) {
  const parts = interaction.customId.split('_');
  const action = parts[1];
  const combatId = `${parts[2]}_${parts[3]}`;

  const combat = engine.activeCombats.get(combatId);
  if (!combat) return interaction.reply({ content: '❌ El combate ya finalizó.', flags: 64 });

  const currentEntity = combat.turnQueue[combat.currentTurn];
  if (currentEntity.id !== interaction.user.id) return interaction.reply({ content: '❌ No es tu turno.', flags: 64 });

  if (action === 'item') {
    const profile = getProfile(currentEntity.id);
    const healItems = profile.inventory.filter(i => {
      const d = itemsMaster[i.itemId];
      return d && (d.type === 'medicina' || d.heal > 0);
    }).map(i => ({ label: `Usar: ${itemsMaster[i.itemId].name}`, description: `Restaura salud`, value: i.uid }));

    if (healItems.length === 0) return interaction.reply({ content: '❌ No tienes objetos médicos en tu mochila.', flags: 64 });

    const select = new StringSelectMenuBuilder().setCustomId(`cb_doheal_${combatId}`).setPlaceholder('Selecciona el suministro médico...').addOptions(healItems.slice(0, 25));
    const row = new ActionRowBuilder().addComponents(select);
    return interaction.reply({ content: '💉 **Selecciona un suministro médico:** (Consumirá tu turno)', components: [row], flags: 64 });
  }

  if (action === 'doheal') {
    const itemUid = interaction.values[0];
    const profile = getProfile(currentEntity.id);
    const itemIdx = profile.inventory.findIndex(i => i.uid === itemUid);
    
    if (itemIdx === -1) return interaction.update({ content: `❌ Objeto no encontrado.`, components: [] });
    
    const itemId = profile.inventory[itemIdx].itemId;
    const data = itemsMaster[itemId];
    
    let healAmount = 0;
    if (data.heal) {
      healAmount = data.heal; 
    } else if (data.type === 'medicina') {
      healAmount = 30; 
    }
    
    currentEntity.hp += healAmount;
    if (currentEntity.hp > currentEntity.maxHp) currentEntity.hp = currentEntity.maxHp;
    
    profile.inventory[itemIdx].cantidad -= 1;
    if (profile.inventory[itemIdx].cantidad <= 0) profile.inventory.splice(itemIdx, 1);
    
    guardarEstadoJugador(currentEntity.id, currentEntity.hp, profile.inventory, currentEntity.mags);

    combat.log.push(`💉 **${currentEntity.name}** usa [${data.name}] y recupera salud (+${healAmount} HP).`);
    advanceTurn(combat);
    renderCombat(null, combatId);
    return interaction.update({ content: `✅ Te has curado.`, components: [] });
  }

  if (action === 'reload') {
    const profile = getProfile(currentEntity.id);
    const priId = profile.equipment?.arma_pri?.itemId;
    const secId = profile.equipment?.arma_sec?.itemId;

    let slotARecargar = null;
    let armaId = null;

    if (priId && MAG_SIZES[priId] && (currentEntity.mags?.pri || 0) < MAG_SIZES[priId]) {
      slotARecargar = 'pri'; armaId = priId;
    } else if (secId && MAG_SIZES[secId] && (currentEntity.mags?.sec || 0) < MAG_SIZES[secId]) {
      slotARecargar = 'sec'; armaId = secId;
    }

    if (!slotARecargar) return interaction.reply({ content: '❌ No tienes armas que necesiten recarga.', flags: 64 });

    const maxMag = MAG_SIZES[armaId];
    const currentMag = currentEntity.mags[slotARecargar] || 0;
    const balasNecesarias = maxMag - currentMag;
    
    const ammoType = itemsMaster[armaId].ammoType;
    let balasEnInventario = getAmmoCount(profile.inventory, ammoType);

    if (balasEnInventario <= 0) return interaction.reply({ content: `❌ No te queda munición (\`${ammoType}\`).`, flags: 64 });

    const balasARecargar = Math.min(balasNecesarias, balasEnInventario);
    
    let restantePorBorrar = balasARecargar;
    for (let i = 0; i < profile.inventory.length; i++) {
      if (restantePorBorrar <= 0) break;
      const item = profile.inventory[i];
      if (itemsMaster[item.itemId]?.ammoType === ammoType || item.itemId === ammoType) {
        if (item.cantidad >= restantePorBorrar) {
          item.cantidad -= restantePorBorrar;
          restantePorBorrar = 0;
        } else {
          restantePorBorrar -= item.cantidad;
          item.cantidad = 0;
        }
      }
    }
    profile.inventory = profile.inventory.filter(i => i.cantidad > 0);
    
    currentEntity.mags[slotARecargar] += balasARecargar;

    guardarEstadoJugador(currentEntity.id, currentEntity.hp, profile.inventory, currentEntity.mags);

    combat.log.push(`🔄 **${currentEntity.name}** recarga y asegura ${balasARecargar} bala(s) en su ${itemsMaster[armaId].name}.`);
    advanceTurn(combat);
    return renderCombat(interaction, combatId);
  }

  if (action === 'attack') {
    const profile = getProfile(currentEntity.id);
    const armaPriId = profile.equipment?.arma_pri?.itemId;
    const armaSecId = profile.equipment?.arma_sec?.itemId;
    
    const armaPri = armaPriId ? itemsMaster[armaPriId] : null;
    const armaSec = armaSecId ? itemsMaster[armaSecId] : null;

    const row = new ActionRowBuilder();
    if (armaPri) row.addComponents(new ButtonBuilder().setCustomId(`cb_atkweap_${combatId}_pri`).setLabel(`PRI: ${armaPri.name}`).setStyle(ButtonStyle.Danger));
    if (armaSec) row.addComponents(new ButtonBuilder().setCustomId(`cb_atkweap_${combatId}_sec`).setLabel(`SEC: ${armaSec.name}`).setStyle(ButtonStyle.Danger));
    
    row.addComponents(new ButtonBuilder().setCustomId(`cb_atkweap_${combatId}_unarmed`).setLabel('DESARMADO').setStyle(ButtonStyle.Secondary));
    row.addComponents(new ButtonBuilder().setCustomId(`cb_back_${combatId}`).setLabel('◀️ VOLVER').setStyle(ButtonStyle.Primary));

    return interaction.update({ content: '🔫 **Selecciona con qué arma vas a efectuar el ataque:**', components: [row] });
  }

  if (action === 'atkweap') {
    const slotSeleccionado = parts[4]; 
    if (slotSeleccionado === 'pri' || slotSeleccionado === 'sec') {
      const magLleno = currentEntity.mags?.[slotSeleccionado] || 0;
      const profile = getProfile(currentEntity.id);
      const armaId = profile.equipment[`arma_${slotSeleccionado}`]?.itemId;
      const isRanged = MAG_SIZES[armaId] !== undefined;

      if (isRanged && magLleno <= 0) {
         return interaction.reply({ content: `⚠️ *Clic, clic...* Tu arma está descargada. Usa tu turno para **RECARGAR**.`, flags: 64 });
      }
    }

    const targets = [];
    combat.enemies.forEach((e, index) => {
      if (e.hp > 0) {
        targets.push({
          label: `${e.name} [ID: ${index}]`, 
          description: `Vida: ${Math.floor(e.hp)} HP`, 
          value: index.toString()
        });
      }
    });

    const select = new StringSelectMenuBuilder().setCustomId(`cb_target_${combatId}_${slotSeleccionado}`).setPlaceholder('Selecciona un objetivo...').addOptions(targets);
    const row = new ActionRowBuilder().addComponents(select);
    const cancelRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`cb_back_${combatId}`).setLabel('◀️ VOLVER').setStyle(ButtonStyle.Danger));

    return interaction.update({ content: '🎯 **Fijación de objetivo:**', components: [row, cancelRow] });
  }

  if (action === 'target') {
    const slotSeleccionado = parts[4];
    const targetIdx = parseInt(interaction.values[0]);
    const target = combat.enemies[targetIdx];
    
    const profile = getProfile(currentEntity.id);
    let arma = null;
    
    if (slotSeleccionado === 'pri' && profile.equipment?.arma_pri) arma = itemsMaster[profile.equipment.arma_pri.itemId];
    if (slotSeleccionado === 'sec' && profile.equipment?.arma_sec) arma = itemsMaster[profile.equipment.arma_sec.itemId];
    
    let baseDmg = 5; 
    let balaCosto = 0;
    
    if (arma) {
      if (arma.dmg) baseDmg = arma.dmg; 

      if (MAG_SIZES[arma.id || Object.keys(itemsMaster).find(key => itemsMaster[key] === arma)]) {
        balaCosto = (arma.type === 'arma_2h_ligera' || arma.type === 'arma_2h_pesada') ? 3 : 1; 
        if (arma.name.toLowerCase().includes('escopeta')) balaCosto = 2;
        if (arma.name.toLowerCase().includes('sniper') || arma.name.toLowerCase().includes('antigua')) balaCosto = 1;

        if (currentEntity.mags[slotSeleccionado] < balaCosto) {
           balaCosto = currentEntity.mags[slotSeleccionado];
        }

        currentEntity.mags[slotSeleccionado] -= balaCosto;
        
        guardarEstadoJugador(currentEntity.id, currentEntity.hp, profile.inventory, currentEntity.mags);
        
        if (balaCosto > 1) {
           baseDmg = baseDmg + (baseDmg * 0.40 * (balaCosto - 1));
        }
      }
    }

    const result = engine.calcularAtaque(currentEntity.stats, target.stats, arma);
    let logMsg = '';
    let accionVerbo = "lanza un golpe desarmado contra";
    if (arma) {
      if (arma.type.includes('1h') || arma.type.includes('2h')) accionVerbo = balaCosto > 1 ? `desata una ráfaga devastadora de su **${arma.name}** contra` : `dispara su **${arma.name}** contra`;
      else if (arma.type.includes('blanca') || arma.type.includes('contundente')) accionVerbo = `ataca con su **${arma.name}** a`;
    }

    if (!result.isHit) {
      logMsg = `💢 **${currentEntity.name}** ${accionVerbo} **${target.name}** pero falla estrepitosamente.`;
    } else {
      const statBonus = result.atkStat ? Math.floor(result.atkStat * 1.5) : 0;
      let finalDmg = Math.floor(baseDmg + statBonus + (Math.floor(Math.random() * 8) - 3)); 
      
      if (result.isCrit) {
        finalDmg = Math.floor(finalDmg * 1.6);
        logMsg = `💥 ¡CRÍTICO! **${currentEntity.name}** ${accionVerbo} **${target.name}** logrando un impacto letal. `;
      } else {
        logMsg = `⚔️ **${currentEntity.name}** ${accionVerbo} **${target.name}** y acierta. `;
      }

      if (target.ap > 0) {
        let armorDmg = Math.floor(finalDmg * 0.60);
        let hpDmg = finalDmg - armorDmg;
        if (armorDmg > target.ap) {
          hpDmg += (armorDmg - target.ap);
          armorDmg = target.ap;
        }
        target.ap -= armorDmg;
        target.hp -= hpDmg;
        logMsg += `**[-${hpDmg} HP]** \`[-${armorDmg} Blindaje]\``;
      } else {
        const mit = engine.calcularMitigacion(target.stats, finalDmg);
        if (mit.tipoMitigacion) logMsg += `Sin embargo, el objetivo ${mit.tipoMitigacion}. `;
        target.hp -= mit.finalDamage;
        logMsg += `**[-${mit.finalDamage} HP]**`;
      }

      if (target.hp <= 0) {
        target.hp = 0;
        logMsg += ` \n💀 **${target.name}** ha sido derribado.`;
      }
    }

    combat.log.push(logMsg);
    advanceTurn(combat);
    return renderCombat(interaction, combatId);
  }

  if (action === 'defend') {
    currentEntity.isDefending = true;
    combat.log.push(`🛡️ **${currentEntity.name}** adopta una postura defensiva (El daño enemigo se reducirá a la mitad).`);
    advanceTurn(combat);
    return renderCombat(interaction, combatId);
  }

  if (action === 'flee') {
    const highestEnemyPer = Math.max(...combat.enemies.filter(e => e.hp > 0).map(e => e.stats.percepcion), 1);
    const fleeChance = 50 + ((currentEntity.stats.destreza - highestEnemyPer) * 10);
    if ((Math.floor(Math.random() * 100) + 1) <= fleeChance) {
      combat.log.push(`💨 **${currentEntity.name}** logra evadir la amenaza y escapa de la zona.`);
      currentEntity.escaped = true; 
      
      const profile = getProfile(currentEntity.id);
      if(profile) guardarEstadoJugador(currentEntity.id, currentEntity.hp, profile.inventory, currentEntity.mags);
    } else {
      combat.log.push(`🚫 **${currentEntity.name}** intenta huir, pero es interceptado.`);
    }
    advanceTurn(combat);
    return renderCombat(interaction, combatId);
  }

  if (action === 'equip') {
    const profile = getProfile(interaction.user.id);
    const equipOptions = (profile.inventory || []).filter(it => {
      const d = itemsMaster[it.itemId];
      return d && ['cabeza', 'cara', 'torso', 'brazos', 'piernas', 'pies', 'mochila', 'arma_1h', 'arma_2h_ligera', 'arma_2h_pesada', 'arma_blanca', 'arma_contundente'].includes(d.type);
    }).map(it => ({ label: `Equipar: ${itemsMaster[it.itemId].name}`, description: `UID: ${it.uid.substring(0, 8)}`, value: it.uid }));

    const eqKeys = Object.keys(profile.equipment || {}).filter(k => profile.equipment[k] !== undefined);
    const unequipOptions = eqKeys.map(k => ({ label: `Quitar: ${itemsMaster[profile.equipment[k].itemId]?.name || 'Desconocido'}`, description: `Ranura: ${k.toUpperCase()}`, value: k }));

    const components = [];
    if (equipOptions.length > 0) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`cb_doeq_${combatId}`).setPlaceholder('Equipar...').addOptions(equipOptions.slice(0, 25))));
    if (unequipOptions.length > 0) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`cb_douneq_${combatId}`).setPlaceholder('Desequipar...').addOptions(unequipOptions)));

    if (components.length === 0) return interaction.reply({ content: '❌ No tienes equipo gestionable.', flags: 64 });
    return interaction.reply({ content: '📟 **[N-OS // EQUIPO TÁCTICO]**\nCambiar de equipo consumirá tu turno.', components: components, flags: 64 });
  }

  if (action === 'douneq') {
    const slot = interaction.values[0];
    const itemName = getProfile(interaction.user.id).equipment[slot] ? (itemsMaster[getProfile(interaction.user.id).equipment[slot].itemId]?.name || 'objeto') : 'objeto';
    const res = desequiparObjeto(interaction.user.id, slot);
    if (!res.success) return interaction.update({ content: `❌ **Error:** ${res.msg}`, components: [] });
    
    currentEntity.ap = calculateArmor(getProfile(interaction.user.id)); 
    combat.log.push(`🎒 **${currentEntity.name}** desequipa: **${itemName}**.`);
    advanceTurn(combat);
    renderCombat(null, combatId); 
    return interaction.update({ content: `✅ Desequipaste **${itemName}**.`, components: [] });
  }

  if (action === 'doeq') {
    const itemUid = interaction.values[0];
    const data = itemsMaster[getProfile(interaction.user.id).inventory?.find(i => i.uid === itemUid)?.itemId];
    if (data.type.includes('arma')) {
      const weaponRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cb_doeqw_${combatId}_pri_${itemUid}`).setLabel('PRINCIPAL').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`cb_doeqw_${combatId}_sec_${itemUid}`).setLabel('SECUNDARIA').setStyle(ButtonStyle.Secondary)
      );
      return interaction.update({ content: `🔫 ¿Posición para **${data.name}**?`, components: [weaponRow] });
    }
    const res = equiparObjeto(interaction.user.id, itemUid);
    if (!res.success) return interaction.update({ content: `❌ **Error:** ${res.msg}`, components: [] });
    
    currentEntity.ap = calculateArmor(getProfile(interaction.user.id)); 
    combat.log.push(`🛡️ **${currentEntity.name}** equipa: **${data.name}**.`);
    advanceTurn(combat);
    renderCombat(null, combatId); 
    return interaction.update({ content: `✅ Equipaste **${data.name}**.`, components: [] });
  }

  if (action === 'doeqw') {
    const slotChoise = parts[4]; 
    const itemUid = parts.slice(5).join('_'); 
    const slotKey = slotChoise === 'pri' ? 'arma_pri' : 'arma_sec';
    const profile = getProfile(interaction.user.id);
    const data = itemsMaster[profile.inventory?.find(i => i.uid === itemUid)?.itemId];
    const res = equiparObjeto(interaction.user.id, itemUid, slotKey);
    if (!res.success) return interaction.update({ content: `❌ **Error:** ${res.msg}`, components: [] });
    
    if (!currentEntity.mags) currentEntity.mags = {};
    currentEntity.mags[slotChoise] = 0; 

    combat.log.push(`⚔️ **${currentEntity.name}** desenfunda su **${data.name}**.`);
    advanceTurn(combat);
    renderCombat(null, combatId); 
    return interaction.update({ content: `✅ Arma lista.`, components: [] });
  }

  if (action === 'back') return renderCombat(interaction, combatId);
};

// ── CONTROL DE TURNOS Y FINALIZACIÓN ──
function advanceTurn(combat) {
  const vivosP = combat.players.filter(p => p.hp > 0 && !p.escaped && !p.isDead).length;
  const vivosE = combat.enemies.filter(e => e.hp > 0).length;

  if (vivosP === 0 || vivosE === 0) {
    combat.ended = true;
    return finalizarCombate(combat);
  }
  
  let intentos = 0;
  do {
    combat.currentTurn++;
    if (combat.currentTurn >= combat.turnQueue.length) combat.currentTurn = 0;
    intentos++;
    if (intentos > combat.turnQueue.length * 2) {
      combat.ended = true;
      return finalizarCombate(combat);
    }
  } while (combat.turnQueue[combat.currentTurn].hp <= 0 || combat.turnQueue[combat.currentTurn].escaped || combat.turnQueue[combat.currentTurn].isDead);

  combat.turnQueue[combat.currentTurn].isDefending = false;

  if (combat.turnQueue[combat.currentTurn].isMonster) setTimeout(() => procesarTurnoIA(combat), 1500); 
}

// ── IA DEL ENEMIGO (DAÑO Y LETALIDAD) ──
function procesarTurnoIA(combat) {
  const npc = combat.turnQueue[combat.currentTurn];
  const targets = combat.players.filter(p => p.hp > 0 && !p.escaped && !p.isDead);
  if (targets.length === 0) return advanceTurn(combat);
  
  const target = targets[Math.floor(Math.random() * targets.length)]; 
  const result = engine.calcularAtaque(npc.stats, target.stats, null); 
  
  if (!result.isHit) {
    combat.log.push(`🛡️ **${npc.name}** ataca a **${target.name}** pero falla.`);
  } else {
    let finalDmg = Math.floor(npc.damageRange[0] + Math.random() * (npc.damageRange[1] - npc.damageRange[0]));
    
    let msg = `🩸 **${npc.name}** daña a **${target.name}**. `;

    if (target.isDefending) {
      finalDmg = Math.max(1, Math.floor(finalDmg * 0.5));
      msg = `🛡️ **${target.name}** se cubre y mitiga el impacto de **${npc.name}**. `;
    }
    
    if (target.ap > 0) {
      let armorDmg = Math.floor(finalDmg * 0.60);
      let hpDmg = finalDmg - armorDmg;

      if (armorDmg > target.ap) {
        const overflow = armorDmg - target.ap;
        armorDmg = target.ap;
        hpDmg += overflow;
      }

      target.ap -= armorDmg;
      target.hp -= hpDmg;
      msg += `**[-${hpDmg} HP]** \`[-${armorDmg} Blindaje]\``;
    } else {
      target.hp -= finalDmg;
      msg += `**[-${finalDmg} HP]**`; 
    }

    if (target.hp <= 0) {
      target.hp = 0;
      if (combat.isLethal) {
        target.isDead = true; 
        msg += ` \n☠️ **${target.name}** recibe una herida fatal y ha MUERTO.`;
      } else {
        msg += ` \n⚠️ **${target.name}** cae incapacitado y comienza a desangrarse.`;
      }
    }
    
    const profile = getProfile(target.id);
    if(profile) guardarEstadoJugador(target.id, target.hp, profile.inventory, target.mags);

    combat.log.push(msg);
  }
  advanceTurn(combat);
  
  if (!combat.ended) {
    renderCombat(null, combat.id);
  }
}

// ── RESUMEN JRPG Y GUARDADO FINAL ──
async function finalizarCombate(combat) {
  const vivosE = combat.enemies.filter(e => e.hp > 0).length;
  const muertosP = combat.players.filter(p => p.hp <= 0 && !p.escaped).length;
  const escapadosP = combat.players.filter(p => p.escaped).length;
  const totalP = combat.players.length;

  let resultadoTitulo = vivosE === 0 ? "🏆 VICTORIA CONFIRMADA" : (escapadosP > 0 && muertosP + escapadosP === totalP) ? "💨 RETIRADA TÁCTICA" : "💀 CAÍDOS EN COMBATE";
  let resultadoColor = vivosE === 0 ? 0xffd700 : (escapadosP > 0 && muertosP + escapadosP === totalP) ? 0x3b82f6 : 0x8b0000;
  let resumenTexto = vivosE === 0 ? "Las amenazas han sido purgadas del sector con éxito." : (escapadosP > 0 && muertosP + escapadosP === totalP) ? "El escuadrón abandonó la zona. Las amenazas siguen activas." : "El escuadrón ha sido neutralizado. Conexión biológica perdida.";

  const embed = new EmbedBuilder().setTitle(resultadoTitulo).setColor(resultadoColor).setDescription(`> *${resumenTexto}*\n\n### ESTADO FINAL DEL ESCUADRÓN`);

  let statusPlayers = "";
  let deathLogs = [];

  for (const p of combat.players) {
    const profile = getProfile(p.id);
    if (!profile) continue;
    if (!profile.status) profile.status = {};
    if (profile.status.maxHp === undefined) profile.status.maxHp = 100;
    if (profile.status.deathPenalties === undefined) profile.status.deathPenalties = 0;

    let justDied = false;

    if (p.isDead) {
      justDied = true;
      deathLogs.push(`☠️ **${p.name}** ha MUERTO. Su ficha queda archivada en el sistema.`);
    } else if (p.hp <= 0 && !p.escaped) {
      profile.status.deathPenalties += 1;
      
      if (profile.status.deathPenalties >= 3) {
        p.isDead = true;
        justDied = true;
        deathLogs.push(`☠️ **${p.name}** no soportó un trauma biológico más y ha MUERTO definitivamente.`);
      } else {
        profile.status.maxHp -= 10;
        profile.status.hp = 1;
        p.hp = 1;
        p.maxHp = profile.status.maxHp;
        deathLogs.push(`⚠️ **${p.name}** fue estabilizado por biotecnología local, pero pierde **-10 de Salud Máxima** permanente por trauma.`);
        
        // 📡 REGISTRAR EN EL RADAR: Inconsciente
        lootHandler.registerBody(p.id, profile.nombre, 'unconscious', combat.message.channelId);
      }
    } else {
      profile.status.hp = p.hp;
      // 📡 QUITAR DEL RADAR: Despertó / Sigue vivo
      lootHandler.removeBody(p.id);
    }

    let tag = `\u001b[32m[${Math.floor(Math.max(0, p.hp))}/${p.maxHp} HP]\u001b[0m`; 
    if (p.isDead) tag = `\u001b[31m[FALLECIDO]\u001b[0m`; 
    else if (p.hp <= 0) tag = `\u001b[31m[INCAPACITADO]\u001b[0m`; 
    else if (p.escaped) tag = `\u001b[34m[ESCAPÓ ILESO]\u001b[0m`; 

    statusPlayers += `\`\`\`ansi\n${p.name.padEnd(15)} : ${tag}\n\`\`\``;

    if (justDied) {
      // 🔥 DELEGAMOS LA MUERTE AL NUEVO SERVICIO 🔥
      await deathService.processDeath(
        p.id, 
        profile, 
        "Trauma Severo en Combate", 
        combat.message.channel, 
        combat.message.client
      );
    } else {
      // Guardado normal si sobrevivió
      updateProfile(p.id, { 
        status: profile.status, 
        inventory: profile.inventory, 
        mags: p.mags,
        isDead: false 
      });
    }
  }

  embed.addFields({ name: '📊 INFORME MÉDICO', value: statusPlayers });

  if (deathLogs.length > 0) {
    embed.addFields({ name: '🚨 CONSECUENCIAS CLÍNICAS', value: deathLogs.join('\n') });
  }

  if (combat.lastPingMsgId) {
     try {
       const oldPing = await combat.message.channel.messages.fetch(combat.lastPingMsgId);
       if (oldPing && oldPing.deletable) await oldPing.delete();
     } catch(e) {}
  }

  await combat.message.channel.send({ embeds: [embed] });

  setTimeout(() => {
    engine.activeCombats.delete(combat.id);
  }, 5000);
}

module.exports = handleCombatInteraction;
module.exports.renderCombat = renderCombat;
module.exports.arrancarCombate = arrancarCombate;