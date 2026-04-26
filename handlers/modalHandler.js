const { loadDB, saveDB, generarID } = require('../utils/db');

module.exports = async (interaction) => {

  if (!interaction.isModalSubmit()) return;

  if (!interaction.customId.startsWith('registroModal_')) return;

  const userId = interaction.customId.split('_')[1];

  const isOwner = interaction.user.id === process.env.OWNER_ID;

  // Control de seguridad: Prevención de suplantación de identidad (con anulación de privilegios para el administrador)
  if (interaction.user.id !== userId && !isOwner) {

    interaction.client.logger?.warn(
`📟 NIMBUS-OS // SECURITY LOG
────────────────────────────
⚠️ EVENT: UNAUTHORIZED REGISTRATION ATTEMPT

👤 USER: ${interaction.user.tag} (${interaction.user.id})
🎯 TARGET: ${userId}

🏷️ GUILD: ${interaction.guild?.name || 'DM'}
🕒 TIME: ${new Date().toISOString()}

🔒 ACTION: Blocked profile creation attempt`
    );

    return interaction.reply({
      content:
`⚠️ **NIMBUS-OS // ACCESS DENIED**

❌ No tienes permisos para completar el registro de otro usuario.`,
      flags: 64
    });
  }

  const db = loadDB();

  // Validación: Verificación de registro preexistente
  if (db[userId] && db[userId].nombre) {
    return interaction.reply({
      content:
`⚠️ **NIMBUS-OS // REGISTRO EXISTENTE**

❌ Este usuario ya tiene un perfil registrado.`,
      flags: 64
    });
  }

  // Procesamiento de variables de entrada
  const nombre = interaction.fields.getTextInputValue('nombre').trim();
  const edadInput = interaction.fields.getTextInputValue('edad').trim();
  const nacionalidadInput = interaction.fields.getTextInputValue('nacionalidad').trim();

  // Ejecución de rutinas de validación de formato
  if (!/^\d+$/.test(edadInput)) {
    return interaction.reply({
      content: '❌ La edad debe contener solo números.',
      flags: 64
    });
  }

  if (/\d/.test(nacionalidadInput)) {
    return interaction.reply({
      content: '❌ La nacionalidad no puede contener números.',
      flags: 64
    });
  }

  const edad = parseInt(edadInput);
  const nacionalidad = nacionalidadInput.charAt(0).toUpperCase() + nacionalidadInput.slice(1);

  const systemID = generarID();

  // Persistencia de datos en el sistema central
  db[userId] = {
    systemID,
    nombre,
    edad,
    nacionalidad,
    createdAt: Date.now()
  };

  saveDB(db);

  // Emisión de registro de auditoría del sistema
  interaction.client.logger?.info(
`📟 NIMBUS-OS // SYSTEM LOG
────────────────────────────
✅ EVENT: PROFILE CREATED

👤 USER: ${interaction.user.tag}
🎯 PROFILE OWNER: ${userId}

🆔 SYSTEM ID: ${systemID}
🎂 AGE: ${edad}
🌍 NATIONALITY: ${nacionalidad}

🏷️ GUILD: ${interaction.guild?.name || 'DM'}
🕒 TIME: ${new Date().toISOString()}`
  );

  // Transmisión de confirmación a la terminal de usuario
  await interaction.reply({
    content:
`✅ **NIMBUS-OS // REGISTRATION COMPLETE**

👤 Perfil creado correctamente.`,
    flags: 64
  });

  // Despliegue de notificación de red pública
  const embed = {
    color: 0x00ffcc,
    title: `👤 ${nombre.toUpperCase()}`,
    description:
`📟 **NIMBUS-OS // NEW PROFILE REGISTERED**

🆔 ID: ${systemID}
🎂 Edad: ${edad}
🌍 Nacionalidad: ${nacionalidad}`,

    footer: { text: `Sistema Nimbus-OS` },
    timestamp: new Date()
  };

  if (interaction.channel) {
    await interaction.channel.send({ embeds: [embed] });
  }
};