const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

/**
 * Sistema de logging avanzado para NIMBUS-OS
 * * Características:
 * - Logs a consola y Discord
 * - Rate limiting automático
 * - Verificación de permisos
 * - Niveles de log configurables
 * - Cola de mensajes (Scoped)
 * - Manejo seguro de límites de Discord (2000 chars)
 * - Auto-parseo de Objetos Error
 */

// ============================================================================
// CONFIGURACIÓN
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
    maxMessages: 5,      // Máximo 5 mensajes
    perSeconds: 10,      // Por cada 10 segundos
    queue: []            // Cola de timestamps
  }
};

// ============================================================================
// SISTEMA DE RATE LIMITING
// ============================================================================

function checkRateLimit() {
  const now = Date.now();
  const { maxMessages, perSeconds, queue } = CONFIG.rateLimit;
  
  CONFIG.rateLimit.queue = queue.filter(
    timestamp => now - timestamp < perSeconds * 1000
  );
  
  if (CONFIG.rateLimit.queue.length >= maxMessages) {
    return false; // Rate limit alcanzado
  }
  
  CONFIG.rateLimit.queue.push(now);
  return true;
}

// ============================================================================
// FUNCIÓN PRINCIPAL DE LOGGING
// ============================================================================

module.exports = function createLogger(client) {
  const logChannelId = process.env.LOG_CHANNEL_ID;
  
  // 🔥 MEJORA: Las colas ahora viven dentro de la instancia del logger
  const messageQueue = [];
  let isProcessingQueue = false;

  /**
   * Procesa la cola de envíos a Discord
   */
  async function processMessageQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (messageQueue.length > 0) {
      const payload = messageQueue.shift(); // Puede ser un string o un objeto con embeds
      
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
        
        // Enviar mensaje (Soporta texto plano o Embeds)
        await channel.send(payload);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error('❌ Error enviando log a Discord:', error.message);
      }
    }
    
    isProcessingQueue = false;
  }

  /**
   * Envía un mensaje al canal de Discord de forma segura
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
   * Formatea un mensaje de log y extrae Stack Traces si es un Error
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
    
    // 🔥 MEJORA: Manejo inteligente de objetos de Error
    let textMessage = "";
    if (msgOrError instanceof Error) {
      textMessage = msgOrError.stack || msgOrError.message;
    } else if (typeof msgOrError === 'object') {
      textMessage = JSON.stringify(msgOrError, null, 2);
    } else {
      textMessage = String(msgOrError);
    }

    // Console output normal
    const consoleOutput = `${icon} [${levelName}] ${textMessage}`;

    // 🔥 MEJORA: Truncar a 1950 caracteres para evitar crasheos de la API de Discord
    const truncatedText = textMessage.length > 1950 
      ? textMessage.substring(0, 1950) + '... [TRUNCADO]' 
      : textMessage;

    // 🔥 MEJORA: Para ERROR y WARN, usamos Embeds para que se vea más limpio
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
  // API PÚBLICA
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