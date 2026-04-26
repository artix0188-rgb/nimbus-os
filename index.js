require('dotenv').config();
const fs = require('fs');
const path = require('path');

const {
  Client,
  GatewayIntentBits,
  Collection,
  Partials,
  PermissionFlagsBits // Dependencia requerida para la gestión de permisos administrativos
} = require('discord.js');

const services = require('./services');
const { migrateProfiles } = require('./services/migrationService');
const handleModal = require('./handlers/modalHandler');
const handleProfileButtons = require('./handlers/profileMenuHandler');
const handleStatusButtons = require('./handlers/statusMenuHandler');
const handleHunger = require('./handlers/hungerHandler');
const handleInventory = require('./handlers/inventoryHandler');
const handleAction = require('./handlers/actionHandler');
const lootHandler = require('./handlers/lootHandler'); 
const createLogger = require('./utils/logger');
const estadosPDA = require('./utils/pdaStatuses');


// ==========================================
// CONFIGURACIÓN DEL CLIENTE (INTENTS)
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// Inicialización de utilidades y estructuras de datos globales
client.logger = createLogger(client);
client.commands = new Collection();
client.services = services;

// ==========================================
// CARGA DINÁMICA DE COMANDOS (SLASH)
// ==========================================
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  try {
    const command = require(`./commands/${file}`);
    if (command.data && command.execute) {
      
      // Inyección automática de directivas de seguridad para comandos restringidos
      if (command.adminOnly) {
        command.data.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
      }

      client.commands.set(command.data.name, command);
      console.log(`✅ Comando cargado: ${command.data.name}`);
    }
  } catch (error) {
    console.error(`❌ Error al cargar archivo de comando ${file}:`, error);
  }
}

// ==========================================
// GESTIÓN GLOBAL DE EXCEPCIONES
// ==========================================
process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('❌ Uncaught Exception:', error);
});

// ==========================================
// EVENTO DE INICIALIZACIÓN: READY (SISTEMA ONLINE)
// ==========================================
client.once('clientReady', async () => {
  console.log(`🤖 NIMBUS-OS // LOGIN EXITOSO: ${client.user.tag}`);
  try {
    migrateProfiles();
  } catch (err) {
    console.error('❌ Error en la migración de datos:', err);
  }
  client.logger.info('NIMBUS-OS // SYSTEM ONLINE: El sistema está listo para operar.');

  // ── Despliegue automático de comandos de aplicación (Slash Commands) ──
  try {
    const { REST, Routes } = require('discord.js');
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    const commandData = [...client.commands.values()].map(cmd => cmd.data.toJSON());

    const route = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.CLIENT_ID);

    await rest.put(route, { body: commandData });

    const scope = process.env.GUILD_ID ? `guild ${process.env.GUILD_ID} (instantáneo)` : 'global (~1h)';
    console.log(`✅ ${commandData.length} slash commands registrados — ${scope}`);
  } catch (err) {
    console.error('❌ Error al registrar slash commands:', err);
  }

  // SISTEMA DE PRESENCIA ROTATIVA (ALGORITMO SHUFFLE BAG)
  let poolEstados = [...estadosPDA];
  let indice = 0;

  const mezclarArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  };

  mezclarArray(poolEstados);

  const rotarEstado = () => {
    if (indice >= poolEstados.length) {
      const ultimoMostrado = poolEstados[poolEstados.length - 1]; 
      mezclarArray(poolEstados); 
      if (poolEstados[0] === ultimoMostrado && poolEstados.length > 1) {
        [poolEstados[0], poolEstados[1]] = [poolEstados[1], poolEstados[0]];
      }
      indice = 0; 
    }

    client.user.setPresence({
      activities: [{ 
        name: poolEstados[indice], 
        type: 0 
      }],
      status: 'online'
    });

    indice++;
  };

  rotarEstado(); 
  setInterval(rotarEstado, 600000); 
});

// ==========================================
// CONTROLADOR GLOBAL DE INTERACCIONES
// ==========================================
client.on('interactionCreate', async interaction => {

  // PROCESAMIENTO DE COMANDOS DE APLICACIÓN
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    // Control de acceso global de nivel administrativo
    if (command.adminOnly && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ 
        content: '❌ **[N-OS // SEGURIDAD]**: Acceso denegado. Protocolo exclusivo para operadores de Nivel Administrador.', 
        flags: 64 
      });
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Error en comando ${interaction.commandName}:`, error);
      const reply = {
        content: '❌ **NIMBUS-OS // ERROR**: Fallo en la ejecución del comando.',
        flags: 64
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  }

  // PROCESAMIENTO DE COMPONENTES DE INTERFAZ (BOTONES Y MENÚS)
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('perfil_')) {
      try {
        await handleProfileButtons(interaction);
      } catch (error) {
        console.error('❌ Error en ProfileMenuHandler:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Error procesando el perfil.', flags: 64 });
        }
      }
    } 
    else if (interaction.customId.startsWith('estado_')) {
      try {
        await handleStatusButtons(interaction);
      } catch (error) {
        console.error('❌ Error en StatusMenuHandler:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Error procesando el estado.', flags: 64 });
        }
      }
    } 
    else if (interaction.customId.startsWith('inv_')) {
      try {
        await handleInventory(interaction);
      } catch (error) {
        console.error('❌ Error en InventoryHandler:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Error procesando el inventario.', flags: 64 });
        }
      }
    }
    else if (interaction.customId.startsWith('floor_')) {
      try {
        await handleAction(interaction);
      } catch (error) {
        console.error('❌ Error en ActionHandler (Suelo):', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Error procesando la acción del suelo.', flags: 64 });
        }
      }
    }
    else if (interaction.customId.startsWith('loot_')) {
      try {
        await lootHandler.handleLootInteraction(interaction);
      } catch (error) {
        console.error('❌ Error en LootHandler (Saqueo):', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Error procesando el saqueo.', flags: 64 });
        }
      }
    }
    else if (interaction.customId.startsWith('cb_')) {
      const combatHandler = require('./handlers/combatHandler');
      await combatHandler(interaction);
    }
    else {
      console.log(`ℹ️ Botón ignorado por el router principal: ${interaction.customId}`);
    }
  }

  // PROCESAMIENTO DE FORMULARIOS (MODALES)
  if (interaction.isModalSubmit()) {
    try {
      if (interaction.customId.startsWith('estado_')) {
        await handleStatusButtons(interaction);
      } else if (interaction.customId.startsWith('perfil_')) {
        await handleProfileButtons(interaction);
      } 
      else if (interaction.customId.startsWith('drop_modal_')) {
        await handleAction(interaction);
      } 
      else {
        await handleModal(interaction);
      }
    } catch (error) {
      console.error('❌ Error en ModalHandler:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Error procesando el formulario.', flags: 64 });
      }
    }
  }

  // SISTEMA GLOBAL DE RECOLECCIÓN DE BASURA PARA INTERFACES DE USUARIO
  try {
    if (interaction.replied || interaction.deferred || interaction.isMessageComponent()) {
      
      let msgToTrack = null;
      
      if (interaction.isMessageComponent()) {
        msgToTrack = interaction.message;
      } 
      else if (interaction.replied || interaction.deferred) {
        msgToTrack = await interaction.fetchReply().catch(() => null);
      }

      if (msgToTrack && msgToTrack.components && msgToTrack.components.length > 0) {
  
      const firstComponentId = msgToTrack.components[0]?.components[0]?.customId;
      // Exclusión temporal para menús de combate y selección activa de objetivos
      if (firstComponentId?.startsWith('cb_') || firstComponentId?.startsWith('loot_sel_')) {
        return; 
      }

        if (!interaction.client.componentTimeouts) {
          interaction.client.componentTimeouts = new Map();
        }

        if (interaction.client.componentTimeouts.has(msgToTrack.id)) {
          clearTimeout(interaction.client.componentTimeouts.get(msgToTrack.id));
        }

        // Restablecimiento asíncrono para prevenir saturación visual en los canales
        const timer = setTimeout(() => {
          msgToTrack.edit({ components: [] }).catch(() => null); 
          interaction.client.componentTimeouts.delete(msgToTrack.id); 
        }, 120000); 

        interaction.client.componentTimeouts.set(msgToTrack.id, timer);
      } 
      else if (msgToTrack && interaction.client.componentTimeouts?.has(msgToTrack.id)) {
        clearTimeout(interaction.client.componentTimeouts.get(msgToTrack.id));
        interaction.client.componentTimeouts.delete(msgToTrack.id);
      }
    }
  } catch (error) {
    // Falla de captura silenciosa para operaciones efímeras expiradas
  }

}); 

// ==========================================
// MONITOR DE EVENTOS DE MENSAJERÍA (SISTEMA DE DESGASTE VITAL)
// ==========================================
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  try {
    await handleHunger(message, client);
  } catch (err) {
    console.error('❌ Error en hungerHandler:', err);
  }
});

// ==========================================
// AUTENTICACIÓN E INICIO DE SESIÓN
// ==========================================
const token = process.env.TOKEN;

if (!token) {
  console.error('❌ ERROR CRÍTICO: No se encontró TOKEN en el archivo .env');
  process.exit(1);
}

client.login(token).catch(error => {
  console.error('❌ Error al iniciar sesión:', error);
  process.exit(1);
});