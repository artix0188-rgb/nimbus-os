const activeCombats = new Map();

// 🔥 FIX: AHORA SOLO DEVUELVE LOS BLOQUES, SIN TEXTO EXTRA 🔥
function generarBarra(actual, max) {
  const porcentaje = Math.max(0, Math.min(100, Math.round((actual / max) * 100)));
  const lleno = Math.round((porcentaje / 100) * 10);
  const vacio = Math.max(0, 10 - lleno);
  return '█'.repeat(lleno) + '░'.repeat(vacio);
}

// 🔥 FIX: AHORA ACEPTA UNA SOLA LISTA COMO LO PIDE TU COMANDO 🔥
function calcularIniciativa(combatientes) {
  // Tirada de iniciativa: 1d20 + Destreza
  combatientes.forEach(c => {
    const destreza = c.stats?.destreza || 0;
    c.iniciativa = Math.floor(Math.random() * 20) + 1 + destreza;
  });

  // Ordenar de mayor a menor iniciativa para la cola de turnos
  return combatientes.sort((a, b) => b.iniciativa - a.iniciativa);
}

function calcularAtaque(atkStats, defStats, arma) {
  // 1. Determinar qué estadística usa el atacante
  let atkStatVal = atkStats.destreza || 0; // Armas de fuego y blancas usan Destreza
  
  if (!arma || (arma.type && arma.type.includes('contundente'))) {
    atkStatVal = atkStats.fuerza || 0; // Puñetazos y armas contundentes usan Fuerza
  }

  // 2. Determinar la evasión del defensor
  const defStatVal = defStats.destreza || 0;

  // 3. FÓRMULA DE PRECISIÓN
  // Base 75% + (5% por stat atacante) - (5% por stat defensor)
  let hitChance = 75 + (atkStatVal * 5) - (defStatVal * 5);
  
  // Limitadores: Siempre hay un 5% de fallar y un 15% mínimo de acertar
  hitChance = Math.max(15, Math.min(95, hitChance));

  const roll = Math.floor(Math.random() * 100) + 1; // Tirada 1-100
  const isHit = roll <= hitChance;
  
  // 4. GOLPES CRÍTICOS
  // Crítico garantizado si la tirada es muy baja, escalando con tu stat
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

  // 1. ESQUIVA PARCIAL (Glancing Blow)
  // 5% de chance por cada punto de destreza del defensor de mitigar la mitad del daño
  const partialDodgeChance = Math.max(0, destreza * 5); 
  const roll = Math.floor(Math.random() * 100) + 1;

  if (roll <= partialDodgeChance) {
    finalDamage = Math.floor(finalDamage * 0.5);
    tipoMitigacion = "logra una esquiva parcial";
  }

  // 2. MITIGACIÓN POR TEMPLE (Resistencia dura)
  // Cada punto de temple resta daño plano al impacto
  let templeReduction = Math.floor(temple * 1.5); 
  if (templeReduction > 0) {
    finalDamage -= templeReduction;
  }

  // El daño mínimo si el golpe acierta siempre será 1
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