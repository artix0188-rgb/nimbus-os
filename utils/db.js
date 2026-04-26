const fs = require('fs');
const path = require('path');

// 🔥 EL BLINDAJE DEFINITIVO (LA BALA DE PLATA) 🔥
module.exports = {
  loadDB,
  saveDB,
  saveDBSync,
  generarID,
  createBackup,
  loadLatestBackup,
  restoreFromBackup,
  listBackups,
  cleanOldBackups,
  verifyIntegrity,
  getStats
};

const dbPath = path.join(__dirname, '../data/profiles.json');
const backupPath = path.join(__dirname, '../data/backups/');

// ============================================================================
// SISTEMA DE LOCK PARA PREVENIR RACE CONDITIONS
// ============================================================================
let isWriting = false;
const writeQueue = [];

/**
 * Procesa la cola de escritura de forma secuencial
 */
async function processWriteQueue() {
  if (isWriting || writeQueue.length === 0) return;
  
  isWriting = true;
  const { data, resolve, reject } = writeQueue.shift();
  
  try {
    await writeToFile(data);
    resolve(true);
  } catch (error) {
    reject(error);
  } finally {
    isWriting = false;
    processWriteQueue(); // Procesar siguiente en cola
  }
}

/**
 * Escribe al archivo de forma segura
 */
function writeToFile(data) {
  return new Promise((resolve, reject) => {
    try {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Validar que data sea un objeto
      if (typeof data !== 'object' || data === null) {
        throw new Error('Los datos deben ser un objeto válido');
      }
      
      const jsonString = JSON.stringify(data, null, 2);
      
      // Escribir de forma atómica (primero a temp, luego rename)
      const tempPath = dbPath + '.tmp';
      fs.writeFileSync(tempPath, jsonString, 'utf8');
      fs.renameSync(tempPath, dbPath);
      
      resolve(true);
    } catch (error) {
      console.error('❌ Error al escribir DB:', error);
      reject(error);
    }
  });
}

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

function loadDB() {
  if (!fs.existsSync(dbPath)) {
    console.log('ℹ️ No se encontró DB, creando nueva...');
    return {};
  }
  
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    
    // Validar que no esté vacío
    if (!data || data.trim() === '') {
      console.warn('⚠️ DB vacía, retornando objeto vacío');
      return {};
    }
    
    const parsed = JSON.parse(data);
    
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('DB corrupta: no es un objeto válido');
    }
    
    return parsed;
    
  } catch (error) {
    console.error('❌ Error al cargar DB:', error.message);
    const backup = loadLatestBackup();
    if (backup) {
      console.log('✅ DB restaurada desde backup');
      return backup;
    }
    return {};
  }
}

function saveDB(data) {
  return new Promise((resolve, reject) => {
    if (typeof data !== 'object' || data === null) {
      reject(new Error('Datos inválidos: debe ser un objeto'));
      return;
    }
    writeQueue.push({ data, resolve, reject });
    processWriteQueue();
  });
}

function saveDBSync(data) {
  try {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Error al guardar DB:', error);
    return false;
  }
}

function generarID() {
  const db = loadDB();
  const existingIDs = new Set(Object.values(db).map(profile => profile.systemID).filter(Boolean));
  
  let nuevoID;
  let intentos = 0;
  const maxIntentos = 100;
  
  do {
    const longitud = Math.floor(Math.random() * 2) + 10;
    let resultado = '';
    
    for (let i = 0; i < longitud; i++) {
      if (i === 0) resultado += Math.floor(Math.random() * 9) + 1;
      else resultado += Math.floor(Math.random() * 10);
    }
    nuevoID = resultado;
    intentos++;
    if (intentos >= maxIntentos) throw new Error('Error al generar ID único');
  } while (existingIDs.has(nuevoID));
  
  return nuevoID;
}

// ============================================================================
// SISTEMA DE BACKUPS
// ============================================================================

function createBackup() {
  try {
    if (!fs.existsSync(dbPath)) return false;
    if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupPath, `backup_${timestamp}.json`);
    
    fs.copyFileSync(dbPath, backupFile);
    cleanOldBackups(10);
    
    console.log(`✅ Backup creado: ${backupFile}`);
    return true;
  } catch (error) {
    console.error('❌ Error al crear backup:', error);
    return false;
  }
}

function cleanOldBackups(keepCount = 10) {
  try {
    if (!fs.existsSync(backupPath)) return;
    
    const files = fs.readdirSync(backupPath)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(backupPath, f),
        time: fs.statSync(path.join(backupPath, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    files.slice(keepCount).forEach(file => {
      fs.unlinkSync(file.path);
      console.log(`🗑️ Backup antiguo eliminado: ${file.name}`);
    });
  } catch (error) {
    console.error('❌ Error limpiando backups:', error);
  }
}

function loadLatestBackup() {
  try {
    if (!fs.existsSync(backupPath)) return null;
    const files = fs.readdirSync(backupPath)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(backupPath, f),
        time: fs.statSync(path.join(backupPath, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    if (files.length === 0) return null;
    return JSON.parse(fs.readFileSync(files[0].path, 'utf8'));
  } catch (error) {
    console.error('❌ Error cargando backup:', error);
    return null;
  }
}

function restoreFromBackup(backupName) {
  try {
    const backupFile = path.join(backupPath, backupName);
    if (!fs.existsSync(backupFile)) throw new Error(`Backup no encontrado: ${backupName}`);
    
    if (fs.existsSync(dbPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(dbPath, dbPath + `.before-restore-${timestamp}`);
    }
    fs.copyFileSync(backupFile, dbPath);
    console.log(`✅ DB restaurada desde: ${backupName}`);
    return true;
  } catch (error) {
    console.error('❌ Error restaurando backup:', error);
    return false;
  }
}

function listBackups() {
  try {
    if (!fs.existsSync(backupPath)) return [];
    return fs.readdirSync(backupPath)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        size: fs.statSync(path.join(backupPath, f)).size,
        date: fs.statSync(path.join(backupPath, f)).mtime
      }))
      .sort((a, b) => b.date - a.date);
  } catch (error) {
    console.error('❌ Error listando backups:', error);
    return [];
  }
}

// ============================================================================
// UTILIDADES ADICIONALES
// ============================================================================

function verifyIntegrity() {
  try {
    const db = loadDB();
    if (typeof db !== 'object' || db === null) return { valid: false, error: 'DB no es un objeto válido' };
    
    for (const [userId, profile] of Object.entries(db)) {
      if (!/^\d+$/.test(userId)) return { valid: false, error: `UserID inválido: ${userId}` };
      if (!profile.systemID) return { valid: false, error: `Perfil sin systemID: ${userId}` };
    }
    return { valid: true, profileCount: Object.keys(db).length };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

function getStats() {
  try {
    const db = loadDB();
    const stats = fs.statSync(dbPath);
    return {
      profileCount: Object.keys(db).length,
      fileSize: stats.size,
      lastModified: stats.mtime,
      backupCount: listBackups().length
    };
  } catch (error) {
    return null;
  }
}