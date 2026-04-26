const { SlashCommandBuilder } = require('discord.js');
const engine = require('../services/combatEngine');
const monstersDb = require('../data/monsters');
const { getProfile } = require('../services/profileService');
const perfilCmd = require('./perfil');

module.exports = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName('iniciarcombate')
    .setDescription('[STAFF] Inicia una instancia de combate táctico PvE.')
    
    // Parámetros obligatorios (Deben declararse primero en la estructura del comando)
    .addUserOption(opt => opt.setName('jugador1').setDescription('Primer participante').setRequired(true))
    .addStringOption(opt => opt.setName('monstruos').setDescription('IDs separadas por coma (ej: mon_001,mon_002)').setRequired(true))
    
    // Configuración del modo de letalidad
    .addBooleanOption(opt => opt.setName('modo_letal').setDescription('¿El combate es a muerte definitiva (Instakill)?').setRequired(true))
    
    // Parámetros opcionales (Participantes secundarios)
    .addUserOption(opt => opt.setName('jugador2').setDescription('Segundo participante').setRequired(false))
    .addUserOption(opt => opt.setName('jugador3').setDescription('Tercer participante').setRequired(false))
    .addUserOption(opt => opt.setName('jugador4').setDescription('Cuarto participante').setRequired(false)),

  async execute(interaction) {
    // Verificación de credenciales Staff
    const isStaff = perfilCmd.helpers?.isStaff ? perfilCmd.helpers.isStaff(interaction.user.id, interaction.member) : false;
    if (!isStaff && interaction.channel.parentId !== process.env.RP_CATEGORY_ID && interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ content: '❌ Comando exclusivo de administradores.', flags: 64 });
    }

    const j1 = interaction.options.getUser('jugador1');
    const j2 = interaction.options.getUser('jugador2');
    const j3 = interaction.options.getUser('jugador3');
    const j4 = interaction.options.getUser('jugador4');
    const monsterStr = interaction.options.getString('monstruos');
    const isLethal = interaction.options.getBoolean('modo_letal'); 

    // Filtrado de parámetros vacíos para la configuración de la matriz de combate
    const rawUsers = [j1, j2, j3, j4].filter(u => u !== null);
    const players = [];

    // 1. Verificación de perfiles e inicialización de entidades de jugadores
    for (const user of rawUsers) {
      const profile = getProfile(user.id);
      
      // Abortar si el usuario no posee registros o los datos están corruptos
      if (!profile || !profile.nombre) {
        return interaction.reply({ 
          content: `❌ **Abortado:** El usuario **${user.username}** carece de registro de personaje y no es elegible para la simulación.`, 
          flags: 64 
        });
      }

      // Abortar si el perfil se encuentra inactivo (Estado vital: Muerto)
      if (profile.isDead) {
        return interaction.reply({
          content: `❌ **Abortado:** El estado vital de **${user.username}** figura como FALLECIDO en el sistema base.`,
          flags: 64
        });
      }

      players.push({
        id: user.id,
        name: profile.nombre,
        hp: profile.status?.hp !== undefined ? profile.status.hp : 100, 
        maxHp: profile.status?.maxHp !== undefined ? profile.status.maxHp : 100, 
        stats: profile.status?.stats || { fuerza: 5, destreza: 5, percepcion: 5, ingenio: 5, temple: 5 },
        isMonster: false,
        escaped: false,
        isDead: false
      });
    }

    // 2. Procesamiento e inicialización de entidades hostiles (Monstruos)
    const enemies = [];
    const monsterIds = monsterStr.split(',');
    monsterIds.forEach(mId => {
      const mData = monstersDb[mId.trim()];
      if (mData) {
        enemies.push({
          id: `npc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: mData.name,
          hp: mData.hp,
          maxHp: mData.hp,
          stats: mData.stats,
          damageRange: mData.damageRange,
          isMonster: true
        });
      }
    });

    if (enemies.length === 0) return interaction.reply({ content: '❌ Los identificadores de hostiles proporcionados no son válidos.', flags: 64 });

    // 3. Establecimiento del orden de turnos y metadatos de la instancia
    const turnQueue = engine.calcularIniciativa([...players, ...enemies]);
    const combatId = `comb_${Date.now()}`;

    // Notificación inicial del entorno y advertencia de reglas
    const letalTag = isLethal ? '☠️ **[MODO LETAL ACTIVADO: RIESGO DE MUERTE DEFINITIVA]**\n' : '';
    await interaction.reply({ content: `${letalTag}Generando entorno de simulación táctica...` });
    const initialMessage = await interaction.fetchReply();

    engine.activeCombats.set(combatId, {
      id: combatId,
      message: initialMessage,
      isLethal: isLethal, 
      players: players,
      enemies: enemies,
      turnQueue: turnQueue,
      currentTurn: 0,
      log: ['> *Las hostilidades han comenzado.*']
    });

    // Envío del registro de auditoría de creación del evento
    try {
      await perfilCmd.helpers.sendToLogChannel(interaction, 'SISTEMA_DE_COMBATE', [
        `**ACCIÓN   :** Inicialización de Enfrentamiento`,
        `**OFICIAL  :** <@${interaction.user.id}>`,
        `**MODO     :** ${isLethal ? '☠️ LETAL (Instakill)' : '⚠️ ESTÁNDAR (Penalización HP)'}`,
        `**SECTOR   :** <#${interaction.channelId}>`,
        `**ENTIDADES:** ${players.length} Operadores vs ${enemies.length} Hostiles`,
        `**ID REF   :** \`${combatId}\``
      ]);
    } catch (e) {
      console.error('Fallo en la comunicación con el canal de auditoría:', e);
    }

    // Arranque asíncrono para gestionar turnos automáticos de la IA
    const combatHandler = require('../handlers/combatHandler');
    if (typeof combatHandler.arrancarCombate === 'function') {
      await combatHandler.arrancarCombate(null, combatId);
    } else {
      await interaction.followUp({ content: '⚠️ Excepción de sistema: Módulo de combate no inicializado correctamente.', flags: 64 });
    }
  }
};