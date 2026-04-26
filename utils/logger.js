const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

/**
 * Sistema de registro de eventos (Logging) avanzado para la arquitectura NIMBUS-OS
 * Especificaciones técnicas:
 * - Emisión dual: Consola local y canal designado en Discord.
 * - Limitación de tasa (Rate limiting) automática.
 * - Validación estricta de permisos de transmisión.
 * - Jerarquía de niveles de registro configurables.
 * - Cola de procesamiento de mensajes aislada por instancia (Scoped).
 * - Prevención de desbordamiento de la API de Discord (Límite de 2000 caracteres).
 * - Extracción y parseo automático de trazas en objetos Error.
 */

// ============================================================================
// CONFIGURACIÓN DE PARÁMETROS
// ============================================================================

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const CONFIG = {
  minLevel: process.env.DEBUG === 'true' ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO,
  discordEnabled: true,
  rateLimit: {
    maxMessages: 5,      // Límite máximo de mensajes por ciclo
    perSeconds: 10,      // Ventana de tiempo en segundos
    queue: []            // Registro temporal de ejecuciones
  }
};

// ============================================================================
// MÓDULO DE LIMITACIÓN DE TASA (RATE LIMITING)
// ============================================================================

function checkRateLimit() {
  const now = Date.now();
  const { maxMessages, perSeconds, queue } = CONFIG.rateLimit;
  
  CONFIG.rateLimit.queue = queue.filter(
    timestamp => now - timestamp < perSeconds * 1000
  );
  
  if (CONFIG.rateLimit.queue.length >= maxMessages) {
    return false; // Umbral de envíos alcanzado
  }
  
  CONFIG.rateLimit.queue.push(now);
  return true;
}

// ============================================================================
// CONTROLADOR PRINCIPAL DE REGISTROS
// ============================================================================

module.exports = function createLogger(client) {
  const logChannelId = process.env.LOG_CHANNEL_ID;
  
  // Mejora estructural: Aislamiento de colas de mensajes por instancia del servicio
  const messageQueue = [];
  let isProcessingQueue = false;

  /**
   * Rutina asíncrona para el procesamiento de la cola de transmisión hacia Discord
   */
  async function processMessageQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (messageQueue.length > 0) {
      const payload = messageQueue.shift(); // Soporta estructuras de texto plano o incrustadas (Embeds)
      
      try {
        if (!checkRateLimit()) {
          messageQueue.unshift(payload);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        
        let channel = client.channels.cache.get(logChannelId);
        if (!channel) {
          channel = await client.channels.fetch(logChannelId).catch(() => null);
        }
        
        if (!channel) {
          console.error(`❌ Logger: Canal de logs no encontrado: ${logChannelId}`);
          break;
        }
        
        const permissions = channel.permissionsFor(client.user);
        if (!permissions || !permissions.has([
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ViewChannel
        ])) {
          console.error('❌ Logger: Sin permisos para enviar logs al canal');
          break;
        }
        
        // Ejecución de la transmisión de datos
        await channel.send(payload);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error('❌ Error enviando log a Discord:', error.message);
      }
    }
    
    isProcessingQueue = false;
  }

  /**
   * Transmisión segura de cargas útiles al canal de auditoría de Discord
   */
  async function sendToDiscord(payload, level) {
    if (!CONFIG.discordEnabled || !logChannelId || !client) return;
    if (level < CONFIG.minLevel) return;
    
    messageQueue.push(payload);
    
    processMessageQueue().catch(err => {
      console.error('Error procesando cola de logs:', err);
    });
  }
  
  /**
   * Estandarización de formato y extracción de metadatos para objetos de clase Error
   */
  function formatMessage(level, msgOrError) {
    const icons = {
      [LOG_LEVELS.DEBUG]: '🔍',
      [LOG_LEVELS.INFO]: 'ℹ️',
      [LOG_LEVELS.WARN]: '⚠️',
      [LOG_LEVELS.ERROR]: '❌'
    };
    
    const icon = icons[level] || 'ℹ️';
    const levelName = Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === level);
    
    // Optimización: Gestión estructurada de tipos de datos complejos y captura de trazas
    let textMessage = "";
    if (msgOrError instanceof Error) {
      textMessage = msgOrError.stack || msgOrError.message;
    } else if (typeof msgOrError === 'object') {
      textMessage = JSON.stringify(msgOrError, null, 2);
    } else {
      textMessage = String(msgOrError);
    }

    // Formateo para la salida estándar de consola
    const consoleOutput = `${icon} [${levelName}] ${textMessage}`;

    // Prevención de desbordamiento: Truncado a 1950 caracteres para evitar excepciones en la API de Discord
    const truncatedText = textMessage.length > 1950 
      ? textMessage.substring(0, 1950) + '... [TRUNCADO]' 
      : textMessage;

    // Mejora de visualización: Implementación de Embeds dedicados para niveles de criticidad ERROR y WARN
    let discordPayload;
    if (level === LOG_LEVELS.ERROR || level === LOG_LEVELS.WARN) {
      const color = level === LOG_LEVELS.ERROR ? 0xff0000 : 0xffaa00;
      const embed = new EmbedBuilder()
        .setTitle(`${icon} NIMBUS-OS // ${levelName}`)
        .setDescription(`\`\`\`js\n${truncatedText}\n\`\`\``)
        .setColor(color)
        .setTimestamp();
      discordPayload = { embeds: [embed] };
    } else {
      discordPayload = { content: `${icon} **NIMBUS-OS // ${levelName}**\n> ${truncatedText}` };
    }
    
    return {
      console: consoleOutput,
      discord: discordPayload
    };
  }
  
  // ============================================================================
  // INTERFAZ DE PROGRAMACIÓN DE APLICACIONES (API PÚBLICA)
  // ============================================================================
  
  return {
    debug: (msg) => {
      if (CONFIG.minLevel <= LOG_LEVELS.DEBUG) {
        const formatted = formatMessage(LOG_LEVELS.DEBUG, msg);
        console.log(formatted.console);
        sendToDiscord(formatted.discord, LOG_LEVELS.DEBUG);
      }
    },
    
    info: (msg) => {
      const formatted = formatMessage(LOG_LEVELS.INFO, msg);
      console.log(formatted.console);
      sendToDiscord(formatted.discord, LOG_LEVELS.INFO);
    },
    
    warn: (msg) => {
      const formatted = formatMessage(LOG_LEVELS.WARN, msg);
      console.warn(formatted.console);
      sendToDiscord(formatted.discord, LOG_LEVELS.WARN);
    },
    
    error: (msg) => {
      const formatted = formatMessage(LOG_LEVELS.ERROR, msg);
      console.error(formatted.console);
      sendToDiscord(formatted.discord, LOG_LEVELS.ERROR);
    },
    
    setDiscordEnabled: (enabled) => {
      CONFIG.discordEnabled = enabled;
    },
    
    setMinLevel: (level) => {
      if (LOG_LEVELS[level] !== undefined) {
        CONFIG.minLevel = LOG_LEVELS[level];
      }
    },
    
    getStats: () => ({
      queueLength: messageQueue.length,
      rateLimitQueue: CONFIG.rateLimit.queue.length,
      discordEnabled: CONFIG.discordEnabled,
      minLevel: Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === CONFIG.minLevel)
    }),
    
    clearQueue: () => {
      messageQueue.length = 0;
    }
  };
};