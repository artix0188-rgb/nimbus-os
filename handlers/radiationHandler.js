const { updateProfile, getProfile } = require('../services/profileService');
const { loadDB } = require('../utils/db');
const { processDeath } = require('../services/deathService'); 
const { getCurrentWeather } = require('../services/weatherService');

// ---------------------------------------------------------------------------
// Indexación de perfiles proxy (Idéntico a hungerHandler)
// ---------------------------------------------------------------------------
function findUserByProxy(webhookUsername) {
  const db = loadDB();
  const nameLower = webhookUsername.toLowerCase().trim();

  for (const [userId, profile] of Object.entries(db)) {
    if (!Array.isArray(profile.proxies)) continue;
    if (profile.proxies.map(p => p.toLowerCase()).includes(nameLower)) {
      return userId;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Controlador principal de degradación por radiación ambiental
// ---------------------------------------------------------------------------
module.exports = async function handleRadiation(message, client) {
  const categoryId = process.env.RP_CATEGORY_ID || '1495662455647506523';
  
  // Restricción a canales de RP
  if (message.channel?.parentId !== categoryId && message.channel?.id !== categoryId) return;

  // Ejecución exclusiva sobre mensajes de Webhooks (Tupperbox)
  if (!message.webhookId || message.applicationId) return;

  const userId = findUserByProxy(message.author.username);
  if (!userId) return;

  const profile = getProfile(userId);
  if (!profile || profile.isDead || profile.status?.paused) return;

  // Consulta del clima activo
  const clima = getCurrentWeather();
  if (!clima || clima.rad <= 0) return; // Clima seguro, no hay impacto radiactivo

  // Extracción de métricas vitales
  const prevRad = profile.status?.radiacion ?? 0;
  let prevHp = profile.status?.hp ?? 100;
  const maxHpBase = profile.status?.maxHp ?? 100;

  // Cálculo del incremento de radiación
  let newRad = prevRad + clima.rad;
  if (newRad > 100) newRad = 100;

  // Cálculo del límite vital: El HP máximo desciende según el % de radiación
  const topeVidaReal = Math.max(1, maxHpBase - newRad);
  let newHp = prevHp;
  
  // Ajuste forzoso si la vida actual supera el nuevo límite biológico
  if (newHp > topeVidaReal) {
    newHp = topeVidaReal;
  }

  // Sincronización de estado
  const newStatus = {
    ...profile.status,
    radiacion: newRad,
    hp: newHp
  };

  // Evento terminal: 100% de irradiación causa la muerte inmediata
  if (newRad >= 100 && prevHp > 0) {
    await processDeath(userId, profile, 'Síndrome de Irradiación Aguda (100% Rad)', message.channel, client);
    return;
  }

  updateProfile(userId, { status: newStatus });

  // Emisión de alertas tácticas en el canal
  if (newRad >= 75 && prevRad < 75) {
    await message.channel.send(`☢️ **[N-OS // ALERTA VITAL]**: <@${userId}>, tus lecturas de radiación son críticas (**${Math.floor(newRad)}%**). Riesgo inminente de fallo sistémico.`);
  } else if (newRad >= 50 && prevRad < 50) {
    await message.channel.send(`⚠️ **[N-OS // PRECAUCIÓN]**: <@${userId}>, contaminación radiactiva severa (**${Math.floor(newRad)}%**). Requiere administración de RadAway.`);
  } else if (newRad >= 25 && prevRad < 25) {
    await message.channel.send(`⚠️ **[N-OS]**: <@${userId}>, la exposición radiactiva está comenzando a comprometer tu salud celular (**${Math.floor(newRad)}%**).`);
  }
};