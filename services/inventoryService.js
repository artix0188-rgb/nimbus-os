const { getProfile, updateProfile } = require('./profileService');
const itemsMaster = require('../data/items');

// Generador de UUID para ítems únicos
function generarItemUUID() {
  return 'item-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function calcularMaxSlots(userId) {
  const profile = getProfile(userId);
  if (!profile) return 3;

  const fuerza = profile.status?.stats?.fuerza ?? 1;
  let base = 3;

  if (fuerza <= 0) base = 3;
  else if (fuerza <= 3) base = 4;
  else if (fuerza <= 6) base = 5;
  else if (fuerza <= 9) base = 6;
  else if (fuerza >= 10) base = 7;

  // Solo se suma si está en profile.equipment.mochila
  const mochila = profile.equipment?.mochila;
  if (mochila) {
    const data = itemsMaster[mochila.itemId];
    base += (data?.bonus || 0);
  }

  return base;
}

function calcularSlotsOcupados(userId) {
  const profile = getProfile(userId);
  if (!profile || !profile.inventory) return 0;

  let ocupados = 0;
  profile.inventory.forEach(item => {
    const data = itemsMaster[item.itemId];
    if (data) {
      // Las armaduras ocupan slots aquí. Si se equipan, salen del array inventory.
      ocupados += Math.ceil(item.cantidad / data.stack) * data.slots;
    }
  });

  return ocupados;
}

// ── LÓGICA DE EQUIPAMIENTO Y ESTADÍSTICAS ──

function aplicarBuffs(statsActuales, itemStats) {
  if (!itemStats) return statsActuales;
  const nuevasStats = { ...statsActuales };
  for (const [stat, valor] of Object.entries(itemStats)) {
    nuevasStats[stat] = (nuevasStats[stat] || 0) + valor;
  }
  return nuevasStats;
}

function removerBuffs(statsActuales, itemStats) {
  if (!itemStats) return statsActuales;
  const nuevasStats = { ...statsActuales };
  for (const [stat, valor] of Object.entries(itemStats)) {
    nuevasStats[stat] = (nuevasStats[stat] || 0) - valor;
  }
  return nuevasStats;
}

function equiparObjeto(userId, itemUid, slotOverride = null) {
  const profile = getProfile(userId);
  
  // 🛡️ PARCHE DE SEGURIDAD PARA FICHAS VIEJAS
  if (!profile.inventory) profile.inventory = [];
  if (!profile.equipment) profile.equipment = {};
  if (!profile.status) profile.status = {};
  if (!profile.status.stats) profile.status.stats = { fuerza: 1, destreza: 1, percepcion: 1, ingenio: 1, temple: 1 };

  const invIndex = profile.inventory.findIndex(i => i.uid === itemUid);
  if (invIndex === -1) return { success: false, msg: "Objeto no encontrado en el inventario." };

  const itemToEquip = profile.inventory[invIndex];
  const itemData = itemsMaster[itemToEquip.itemId];

  if (!itemData) return { success: false, msg: "El objeto está corrupto o ya no existe." };

  // Definimos la ranura final: Si se envía un Override (ej: 'arma_pri'), usamos ese.
  // Si no, usamos el tipo base del objeto (ej: 'cabeza', 'torso').
  const targetSlot = slotOverride || itemData.type;

  // 1. Si ya hay algo equipado en ese slot, lo desequipamos primero
  const currentEquipped = profile.equipment[targetSlot];
  if (currentEquipped) {
    // Revertir stats del objeto viejo
    const oldData = itemsMaster[currentEquipped.itemId];
    if (oldData && oldData.stats) {
      profile.status.stats = removerBuffs(profile.status.stats, oldData.stats);
    }
    // Devolver al inventario
    profile.inventory.push(currentEquipped);
  }

  // 2. Equipar el nuevo objeto
  profile.equipment[targetSlot] = itemToEquip;
  if (itemData.stats) {
    profile.status.stats = aplicarBuffs(profile.status.stats, itemData.stats);
  }
  
  // Remover del inventario libre
  profile.inventory.splice(invIndex, 1);

  // Validar capacidad (por si al quitarse una mochila o perder fuerza, se excede de peso)
  updateProfile(userId, { inventory: profile.inventory, equipment: profile.equipment, status: profile.status });
  return { success: true, msg: `Te has equipado: **${itemData.name}**.` };
}

function desequiparObjeto(userId, slotType) {
  const profile = getProfile(userId);
  
  // 🛡️ PARCHE DE SEGURIDAD PARA FICHAS VIEJAS
  if (!profile.inventory) profile.inventory = [];
  if (!profile.equipment) profile.equipment = {};
  if (!profile.status) profile.status = {};
  if (!profile.status.stats) profile.status.stats = { fuerza: 1, destreza: 1, percepcion: 1, ingenio: 1, temple: 1 };

  const itemEquipped = profile.equipment[slotType];
  
  if (!itemEquipped) return { success: false, msg: "No tienes nada equipado ahí." };

  const itemData = itemsMaster[itemEquipped.itemId];
  
  // Limpieza en caso de que el objeto haya sido eliminado del código fuente
  if (!itemData) {
    delete profile.equipment[slotType];
    updateProfile(userId, { equipment: profile.equipment });
    return { success: true, msg: "Objeto obsoleto removido." };
  }

  const maxSlots = calcularMaxSlots(userId);
  const ocupados = calcularSlotsOcupados(userId);

  // Verificación crítica: Si se quita la mochila o armadura pesada, ¿tiene espacio para guardarla en el inventario?
  let futuraCapacidad = maxSlots;
  if (slotType === 'mochila') futuraCapacidad -= (itemData.bonus || 0);

  if (ocupados + itemData.slots > futuraCapacidad) {
    return { success: false, msg: `⚠️ No tienes espacio suficiente (${itemData.slots} slots) en el inventario para desequipar esto.` };
  }

  // Desequipar
  if (itemData.stats) {
    profile.status.stats = removerBuffs(profile.status.stats, itemData.stats);
  }
  
  profile.inventory.push(itemEquipped);
  delete profile.equipment[slotType];

  updateProfile(userId, { inventory: profile.inventory, equipment: profile.equipment, status: profile.status });
  return { success: true, msg: `Te has desequipado: **${itemData.name}**.` };
}

module.exports = {
  itemsMaster,
  generarItemUUID,
  calcularMaxSlots,
  calcularSlotsOcupados,
  equiparObjeto,
  desequiparObjeto
};