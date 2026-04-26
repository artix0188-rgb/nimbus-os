const { EmbedBuilder } = require('discord.js');

/**
 * Módulo meteorológico y de peligros ambientales (Hazards)
 */

const CLIMAS = [
  { id: 'despejado', nombre: '☀️ Despejado', descripcion: 'El cielo está claro. Condiciones óptimas para explorar.', rad: 0, color: 0xffee00 },
  { id: 'nublado', nombre: '☁️ Nublado', descripcion: 'Nubes densas cubren la Zona. Visibilidad ligeramente reducida.', rad: 0, color: 0x888888 },
  { id: 'niebla', nombre: '🌫️ Niebla Densa', descripcion: 'Una bruma espesa dificulta la visión periférica. Tengan cuidado.', rad: 0, color: 0xaaaaaa },
  { id: 'lluvia_acida', nombre: '🌧️ Lluvia Ácida Leve', descripcion: 'Precipitaciones corrosivas. Exposición prolongada incrementará la radiación.', rad: 0.5, color: 0x44aa44 },
  { id: 'niebla_toxica', nombre: '☣️ Niebla Tóxica', descripcion: 'Bruma contaminada de tono verdoso. Es vital el uso de máscaras.', rad: 1.5, color: 0x99ff00 },
  { id: 'tormenta_rad', nombre: '☢️ TORMENTA RADIACTIVA', descripcion: '¡ALERTA DE PELIGRO! Los niveles de radiación ambiental están por las nubes.', rad: 3.0, color: 0xffaa00 },
  { id: 'emision', nombre: '☠️ EMISIÓN', descripcion: '¡EMISIÓN INMINENTE! Busquen refugio estructural bajo tierra de inmediato. Letalidad extrema.', rad: 6.0, color: 0xff0000 }
];

let climaActual = CLIMAS[0];
let weatherInterval = null; // Variable de estado para el reloj del sistema

function getCurrentWeather() {
  return climaActual;
}

async function cambiarClima(client) {
  // Selección algorítmica del nuevo estado ambiental
  const randomIdx = Math.floor(Math.random() * CLIMAS.length);
  climaActual = CLIMAS[randomIdx];

  // Extracción de directivas de canal y rol desde el entorno
  const canalId = process.env.WEATHER_CHANNEL_ID || '1494603030325362838';
  const rolId = process.env.WEATHER_ROLE_ID || '1495173193483292672';

  const canal = client.channels.cache.get(canalId) || await client.channels.fetch(canalId).catch(() => null);
  if (!canal) {
    console.error('❌ [N-OS]: Error de red. No se pudo localizar el canal de transmisión meteorológica.');
    return;
  }

  // Ensamblado de la alerta visual
  const radAviso = climaActual.rad > 0 ? `⚠️ PELIGRO (${climaActual.rad}% Rad por acción)` : 'Seguro (0%)';
  
  const embed = new EmbedBuilder()
    .setTitle(`📟 [N-OS // REPORTE METEOROLÓGICO]`)
    .setColor(climaActual.color)
    .setDescription(
      `**Condición actual:** ${climaActual.nombre}\n` +
      `> ${climaActual.descripcion}\n\n` +
      `**Nivel de Radiación Ambiental:** \`${radAviso}\``
    )
    .setTimestamp();

  try {
    await canal.send({ content: `<@&${rolId}>`, embeds: [embed] });
  } catch (e) {
    console.error('❌ [N-OS]: Fallo crítico en la transmisión del reporte meteorológico.', e);
  }
}

function initWeatherSystem(client) {
  // Prevención de duplicación de procesos en segundo plano
  if (weatherInterval !== null) {
    return { success: false, msg: 'El motor meteorológico ya se encuentra en ejecución.' };
  }

  // Ejecución inmediata de la primera alteración climática
  cambiarClima(client);
  
  // Inicialización del temporizador maestro (Ciclo de 6 horas)
  weatherInterval = setInterval(() => cambiarClima(client), 6 * 60 * 60 * 1000);
  return { success: true, msg: 'Motor meteorológico activado. Ciclo de rotación: 6 horas.' };
}

function stopWeatherSystem() {
  // Verificación de estado del proceso
  if (weatherInterval === null) {
    return { success: false, msg: 'El motor meteorológico se encuentra inactivo.' };
  }

  // Suspensión del temporizador maestro
  clearInterval(weatherInterval);
  weatherInterval = null;
  return { success: true, msg: 'Motor meteorológico suspendido exitosamente.' };
}

module.exports = { getCurrentWeather, initWeatherSystem, stopWeatherSystem, cambiarClima, CLIMAS };