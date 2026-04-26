const { EmbedBuilder } = require('discord.js');

/**
 * Módulo de simulación meteorológica y peligros ambientales
 * Especificaciones:
 * - Ampliación de la matriz de climas estándar y anómalos.
 * - Integración de precipitaciones no radiactivas.
 * - Soporte para representación visual mediante imágenes.
 * - Capacidad de inyección manual de estados climáticos.
 */

const CLIMAS = [
  // Condiciones atmosféricas estándar (Radiación: 0%)
  { 
    id: 'despejado', 
    nombre: '☀️ Despejado', 
    descripcion: 'El cielo está claro. Condiciones óptimas para explorar y realizar reconocimientos.', 
    rad: 0, 
    color: 0xffee00,
    imagen: 'https://i.pinimg.com/1200x/f5/fe/4e/f5fe4eba6b08794dfe6a5481b4565418.jpg'
  },
  { 
    id: 'nublado', 
    nombre: '☁️ Nublado', 
    descripcion: 'Nubes densas y grises cubren la Zona. Visibilidad ligeramente reducida.', 
    rad: 0, 
    color: 0x888888,
    imagen: 'https://i.pinimg.com/1200x/c9/d6/b2/c9d6b2658daf325d9886bd2746403cae.jpg'
  },
  { 
    id: 'niebla', 
    nombre: '🌫️ Niebla Densa', 
    descripcion: 'Una bruma espesa y fría dificulta enormemente la visión periférica. Avancen con precaución.', 
    rad: 0, 
    color: 0xaaaaaa,
    imagen: 'https://i.pinimg.com/1200x/15/fd/0b/15fd0bcf5875eb20b813b7e3dabea02f.jpg'
  },
  
  // Precipitaciones y alteraciones de baja letalidad (Radiación: 0%)
  { 
    id: 'llovizna', 
    nombre: '🌧️ Llovizna Constante', 
    descripcion: 'Una lluvia fina y persistente que cala hasta los huesos. El ambiente se vuelve lúgubre y húmedo.', 
    rad: 0, 
    color: 0x557799,
    imagen: 'https://i.pinimg.com/originals/5d/29/df/5d29dfd5d5bb006c3ef5ff0fed10c7ce.gif'
  },
  { 
    id: 'lluvia_fuerte', 
    nombre: '☔ Lluvia Torrencial', 
    descripcion: 'Precipitaciones pesadas que reducen drásticamente la visibilidad y ahogan los sonidos del entorno.', 
    rad: 0, 
    color: 0x335588,
    imagen: 'https://i.pinimg.com/originals/8f/04/85/8f04859766812ff05e266aef204f6a7d.gif'
  },
  { 
    id: 'tormenta', 
    nombre: '🌩️ Tormenta Eléctrica', 
    descripcion: 'Truenos ensordecedores y relámpagos iluminan los cielos. Se recomienda evitar zonas expuestas o elevadas.', 
    rad: 0, 
    color: 0x223366,
    imagen: 'https://i.pinimg.com/1200x/0c/da/2c/0cda2c518213e3269e563bf0a9f73932.jpg'
  },
  { 
    id: 'viento', 
    nombre: '💨 Vientos Fuertes', 
    descripcion: 'Ráfagas violentas de viento frío que levantan escombros y dificultan el avance a pie.', 
    rad: 0, 
    color: 0xaaccdd,
    imagen: 'https://i.pinimg.com/originals/02/8f/c0/028fc0f58b6d275812336e90c6ba4251.gif'
  },

  // Anomalías ambientales letales y radiación activa (Radiación: >0%)
  { 
    id: 'lluvia_acida', 
    nombre: '🌧️ Lluvia Ácida Leve', 
    descripcion: 'Precipitaciones corrosivas. La exposición prolongada incrementará la radiación.', 
    rad: 0.5, 
    color: 0x44aa44,
    imagen: 'https://i.pinimg.com/736x/e0/14/e2/e014e2cb0e8cb2cc78efa1b9c62bd467.jpg'
  },
  { 
    id: 'niebla_toxica', 
    nombre: '☣️ Niebla Tóxica', 
    descripcion: 'Bruma contaminada de tono verdoso. Es vital el uso de sistemas de filtración y máscaras.', 
    rad: 1.5, 
    color: 0x99ff00,
    imagen: 'https://i.pinimg.com/1200x/29/76/c7/2976c765126868157c149ce7e50d002f.jpg'
  },
  { 
    id: 'tormenta_rad', 
    nombre: '☢️ TORMENTA RADIACTIVA', 
    descripcion: '¡ALERTA DE PELIGRO! Los niveles de radiación ambiental superan los límites de seguridad.', 
    rad: 3.0, 
    color: 0xffaa00,
    imagen: 'https://i.pinimg.com/1200x/c3/7f/e9/c37fe9f38012d314c08253f563e68619.jpg'
  },
  { 
    id: 'emision', 
    nombre: '☠️ EMISIÓN', 
    descripcion: '¡EMISIÓN PSÍQUICA INMINENTE! Busquen refugio estructural bajo tierra de inmediato. Letalidad extrema.', 
    rad: 6.0, 
    color: 0xff0000,
    imagen: 'https://i.pinimg.com/1200x/89/f0/ae/89f0ae0bffe784db6d4bd0c2dd019745.jpg'
  }
];

let climaActual = CLIMAS[0];
let weatherInterval = null; // Variable de estado para el ciclo de ejecución

function getCurrentWeather() {
  return climaActual;
}

/**
 * Ejecuta el cambio de estado meteorológico y emite la alerta
 * @param {object} client - Instancia del cliente de Discord
 * @param {string} forzadoId - ID opcional para forzar un clima específico
 */
async function cambiarClima(client, forzadoId = null) {
  // Selección algorítmica o inyección manual del estado ambiental
  if (forzadoId) {
    const seleccionado = CLIMAS.find(c => c.id === forzadoId);
    if (seleccionado) climaActual = seleccionado;
  } else {
    const randomIdx = Math.floor(Math.random() * CLIMAS.length);
    climaActual = CLIMAS[randomIdx];
  }

  // Extracción de directivas de canal y rol desde el entorno
  const canalId = process.env.WEATHER_CHANNEL_ID || '1494603030325362838';
  const rolId = process.env.WEATHER_ROLE_ID || '1495173193483292672';

  const canal = client.channels.cache.get(canalId) || await client.channels.fetch(canalId).catch(() => null);
  if (!canal) {
    console.error('❌ [N-OS]: Error de red. No se pudo localizar el canal de transmisión meteorológica.');
    return;
  }

  // Ensamblado de la alerta visual y cálculo de niveles de advertencia
  const radAviso = climaActual.rad > 0 ? `⚠️ PELIGRO (${climaActual.rad}% Rad por acción)` : 'Seguro (0%)';
  
  const embed = new EmbedBuilder()
    .setTitle(`📟 [N-OS // REPORTE METEOROLÓGICO]`)
    .setColor(climaActual.color)
    .setDescription(
      `**Condición actual:** ${climaActual.nombre}\n` +
      `> ${climaActual.descripcion}\n\n` +
      `**Nivel de Contaminación Ambiental:** \`${radAviso}\``
    )
    .setTimestamp();

  // Incorporación de soporte visual adjunto
  if (climaActual.imagen) {
    embed.setImage(climaActual.imagen);
  }

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
  
  // Inicialización del temporizador maestro (Ciclo de rotación: 6 horas)
  weatherInterval = setInterval(() => cambiarClima(client), 6 * 60 * 60 * 1000);
  return { success: true, msg: 'Motor meteorológico activado. Ciclo de rotación de 6 horas iniciado.' };
}

function stopWeatherSystem() {
  // Verificación de estado del proceso
  if (weatherInterval === null) {
    return { success: false, msg: 'El motor meteorológico ya se encuentra inactivo.' };
  }

  // Suspensión del temporizador maestro
  clearInterval(weatherInterval);
  weatherInterval = null;
  return { success: true, msg: 'Motor meteorológico suspendido exitosamente.' };
}

module.exports = { getCurrentWeather, initWeatherSystem, stopWeatherSystem, cambiarClima, CLIMAS };