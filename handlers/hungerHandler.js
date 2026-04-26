const { updateProfile, getProfile } = require('../services/profileService');
const { loadDB } = require('../utils/db');
const { processDeath } = require('../services/deathService'); 

// ===========================================================================
// Parámetros de configuración (Ajustables mediante variables de entorno)
// ===========================================================================

function getConfig() {
  return {
    hungerDecay:  parseFloat(process.env.HUNGER_DECAY  ?? '1'),    // Porcentaje de degradación metabólica
    thirstDecay:  parseFloat(process.env.THIRST_DECAY  ?? '1.5'),  // Porcentaje de degradación de hidratación
    categoryId:   process.env.RP_CATEGORY_ID ?? '1495662455647506523',
    healthDrain:  parseFloat(process.env.CRITICAL_HEALTH_DRAIN ?? '5')
  };
}

// ===========================================================================
// Mapeo e indexación de perfiles proxy (Tupperbox/Webhooks)
// ===========================================================================
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

// ===========================================================================
// Gestión de alertas biométricas (Nutrición e Hidratación)
// ===========================================================================
const THRESHOLDS = [75, 50, 25, 5];

function getThresholdAlert(stat, prev, current) {
  const label     = stat === 'hambre' ? '🍖 HAMBRE' : '💧 SED';
  const labelLow  = stat === 'hambre' ? 'comida' : 'agua';

  for (const threshold of THRESHOLDS) {
    if (prev > threshold && current <= threshold) {
      if (threshold === 75) {
        return `⚠️ **[N-OS] — ${label}**: Tus niveles han bajado al **${Math.floor(current)}%**. Considera buscar ${labelLow} pronto.`;
      } else if (threshold === 50) {
        return `🟠 **[N-OS] — ${label}**: Nivel al **${Math.floor(current)}%**. Empieza a sentir la necesidad de ${labelLow}.`;
      } else if (threshold === 25) {
        return `🔴 **[N-OS] — ${label}**: ¡Nivel crítico al **${Math.floor(current)}%**! Necesitas ${labelLow} urgentemente.`;
      } else if (threshold === 5) {
        return `☠️ **[N-OS] — ${label}**: ¡**ZONA DE PELIGRO** — ${Math.floor(current)}%! Sin ${labelLow} perderás vitalidad con cada movimiento.`;
      }
    }
  }
  return null;
}

// ===========================================================================
// Controlador principal del motor de desgaste vital
// ===========================================================================

module.exports = async function handleHunger(message, client) {
  const config = getConfig();

  if (message.channel?.parentId !== config.categoryId &&
      message.channel?.id       !== config.categoryId) return;

  if (!message.webhookId) return;
  if (message.applicationId) return;

  const userId = findUserByProxy(message.author.username);
  if (!userId) return;

  const profile = getProfile(userId);
  if (!profile) return;

  if (profile.isDead) return;
  if (profile.status?.paused) return;

  // 1. Extracción del estado vital del registro
  const prevHambre = profile.status?.hambre ?? 100;
  const prevSed    = profile.status?.sed    ?? 100;
  const prevHp     = profile.status?.hp     ?? 100;
  
  const estados    = profile.status?.estados || { sangrado: false, toxicidad: false };
  const radiacion  = profile.status?.radiacion || 0;
  const maxHpBase  = profile.status?.maxHp || 100;

  // 2. Cálculo matemático del desgaste fisiológico
  const actualThirstDecay = estados.toxicidad ? (config.thirstDecay * 4) : config.thirstDecay;
  
  const newHambre = Math.max(0, prevHambre - config.hungerDecay);
  const newSed    = Math.max(0, prevSed    - actualThirstDecay);

  const hambreCritica = newHambre <= 5;
  const sedCritica    = newSed    <= 5;
  const enZonaCritica = hambreCritica || sedCritica;

  let newHp = prevHp;
  let avisoHpCritico = null;
  const motivosDano = [];

  // 3. Procesamiento de daño estructural por deficiencias y hemorragia
  if (enZonaCritica) {
    newHp = Math.max(0, newHp - config.healthDrain);
    if (hambreCritica) motivosDano.push('inanición');
    if (sedCritica)    motivosDano.push('deshidratación');
  }

  if (estados.sangrado) {
    newHp = Math.max(0, newHp - 3); // Aplicación de ratio de pérdida de sangre por evento
    motivosDano.push('hemorragia activa');
  }

  // 4. Aplicación del limitador máximo de HP en base al envenenamiento por radiación
  const topeVidaReal = Math.max(1, maxHpBase - radiacion);
  if (newHp > topeVidaReal) {
    newHp = topeVidaReal;
  }

  // 5. Compilación de advertencias sistémicas
  if (motivosDano.length > 0) {
    const yaAvisado = profile.status?.criticalWarned ?? false;
    if (!yaAvisado && newHp > 0) {
      avisoHpCritico = 
        `💀 **[N-OS] — ALERTA VITAL**: Tu sistema detecta peligro por **${motivosDano.join(', ')}**. ` +
        `Estás perdiendo vitalidad rápidamente. ¡Trátate de inmediato!`;
    }
  }

  // 6. Almacenamiento del estado modificado
  const newStatus = {
    ...profile.status,
    hambre: newHambre,
    sed:    newSed,
    hp:     newHp,
    criticalWarned: (motivosDano.length > 0)
      ? (profile.status?.criticalWarned ?? false) || (avisoHpCritico !== null)
      : false
  };

  // 7. Verificación de condición terminal (Muerte)
  if (newHp <= 0 && prevHp > 0) {
    let causaMuerte = 'Fallo Sistémico Múltiple';
    
    if (estados.sangrado && !enZonaCritica) causaMuerte = 'Choque Hipovolémico (Desangramiento)';
    else if (hambreCritica && sedCritica) causaMuerte = 'Inanición y Deshidratación Severa';
    else if (hambreCritica) causaMuerte = 'Inanición';
    else if (sedCritica) causaMuerte = 'Deshidratación Severa';

    await processDeath(userId, profile, causaMuerte, message.channel, client);
    return; // Interrupción del ciclo, el sujeto ha perecido.
  }

  // Guardado persistente asumiendo la supervivencia del operador
  updateProfile(userId, { status: newStatus });

  // 8. Transmisión del informe de estatus
  const avisos = [];

  const alertHambre = getThresholdAlert('hambre', prevHambre, newHambre);
  if (alertHambre) avisos.push(alertHambre);

  const alertSed = getThresholdAlert('sed', prevSed, newSed);
  if (alertSed) avisos.push(alertSed);

  // Alerta condicional por exposición reciente a toxicidad
  if (estados.toxicidad && prevSed > 75 && newSed <= 75) {
      avisos.push(`☣️ **[N-OS] — ANOMALÍA BIOLÓGICA**: Tu ritmo de deshidratación es anormalmente alto. Posible cuadro febril detectado.`);
  }

  if (avisoHpCritico) avisos.push(avisoHpCritico);

  if (avisos.length === 0) return;

  try {
    await message.channel.send(`<@${userId}>\n${avisos.join('\n\n')}`);
  } catch (err) {
    console.error('[N-OS] Falla en la transmisión de informe biométrico:', err);
  }
};