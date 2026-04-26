const floorDrops = new Map();

function dropItem(channelId, inventoryItemData) {
  if (!floorDrops.has(channelId)) floorDrops.set(channelId, []);
  
  const dropData = {
    dropId: 'drop-' + Math.random().toString(36).substring(2, 8),
    itemData: inventoryItemData, // Estructura de datos: Almacena identificador único, código de objeto y existencias
    timestamp: Date.now()
  };

  floorDrops.get(channelId).push(dropData);
}

// Rutina de recolección de basura asíncrona: purga de entidades descartadas que superen el umbral de 20 minutos
setInterval(() => {
  const now = Date.now();
  const limite = 20 * 60 * 1000; 

  floorDrops.forEach((drops, channelId) => {
    const validDrops = drops.filter(d => now - d.timestamp < limite);
    if (validDrops.length === 0) floorDrops.delete(channelId);
    else floorDrops.set(channelId, validDrops);
  });
}, 60000);

module.exports = { floorDrops, dropItem };