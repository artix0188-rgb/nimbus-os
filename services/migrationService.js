// ---------------------------------------------------------------------------
// HELPERS INTERNOS
// ---------------------------------------------------------------------------
function generarUUIDPatch() {
  return 'item-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// MOTOR DE MIGRACIÓN
// ---------------------------------------------------------------------------
function migrateProfiles() {
  // 🔥 BLINDAJE ABSOLUTO: Importamos el objeto completo sin destrozarlo
  const dbUtils = require('../utils/db');
  
  // Verificación de seguridad por si Node.js hace cosas raras en la caché
  if (!dbUtils || typeof dbUtils.loadDB !== 'function') {
    console.error('❌ [N-OS ERROR CRÍTICO]: dbUtils.loadDB no es una función. El módulo db.js no se está exportando correctamente.');
    return;
  }

  // Llamamos a la función directamente desde el objeto utilitario
  const db = dbUtils.loadDB(); 
  if (!db) return;

  let migrationCount = 0;
  let itemsPatched = 0;

  for (const userId in db) {
    const profile = db[userId];
    let changed = false;

    // 1. REPARACIÓN DE ESTRUCTURAS BASE
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

    // 2. PARCHEO DE OBJETOS VIEJOS (Sin UUID)
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

  // 3. GUARDADO Y REPORTE
  if (migrationCount > 0) {
    dbUtils.saveDB(db); // Guardamos usando el objeto utilitario
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