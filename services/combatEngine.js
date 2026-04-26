const activeCombats = new Map();

// Corrección: Generación de cadena visual de bloques sin información adicional
function generarBarra(actual, max) {
  const porcentaje = Math.max(0, Math.min(100, Math.round((actual / max) * 100)));
  const lleno = Math.round((porcentaje / 100) * 10);
  const vacio = Math.max(0, 10 - lleno);
  return '█'.repeat(lleno) + '░'.repeat(vacio);
}

// Corrección: Soporte para una lista unificada de entidades
function calcularIniciativa(combatientes) {
  // Cálculo de iniciativa: Tirada pseudoaleatoria (1-20) más modificador de destreza
  combatientes.forEach(c => {
    const destreza = c.stats?.destreza || 0;
    c.iniciativa = Math.floor(Math.random() * 20) + 1 + destreza;
  });

  // Ordenamiento descendente para establecimiento de la cola de turnos
  return combatientes.sort((a, b) => b.iniciativa - a.iniciativa);
}

function calcularAtaque(atkStats, defStats, arma) {
  // Selección del atributo de ataque primario
  let atkStatVal = atkStats.destreza || 0; // Sistemas balísticos y armas de filo emplean Destreza
  
  if (!arma || (arma.type && arma.type.includes('contundente'))) {
    atkStatVal = atkStats.fuerza || 0; // Impactos físicos y armas contundentes emplean Fuerza
  }

  // Cálculo del valor de evasión de la entidad defensora
  const defStatVal = defStats.destreza || 0;

  // Cálculo algorítmico de precisión de impacto
  // Probabilidad base modificada por la diferencia de atributos
  let hitChance = 75 + (atkStatVal * 5) - (defStatVal * 5);
  
  // Aplicación de límites absolutos de éxito y fracaso
  hitChance = Math.max(15, Math.min(95, hitChance));

  const roll = Math.floor(Math.random() * 100) + 1; // Generación de factor aleatorio
  const isHit = roll <= hitChance;
  
  // Evaluación de impacto crítico
  // Modificador de probabilidad crítica en función de los atributos de ataque
  const critChance = Math.max(5, Math.min(25, atkStatVal * 2.5));
  const isCrit = isHit && roll <= critChance;

  return {
    isHit,
    isCrit,
    atkStat: atkStatVal,
    hitChance
  };
}

function calcularMitigacion(defStats, dmgIn) {
  const temple = defStats.temple || 0;
  const destreza = defStats.destreza || 0;

  let finalDamage = dmgIn;
  let tipoMitigacion = null;

  // Cálculo de evasión parcial
  // Probabilidad de mitigación basada en la destreza del defensor
  const partialDodgeChance = Math.max(0, destreza * 5); 
  const roll = Math.floor(Math.random() * 100) + 1;

  if (roll <= partialDodgeChance) {
    finalDamage = Math.floor(finalDamage * 0.5);
    tipoMitigacion = "logra una esquiva parcial";
  }

  // Cálculo de mitigación directa por resistencia física
  // Reducción de daño escalar en función del atributo de temple
  let templeReduction = Math.floor(temple * 1.5); 
  if (templeReduction > 0) {
    finalDamage -= templeReduction;
  }

  // Límite de daño mínimo garantizado en impactos exitosos
  if (finalDamage < 1) finalDamage = 1;

  return {
    finalDamage,
    tipoMitigacion
  };
}

module.exports = {
  activeCombats,
  generarBarra,
  calcularIniciativa,
  calcularAtaque,
  calcularMitigacion
};