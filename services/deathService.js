const { EmbedBuilder } = require('discord.js');
const { updateProfile, deleteProfile } = require('./profileService');
const lootHandler = require('../handlers/lootHandler');

/**
 * Procedimiento de gestión global para la baja confirmada de un operador.
 * @param {string} userId - Identificador de red del usuario.
 * @param {object} profile - Registro íntegro del perfil previo al cese de funciones vitales.
 * @param {string} causa - Diagnóstico o motivo de la defunción.
 * @param {object} channel - Referencia al sector (canal) donde ocurrió el evento.
 * @param {object} client - Instancia del cliente para la emisión de notificaciones.
 */
async function processDeath(userId, profile, causa, channel, client) {
  // 1. Clonación del registro de perfil hacia una nueva entidad inerte ("corpse_X")
  const corpseId = `corpse_${userId}_${Date.now()}`;
  
  updateProfile(corpseId, {
    nombre: profile.nombre,
    inventory: profile.inventory || [],
    equipment: profile.equipment || {},
    mags: profile.mags || {},
    isDead: true,
    status: { hp: 0, maxHp: profile.status?.maxHp || 100 }
  });

  // 2. Indexación de la entidad inerte en el sistema de rastreo sectorial
  if (lootHandler && typeof lootHandler.registerBody === 'function') {
    lootHandler.registerBody(corpseId, profile.nombre, 'corpse', channel.id);
  }

  // 3. Eliminación del registro original para habilitar una nueva creación de operador
  if (typeof deleteProfile === 'function') {
    deleteProfile(userId);
  }

  // 4. Transmisión de notificación de cese vital al operador (Mensaje Directo o canal público)
  const embedMuerte = new EmbedBuilder()
    .setTitle('⚠️ [N-OS // FALLO SISTÉMICO VITAL] ⚠️')
    .setColor(0x8b0000)
    .setDescription(`Tus signos vitales han cesado por completo. Tu personaje **${profile.nombre}** ha **MUERTO** de forma definitiva.\n\n**Causa de muerte:** ${causa}\n\n> 🦴 *Tu cadáver y equipamiento han quedado en la zona para ser saqueados.*\n> 🗑️ *Tu ficha ha sido eliminada de la base de datos principal.*\n\n**Ya puedes utilizar el comando de registro para crear un nuevo superviviente y continuar tu historia en el yermo.**`);

  try {
    // Intento de entrega a través de canal de comunicación directo
    const userDiscord = await client.users.fetch(userId);
    await userDiscord.send({ embeds: [embedMuerte] });
  } catch (e) {
    console.log(`[DeathService]: Canal directo bloqueado por el usuario ${userId}. Activando protocolo de aviso público.`);
    // Protocolo de contingencia: Emisión pública en el sector actual debido a restricciones de privacidad del usuario
    try {
      embedMuerte.setFooter({ text: "Recibes este aviso aquí porque tienes los Mensajes Directos bloqueados." });
      await channel.send({ content: `<@${userId}>`, embeds: [embedMuerte] });
    } catch (err) {
      console.log("[DeathService]: Fallo en la emisión del aviso de defunción en el sector público.");
    }
  }

  // 5. Transmisión de alerta pública a la red de operadores (DEATHS_CHANNEL_ID)
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
    console.log("[DeathService]: Excepción al intentar emitir el registro en el canal de defunciones.");
  }

  // 6. Registro de auditoría administrativa (LOG_CHANNEL_ID)
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
    console.log("[DeathService]: Excepción en la transmisión del registro de auditoría administrativa.");
  }
}

module.exports = {
  processDeath
};