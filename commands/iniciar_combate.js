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
    
    // 1. OBLIGATORIOS (Deben ir arriba)
    .addUserOption(opt => opt.setName('jugador1').setDescription('Primer participante').setRequired(true))
    .addStringOption(opt => opt.setName('monstruos').setDescription('IDs separadas por coma (ej: mon_001,mon_002)').setRequired(true))
    // 🔥 NUEVO: MODO LETAL OBLIGATORIO 🔥
    .addBooleanOption(opt => opt.setName('modo_letal').setDescription('¿El combate es a muerte definitiva (Instakill)?').setRequired(true))
    
    // 2. OPCIONALES
    .addUserOption(opt => opt.setName('jugador2').setDescription('Segundo participante').setRequired(false))
    .addUserOption(opt => opt.setName('jugador3').setDescription('Tercer participante').setRequired(false))
    .addUserOption(opt => opt.setName('jugador4').setDescription('Cuarto participante').setRequired(false)),

  async execute(interaction) {
    // 🛡️ VERIFICACIÓN STAFF
    const isStaff = perfilCmd.helpers?.isStaff ? perfilCmd.helpers.isStaff(interaction.user.id, interaction.member) : false;
    if (!isStaff && interaction.channel.parentId !== process.env.RP_CATEGORY_ID && interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ content: '❌ Comando exclusivo de Staff.', flags: 64 });
    }

    const j1 = interaction.options.getUser('jugador1');
    const j2 = interaction.options.getUser('jugador2');
    const j3 = interaction.options.getUser('jugador3');
    const j4 = interaction.options.getUser('jugador4');
    const monsterStr = interaction.options.getString('monstruos');
    const isLethal = interaction.options.getBoolean('modo_letal'); // Capturamos la variable

    // Filtramos los nulos (entradas vacías)
    const rawUsers = [j1, j2, j3, j4].filter(u => u !== null);
    const players = [];

    // 1. Validar Perfiles y Cargar Jugadores
    for (const user of rawUsers) {
      const profile = getProfile(user.id);
      
      // Si no existe el perfil o no tiene nombre (ficha incompleta), cancelamos todo.
      if (!profile || !profile.nombre) {
        return interaction.reply({ 
          content: `❌ **Abortado:** El usuario **${user.username}** no tiene una ficha de personaje registrada y no puede entrar en combate.`, 
          flags: 64 
        });
      }

      // 🔥 COMPROBAR SI ESTÁ MUERTO 🔥
      if (profile.isDead) {
        return interaction.reply({
          content: `❌ **Abortado:** El personaje de **${user.username}** figura como MUERTO en el sistema. No puede participar.`,
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

    // 2. Cargar Monstruos
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

    if (enemies.length === 0) return interaction.reply({ content: '❌ Ninguna ID de monstruo válida.', flags: 64 });

    // 3. Generar Iniciativa y Estado
    const turnQueue = engine.calcularIniciativa([...players, ...enemies]);
    const combatId = `comb_${Date.now()}`;

    // 🔥 AVISO DE LETALIDAD 🔥
    const letalTag = isLethal ? '☠️ **[MODO LETAL ACTIVADO: MUERTE DEFINITIVA INSTANTÁNEA]**\n' : '';
    await interaction.reply({ content: `${letalTag}Generando entorno de combate táctico...` });
    const initialMessage = await interaction.fetchReply();

    engine.activeCombats.set(combatId, {
      id: combatId,
      message: initialMessage,
      isLethal: isLethal, // Guardado para usarlo en combatHandler
      players: players,
      enemies: enemies,
      turnQueue: turnQueue,
      currentTurn: 0,
      log: ['> *Las hostilidades han comenzado.*']
    });

    // 📂 AUDITORÍA
    try {
      await perfilCmd.helpers.sendToLogChannel(interaction, 'SISTEMA_DE_COMBATE', [
        `**ACCIÓN   :** Inicialización de Enfrentamiento`,
        `**OFICIAL  :** <@${interaction.user.id}>`,
        `**MODO     :** ${isLethal ? '☠️ LETAL (Instakill)' : '⚠️ ESTÁNDAR (-10 Max HP por caída)'}`,
        `**SECTOR   :** <#${interaction.channelId}>`,
        `**ENTIDADES:** ${players.length} Jugador(es) vs ${enemies.length} Hostil(es)`,
        `**ID REF   :** \`${combatId}\``
      ]);
    } catch (e) {
      console.error('No se pudo enviar el log de combate:', e);
    }

    // 🟢 FIX C: Usamos el arrancador inteligente para que la IA actúe si le toca primero
    const combatHandler = require('../handlers/combatHandler');
    if (typeof combatHandler.arrancarCombate === 'function') {
      await combatHandler.arrancarCombate(null, combatId);
    } else {
      await interaction.followUp({ content: '⚠️ Error: No se pudo renderizar la interfaz. La función arrancarCombate no está disponible.', flags: 64 });
    }
  }
};