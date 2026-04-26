const { createCanvas, loadImage } = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const { getProfile } = require('./profileService');

const bgPools = {
  urbano: [
    'https://i.pinimg.com/736x/eb/a1/c1/eba1c111ebd716580490fc16e0351d7f.jpg', 
    'https://i.pinimg.com/1200x/ee/30/d4/ee30d4af5a9efba43b334822f2932e32.jpg',
    'https://i.pinimg.com/1200x/a1/c2/63/a1c263ca5c893b357170bf84f2cfd961.jpg',
    'https://i.pinimg.com/1200x/42/af/80/42af802660c1dd01b4ccbc6c3f6f67a0.jpg'
  ],
  exterior: [
    'https://i.pinimg.com/1200x/1f/80/14/1f8014e42be25798e13189198a6763a0.jpg',
    'https://i.pinimg.com/1200x/9e/1d/1e/9e1d1e877b8959164ff26a9e3f3a3d10.jpg',
    'https://i.pinimg.com/1200x/fc/dc/70/fcdc70f7d65e32e5537263ccc2d49c0e.jpg'
  ],
  interior: [
    'https://i.pinimg.com/1200x/cc/4c/51/cc4c510b275c66e9956577b55dc617e4.jpg',
    'https://i.pinimg.com/1200x/f1/6a/0f/f16a0fa8b6d961c8f714d270bf3b036f.jpg',
    'https://i.pinimg.com/1200x/29/8b/b5/298bb599927c6c571618e977963abd88.jpg'
  ],
  subterraneo: [
    'https://i.pinimg.com/1200x/4f/2d/73/4f2d7370c6fdc709e89fb34424f1db47.jpg',
    'https://i.pinimg.com/736x/a1/cd/e1/a1cde1bf3bf29bc6da20a10d01588362.jpg',
    'https://i.pinimg.com/736x/33/77/b0/3377b0ad658b7a359ab44ab2fbe4b76f.jpg'
  ],
  default: [
    'https://i.pinimg.com/736x/e6/d5/25/e6d52538e5f18fbcc02b578cee6df4b9.jpg'
  ]
};

function getBackground(categoryId, channelId) {
  const urbanos = (process.env.CAT_URBANO || '').split(',');
  const exteriores = (process.env.CAT_EXTERIOR || '').split(',');
  const interiores = (process.env.CAT_INTERIOR || '').split(',');
  const subterraneos = (process.env.CAT_SUBTERRANEO || '').split(',');

  let pool = bgPools.default;
  if (urbanos.includes(categoryId) || urbanos.includes(channelId)) pool = bgPools.urbano;
  else if (exteriores.includes(categoryId) || exteriores.includes(channelId)) pool = bgPools.exterior;
  else if (interiores.includes(categoryId) || interiores.includes(channelId)) pool = bgPools.interior;
  else if (subterraneos.includes(categoryId) || subterraneos.includes(channelId)) pool = bgPools.subterraneo;

  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Dibuja una imagen recortada en círculo (Token) con soporte de Aura
 */
async function drawToken(ctx, imgUrl, x, y, size, borderColor, isActive) {
  // 🔥 AURA DORADA PARA EL TURNO ACTUAL
  if (isActive) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, (size / 2) + 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.4)'; // Brillo dorado
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffd700'; // Borde dorado externo
    ctx.stroke();
    ctx.restore();
    borderColor = '#ffd700'; // El borde del token también se vuelve dorado
  }

  // Recorte del Token
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  try {
    const img = await loadImage(imgUrl);
    ctx.drawImage(img, x, y, size, size);
  } catch (e) {
    // Colores de fallback
    ctx.fillStyle = borderColor === '#3b82f6' ? '#1e3a8a' : (borderColor === '#ffd700' ? '#b8860b' : '#7f1d1d');
    ctx.fillRect(x, y, size, size);
  }

  ctx.restore();

  // Borde principal del Token
  ctx.lineWidth = isActive ? 5 : 4;
  ctx.strokeStyle = borderColor;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.stroke();
}

async function generateCombatImage(combat, channelCategoryId, channelId) {
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 500;
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');

  // 1. Fondo y Sombreado
  const bgUrl = getBackground(channelCategoryId, channelId);
  try {
    const bg = await loadImage(bgUrl);
    ctx.drawImage(bg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } catch (e) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const tokenSize = 115;
  const gap = 20;

  // Saber de quién es el turno
  const currentEntity = combat.turnQueue[combat.currentTurn] || {};

  // 2. ENEMIGOS (Franja Superior, en línea recta estática)
  const aliveEnemies = combat.enemies.filter(e => e.hp > 0);
  const totalEnemyWidth = (aliveEnemies.length * tokenSize) + ((aliveEnemies.length - 1) * gap);
  let eStartX = (CANVAS_WIDTH - totalEnemyWidth) / 2; 
  const enemyBaseY = 40;

  for (const e of aliveEnemies) {
    // ¿Es el turno de este monstruo específico?
    const isTurn = currentEntity === e; 
    
    const monsterImg = e.image || 'https://i.pinimg.com/736x/a6/5e/68/a65e6895b802188f28a0876724651edb.jpg';
    await drawToken(ctx, monsterImg, eStartX, enemyBaseY, tokenSize, '#ff0000', isTurn);
    eStartX += tokenSize + gap;
  }

  // 3. JUGADORES (Franja Inferior, en línea recta estática)
  const alivePlayers = combat.players.filter(p => p.hp > 0 && !p.escaped && !p.isDead);
  const totalPlayerWidth = (alivePlayers.length * tokenSize) + ((alivePlayers.length - 1) * gap);
  let pStartX = (CANVAS_WIDTH - totalPlayerWidth) / 2; 
  const playerBaseY = 320; 

  for (const p of alivePlayers) {
    // ¿Es el turno de este jugador específico?
    const isTurn = currentEntity.id === p.id;
    
    const profile = getProfile(p.id);
    const playerImg = profile?.foto || 'https://i.pinimg.com/736x/75/48/3c/75483c7bf82bd3aeb68821249fae7ff7.jpg';
    await drawToken(ctx, playerImg, pStartX, playerBaseY, tokenSize, '#3b82f6', isTurn);
    pStartX += tokenSize + gap;
  }

  return new AttachmentBuilder(canvas.toBuffer(), { name: 'combat_render.png' });
}

module.exports = { generateCombatImage };