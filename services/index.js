// Punto de entrada unificado para los módulos de servicio del sistema
const profileService = require('./profileService');
const weatherService = require('./weatherService');
const inventoryService = require('./inventoryService');
const deathService = require('./deathService');
const floorService = require('./floorService');
const migrationService = require('./migrationService');

module.exports = {
  profileService,
  weatherService,
  inventoryService,
  deathService,
  floorService,
  migrationService
};