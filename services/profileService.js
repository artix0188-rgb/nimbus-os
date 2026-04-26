// ============================================================================
// PLANTILLA ESTRUCTURAL BASE
// ============================================================================
const DEFAULT_PROFILE = {
  nombre: 'Usuario',
  edad: 18,
  sexo: 'N/A',
  nacionalidad: 'Desconocido',
  bio: 'Sin biografía',
  foto: 'https://i.imgur.com/HifVRqT.jpg',
  status: {
    hp: 100, maxHp: 100, radiacion: 0, ap: 0, hambre: 100, sed: 100, 
    stats: { fuerza: 1, destreza: 1, percepcion: 1, ingenio: 1, temple: 1 },
    estados: { sangrado: false, toxicidad: false } // Integración de parámetros avanzados de supervivencia
  },
  inventory: [],
  equipment: {},
  mags: {} 
};

// ============================================================================
// RUTINA DE NORMALIZACIÓN DE DATOS
// ============================================================================
function normalizarPerfil(userId, profileData, database) {
  let modificado = false;

  for (const key in DEFAULT_PROFILE) {
    if (profileData[key] === undefined) {
      if (typeof DEFAULT_PROFILE[key] === 'object' && !Array.isArray(DEFAULT_PROFILE[key])) {
        profileData[key] = { ...DEFAULT_PROFILE[key] };
      } else if (Array.isArray(DEFAULT_PROFILE[key])) {
        profileData[key] = [...DEFAULT_PROFILE[key]];
      } else {
        profileData[key] = DEFAULT_PROFILE[key];
      }
      modificado = true;
    }
  }

  if (profileData.status) {
    for (const statKey in DEFAULT_PROFILE.status) {
      if (profileData.status[statKey] === undefined) {
        if (typeof DEFAULT_PROFILE.status[statKey] === 'object') {
          profileData.status[statKey] = { ...DEFAULT_PROFILE.status[statKey] };
        } else {
          profileData.status[statKey] = DEFAULT_PROFILE.status[statKey];
        }
        modificado = true;
      }
    }
    // Depuración de variables descontinuadas
    if (profileData.status.salud !== undefined) {
      delete profileData.status.salud;
      modificado = true;
    }

    // Normalización de estructuras anidadas para prevención de fallos críticos
    if (profileData.status.stats) {
      for (const attrKey in DEFAULT_PROFILE.status.stats) {
        if (profileData.status.stats[attrKey] === undefined) {
          profileData.status.stats[attrKey] = DEFAULT_PROFILE.status.stats[attrKey];
          modificado = true;
        }
      }
    }
    
    // Adaptación retrospectiva de estados alterados en registros previos
    if (profileData.status.estados) {
      for (const estadoKey in DEFAULT_PROFILE.status.estados) {
        if (profileData.status.estados[estadoKey] === undefined) {
          profileData.status.estados[estadoKey] = DEFAULT_PROFILE.status.estados[estadoKey];
          modificado = true;
        }
      }
    }
  }

  if (modificado) {
    profileData.updatedAt = Date.now();
    database[userId] = profileData;
    const { saveDB } = require('../utils/db');
    saveDB(database);
  }

  return profileData;
}

// ============================================================================
// MÉTODOS DE ACCESO Y MANIPULACIÓN DE DATOS
// ============================================================================

function getProfile(userId) {
  const { loadDB } = require('../utils/db');
  const database = loadDB();
  let profile = database[userId] || null;
  if (profile) profile = normalizarPerfil(userId, profile, database);
  return profile;
}

function createProfile(userId, data) {
  const { loadDB, saveDB, generarID } = require('../utils/db');
  const database = loadDB();
  if (database[userId]) throw new Error('El usuario ya tiene un perfil registrado');
  
  const systemID = data.systemID || generarID();
  const newProfile = {
    systemID,
    nombre: (data.nombre || DEFAULT_PROFILE.nombre).substring(0, 32),
    edad: Math.min(Math.max(parseInt(data.edad) || DEFAULT_PROFILE.edad, 18), 60),
    sexo: (data.sexo || DEFAULT_PROFILE.sexo).substring(0, 20),
    nacionalidad: (data.nacionalidad || DEFAULT_PROFILE.nacionalidad).substring(0, 50),
    bio: (data.bio || DEFAULT_PROFILE.bio).substring(0, 60),
    foto: data.foto || DEFAULT_PROFILE.foto,
    status: data.status || { ...DEFAULT_PROFILE.status },
    inventory: [], equipment: {}, mags: {},
    createdAt: Date.now(), updatedAt: Date.now()
  };

  database[userId] = newProfile;
  saveDB(database);
  return database[userId];
}

function updateProfile(userId, newData) {
  const { loadDB, saveDB } = require('../utils/db');
  const database = loadDB();
  
  // Corrección de estado: Reconstrucción estructural para entidades fallecidas
  if (!database[userId]) {
    database[userId] = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
    database[userId].createdAt = Date.now();
  }

  const sanitizedUpdates = {};
  if (newData.nombre !== undefined) sanitizedUpdates.nombre = String(newData.nombre).substring(0, 32);
  if (newData.edad !== undefined) sanitizedUpdates.edad = Math.min(Math.max(parseInt(newData.edad), 18), 60);
  if (newData.sexo !== undefined) sanitizedUpdates.sexo = String(newData.sexo).substring(0, 20);
  if (newData.nacionalidad !== undefined) sanitizedUpdates.nacionalidad = String(newData.nacionalidad).substring(0, 50);
  if (newData.bio !== undefined) sanitizedUpdates.bio = String(newData.bio).substring(0, 60);
  if (newData.foto !== undefined) { try { new URL(newData.foto); sanitizedUpdates.foto = newData.foto; } catch { } }
  if (newData.systemID !== undefined) sanitizedUpdates.systemID = String(newData.systemID).substring(0, 20);
  if (newData.isDead !== undefined) sanitizedUpdates.isDead = newData.isDead;
  
  // Corrección algorítmica: Fusión profunda (Deep Merge) de estadísticas y estados
  if (newData.status !== undefined && typeof newData.status === 'object') {
    sanitizedUpdates.status = { ...database[userId].status, ...newData.status };
    
    // Preservación de atributos inalterados durante la actualización sectorial
    if (newData.status.stats) {
      sanitizedUpdates.status.stats = { ...database[userId].status.stats, ...newData.status.stats };
    }
    // Prevención de sobrescritura accidental en la matriz de estados biológicos
    if (newData.status.estados) {
      sanitizedUpdates.status.estados = { ...database[userId].status.estados, ...newData.status.estados };
    }
  }

  if (newData.inventory !== undefined && Array.isArray(newData.inventory)) sanitizedUpdates.inventory = newData.inventory;
  if (newData.equipment !== undefined && typeof newData.equipment === 'object') sanitizedUpdates.equipment = newData.equipment;
  if (newData.mags !== undefined && typeof newData.mags === 'object') sanitizedUpdates.mags = newData.mags;

  sanitizedUpdates.updatedAt = Date.now();
  database[userId] = { ...database[userId], ...sanitizedUpdates };
  saveDB(database);
  return database[userId];
}

function deleteProfile(userId) {
  const { loadDB, saveDB } = require('../utils/db');
  const database = loadDB();
  if (!database[userId]) return false;
  delete database[userId];
  saveDB(database);
  return true;
}

function getAllProfiles() { 
  const { loadDB } = require('../utils/db');
  return loadDB(); 
}

function countProfiles() { 
  const { loadDB } = require('../utils/db');
  return Object.keys(loadDB()).length; 
}

function saveProfiles() {
  const { loadDB, saveDB } = require('../utils/db');
  saveDB(loadDB());
}

module.exports = { 
  getProfile, createProfile, updateProfile, deleteProfile, getAllProfiles, countProfiles, saveProfiles
};