const { getProfile, updateProfile } = require('./profileService');
const itemsMaster = require('../data/items');

// Generador de Identificadores Únicos Universales (UUID) para suministros
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

  // Condición de bonificación: Aplicable únicamente si la mochila se encuentra en la ranura de equipamiento
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
      // Cálculo de volumen volumétrico. El equipamiento activo se excluye de la carga estructural del inventario.
      ocupados += Math.ceil(item.cantidad / data.stack) * data.slots;
    }
  });

  return ocupados;
}

// ===========================================================================
// RUTINAS DE GESTIÓN DE EQUIPAMIENTO Y MODIFICADORES DE ATRIBUTOS
// ===========================================================================

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
  
  // Protocolo de seguridad: Inicialización de estructuras ausentes en registros heredados
  if (!profile.inventory) profile.inventory = [];
  if (!profile.equipment) profile.equipment = {};
  if (!profile.status) profile.status = {};
  if (!profile.status.stats) profile.status.stats = { fuerza: 1, destreza: 1, percepcion: 1, ingenio: 1, temple: 1 };

  const invIndex = profile.inventory.findIndex(i => i.uid === itemUid);
  if (invIndex === -1) return { success: false, msg: "Objeto no encontrado en el inventario." };

  const itemToEquip = profile.inventory[invIndex];
  const itemData = itemsMaster[itemToEquip.itemId];

  if (!itemData) return { success: false, msg: "El objeto está corrupto o ya no existe." };

  // Asignación de ranura de equipamiento: Prioridad a directivas explícitas (Override)
  // Fallback: Asignación basada en la taxonomía estándar del objeto
  const targetSlot = slotOverride || itemData.type;

  // Paso 1: Procedimiento de desequipamiento previo en la ranura objetivo
  const currentEquipped = profile.equipment[targetSlot];
  if (currentEquipped) {
    // Reversión de modificadores de atributos del equipamiento anterior
    const oldData = itemsMaster[currentEquipped.itemId];
    if (oldData && oldData.stats) {
      profile.status.stats = removerBuffs(profile.status.stats, oldData.stats);
    }
    // Retorno del suministro al contenedor principal (Inventario)
    profile.inventory.push(currentEquipped);
  }

  // Paso 2: Fijación del nuevo equipamiento
  profile.equipment[targetSlot] = itemToEquip;
  if (itemData.stats) {
    profile.status.stats = aplicarBuffs(profile.status.stats, itemData.stats);
  }
  
  // Extracción del suministro del contenedor principal
  profile.inventory.splice(invIndex, 1);

  // Validación de carga estructural (Prevención de sobrecarga por penalizaciones o retiro de soporte de carga)
  updateProfile(userId, { inventory: profile.inventory, equipment: profile.equipment, status: profile.status });
  return { success: true, msg: `Te has equipado: **${itemData.name}**.` };
}

function desequiparObjeto(userId, slotType) {
  const profile = getProfile(userId);
  
  // Protocolo de seguridad: Inicialización de estructuras ausentes en registros heredados
  if (!profile.inventory) profile.inventory = [];
  if (!profile.equipment) profile.equipment = {};
  if (!profile.status) profile.status = {};
  if (!profile.status.stats) profile.status.stats = { fuerza: 1, destreza: 1, percepcion: 1, ingenio: 1, temple: 1 };

  const itemEquipped = profile.equipment[slotType];
  
  if (!itemEquipped) return { success: false, msg: "No tienes nada equipado ahí." };

  const itemData = itemsMaster[itemEquipped.itemId];
  
  // Rutina de saneamiento: Manejo de entidades de datos huérfanas o eliminadas del catálogo
  if (!itemData) {
    delete profile.equipment[slotType];
    updateProfile(userId, { equipment: profile.equipment });
    return { success: true, msg: "Objeto obsoleto removido." };
  }

  const maxSlots = calcularMaxSlots(userId);
  const ocupados = calcularSlotsOcupados(userId);

  // Verificación de viabilidad física: Evaluación de capacidad de almacenamiento antes de la transferencia
  let futuraCapacidad = maxSlots;
  if (slotType === 'mochila') futuraCapacidad -= (itemData.bonus || 0);

  if (ocupados + itemData.slots > futuraCapacidad) {
    return { success: false, msg: `⚠️ No tienes espacio suficiente (${itemData.slots} slots) en el inventario para desequipar esto.` };
  }

  // Ejecución de la secuencia de desequipamiento
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