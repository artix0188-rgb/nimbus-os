// ---------------------------------------------------------------------------
// Funciones auxiliares internas
// ---------------------------------------------------------------------------
function generarUUIDPatch() {
  return 'item-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// Motor de migración y actualización de esquemas de datos
// ---------------------------------------------------------------------------
function migrateProfiles() {
  // Importación directa del módulo de base de datos para garantizar la integridad estructural
  const dbUtils = require('../utils/db');
  
  // Control de excepciones para prevenir fallos de resolución de módulos en el entorno de ejecución
  if (!dbUtils || typeof dbUtils.loadDB !== 'function') {
    console.error('❌ [N-OS ERROR CRÍTICO]: dbUtils.loadDB no es una función. El módulo db.js no se está exportando correctamente.');
    return;
  }

  // Invocación del método de carga mediante la referencia del objeto utilitario
  const db = dbUtils.loadDB(); 
  if (!db) return;

  let migrationCount = 0;
  let itemsPatched = 0;

  for (const userId in db) {
    const profile = db[userId];
    let changed = false;

    // Fase 1: Reparación y estandarización de estructuras de datos fundamentales
    if (!profile.inventory || !Array.isArray(profile.inventory)) {
      profile.inventory = [];
      changed = true;
    }

    if (!profile.equipment || typeof profile.equipment !== 'object') {
      profile.equipment = {};
      changed = true;
    }

    if (!profile.status) {
      profile.status = { salud: 100, radiacion: 0, hambre: 100, sed: 100, ap: 0 };
      changed = true;
    }

    if (!profile.status.stats) {
      profile.status.stats = { fuerza: 1, destreza: 1, percepcion: 1, ingenio: 1, temple: 1 };
      changed = true;
    }

    // Fase 2: Actualización de entidades heredadas (Asignación de identificadores únicos)
    profile.inventory.forEach(item => {
      if (!item.uid) {
        item.uid = generarUUIDPatch();
        changed = true;
        itemsPatched++;
      }
    });

    if (changed) {
      migrationCount++;
    }
  }

  // Fase 3: Persistencia de datos y emisión de reporte de migración
  if (migrationCount > 0) {
    dbUtils.saveDB(db); 
    console.log('──────────────────────────────────────────────────');
    console.log(`✅ [N-OS // MIGRACIÓN]: Base de datos actualizada.`);
    console.log(`> Fichas curadas: ${migrationCount}`);
    console.log(`> Objetos parcheados con UUID: ${itemsPatched}`);
    console.log('──────────────────────────────────────────────────');
  } else {
    console.log('✅ [N-OS // MIGRACIÓN]: Base de datos estructurada y al día.');
  }
}

module.exports = { migrateProfiles };