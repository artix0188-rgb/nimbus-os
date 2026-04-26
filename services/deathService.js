const { EmbedBuilder } = require('discord.js');
const { updateProfile, deleteProfile } = require('./profileService');
const lootHandler = require('../handlers/lootHandler');

/**
 * Procesa la muerte de un jugador de forma global.
 * @param {string} userId - ID de Discord del jugador.
 * @param {object} profile - El perfil completo del jugador antes de morir.
 * @param {string} causa - Razón de la muerte (ej: "Trauma Severo en Combate", "Inanición").
 * @param {object} channel - El objeto del canal de Discord donde murió.
 * @param {object} client - El cliente de Discord (para enviar MDs y Logs).
 */
async function processDeath(userId, profile, causa, channel, client) {
  // 1. Clonar toda la ficha en una nueva ID "corpse_X"
  const corpseId = `corpse_${userId}_${Date.now()}`;
  
  updateProfile(corpseId, {
    nombre: profile.nombre,
    inventory: profile.inventory || [],
    equipment: profile.equipment || {},
    mags: profile.mags || {},
    isDead: true,
    status: { hp: 0, maxHp: profile.status?.maxHp || 100 }
  });

  // 2. Registrar el CADÁVER en el radar del sector
  if (lootHandler && typeof lootHandler.registerBody === 'function') {
    lootHandler.registerBody(corpseId, profile.nombre, 'corpse', channel.id);
  }

  // 3. Borrar la ficha original para liberar su /registro
  if (typeof deleteProfile === 'function') {
    deleteProfile(userId);
  }

  // 4. Enviar Mensaje Dramático al Jugador (MD o Fallback Público)
  const embedMuerte = new EmbedBuilder()
    .setTitle('⚠️ [N-OS // FALLO SISTÉMICO VITAL] ⚠️')
    .setColor(0x8b0000)
    .setDescription(`Tus signos vitales han cesado por completo. Tu personaje **${profile.nombre}** ha **MUERTO** de forma definitiva.\n\n**Causa de muerte:** ${causa}\n\n> 🦴 *Tu cadáver y equipamiento han quedado en la zona para ser saqueados.*\n> 🗑️ *Tu ficha ha sido eliminada de la base de datos principal.*\n\n**Ya puedes utilizar el comando de registro para crear un nuevo superviviente y continuar tu historia en el yermo.**`);

  try {
    // Intentamos enviar el Mensaje Directo primero
    const userDiscord = await client.users.fetch(userId);
    await userDiscord.send({ embeds: [embedMuerte] });
  } catch (e) {
    console.log(`[DeathService]: MD bloqueado por ${userId}. Activando protocolo de aviso público.`);
    // 🔥 FALLBACK: Si tiene los MD cerrados, lo notificamos en el canal donde murió 🔥
    try {
      embedMuerte.setFooter({ text: "Recibes este aviso aquí porque tienes los Mensajes Directos bloqueados." });
      await channel.send({ content: `<@${userId}>`, embeds: [embedMuerte] });
    } catch (err) {
      console.log("[DeathService]: Tampoco se pudo enviar el aviso de muerte en el canal público.");
    }
  }

  // 5. EMISIÓN PDA (ON-ROL, PÚBLICA) -> DEATHS_CHANNEL_ID
  try {
    const deathChannelId = process.env.DEATHS_CHANNEL_ID;
    if (deathChannelId) {
      const deathChannel = client.channels.cache.get(deathChannelId);
      if (deathChannel) {
        const pdaEmbed = new EmbedBuilder()
          .setColor(0x8b0000)
          .setAuthor({ name: '📡 N-OS // RED DE OPERADORES ABIERTA' })
          .setDescription(
            `\`\`\`ansi\n\u001b[1;31m[ALERTA DE SISTEMA: CONEXIÓN BIOMÉTRICA PERDIDA]\u001b[0m\n\n` +
            `Sujeto       : ${profile.nombre.toUpperCase()}\n` +
            `Último Ping  : Sector de coordenadas encriptadas.\n` +
            `Diagnóstico  : ${causa.toUpperCase()}\n` +
            `\`\`\`\n` +
            `> *La señal de la PDA se ha desvanecido. El yermo se cobra un nuevo tributo. Sus restos y su equipo quedan pudriéndose en el sector <#${channel.id}> para quien tenga las agallas de ir a reclamarlos. Que la ceniza lo acoja.*`
          );

        await deathChannel.send({ embeds: [pdaEmbed] });
      }
    }
  } catch (e) {
    console.log("[DeathService]: No se pudo enviar log PDA al canal público de muertes.");
  }

  // 6. REGISTRO PRIVADO (OFF-ROL / STAFF) -> LOG_CHANNEL_ID
  try {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (logChannelId) {
      const logChannel = client.channels.cache.get(logChannelId);
      if (logChannel) {
        const staffEmbed = new EmbedBuilder()
          .setTitle('☠️ REGISTRO DE FALLECIMIENTO EN COMBATE')
          .setColor(0x1a1a1a)
          .setDescription(`Se ha registrado la pérdida de signos vitales en el sector <#${channel.id}>.`)
          .addFields({ 
            name: `Sujeto: ${profile.nombre}`, 
            value: `> Usuario: <@${userId}>\n> Causa: ${causa}.\n> *El cadáver de este usuario se encuentra disponible para ser saqueado mediante* \`/saquear\`. *Se ha autorizado la creación de una nueva ficha para el operador.*` 
          })
          .setTimestamp();

        await logChannel.send({ embeds: [staffEmbed] });
      }
    }
  } catch (e) {
    console.log("[DeathService]: No se pudo enviar log administrativo al LOG_CHANNEL_ID.");
  }
}

module.exports = {
  processDeath
};