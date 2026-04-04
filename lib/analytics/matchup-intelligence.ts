/**
 * lib/analytics/matchup-intelligence.ts
 *
 * Motor de análisis táctico de matchup — razona como un entrenador de élite.
 * Compara armas vs debilidades, analiza superficie, clima, contexto del torneo
 * y genera insights estructurados para la generación de narrativa experta.
 */

import { getPlayerProfile, buildGenericProfile, surfaceEdge, type TacticalProfile } from "./player-profiles";
import type { PlayerPatterns } from "./patterns";

// ── Tipos de salida ───────────────────────────────────────

export interface MatchupIntelligence {
  p1Profile: TacticalProfile;
  p2Profile: TacticalProfile;
  // Armas vs debilidades
  weaponVsWeakness: string | null;   // arma de P1 que ataca debilidad de P2
  weakness2vs1: string | null;       // ventaja inversa (P2 explota debilidad de P1)
  // Superficie
  surfaceEdge: "p1" | "p2" | "neutral";
  surfaceNote: string;
  // Clima
  weatherNote: string | null;
  // Físico
  physicalEdge: "p1" | "p2" | "neutral";
  physicalNote: string | null;
  // Mental
  mentalEdge: "p1" | "p2" | "neutral";
  mentalNote: string | null;
  // Nivel del torneo
  tourneyContextNote: string | null;
  // Factor de riesgo — lo que puede sorprender
  riskFactor: string | null;
  // Resumen del matchup
  keyInsight: string;
  // Quién tiene la ventaja táctica global
  tacticalEdge: "p1" | "p2" | "neutral";
  tacticalEdgeScore: number; // -10 a +10 desde perspectiva P1
}

export interface MatchupConditions {
  surface: string;
  tourneyLevel: string;
  tournament: string;
  weather?: {
    temp: number;
    windSpeed: number;
    humidity: number;
    effect: string;
  };
  p1RecentForm?: string;    // "excellent" | "good" | "average" | "poor"
  p2RecentForm?: string;
  p1RankEstimated?: number | null;
  p2RankEstimated?: number | null;
  isIndoor?: boolean;
}

// ── Análisis principal ────────────────────────────────────

export function analyzeMatchup(
  p1Slug: string,
  p2Slug: string,
  p1Patterns: PlayerPatterns | null,
  p2Patterns: PlayerPatterns | null,
  conditions: MatchupConditions,
): MatchupIntelligence {
  // Obtener perfiles (fallback a genérico si no existe)
  const style1 = inferStyle(p1Patterns);
  const style2 = inferStyle(p2Patterns);
  const surf = conditions.surface.includes("clay") ? "clay"
    : conditions.surface.includes("grass") ? "grass" : "hard";

  const p1Profile = getPlayerProfile(p1Slug) ?? buildGenericProfile(
    p1Slug, style1,
    surfFromStyle(style1, "clay"), surfFromStyle(style1, "hard"), surfFromStyle(style1, "grass"),
  );
  const p2Profile = getPlayerProfile(p2Slug) ?? buildGenericProfile(
    p2Slug, style2,
    surfFromStyle(style2, "clay"), surfFromStyle(style2, "hard"), surfFromStyle(style2, "grass"),
  );

  // ── Armas vs debilidades ──────────────────────────────

  const w1vW2 = checkWeaponVsWeakness(p1Profile, p2Profile, surf);
  const w2vW1 = checkWeaponVsWeakness(p2Profile, p1Profile, surf);

  // ── Superficie ────────────────────────────────────────

  const sEdgeVal = surfaceEdge(p1Profile, p2Profile, conditions.surface);
  const surfEdge: "p1" | "p2" | "neutral" = sEdgeVal >= 2 ? "p1" : sEdgeVal <= -2 ? "p2" : "neutral";
  const surfNote = buildSurfaceNote(p1Profile, p2Profile, surf, sEdgeVal);

  // ── Clima ─────────────────────────────────────────────

  const wNote = conditions.weather
    ? buildWeatherNote(p1Profile, p2Profile, conditions.weather)
    : null;

  // ── Físico ────────────────────────────────────────────

  const physDiff = p1Profile.fitness - p2Profile.fitness + (p1Profile.speed - p2Profile.speed) * 0.5;
  const physEdge: "p1" | "p2" | "neutral" = physDiff >= 1.5 ? "p1" : physDiff <= -1.5 ? "p2" : "neutral";
  const physNote = buildPhysicalNote(p1Profile, p2Profile, physEdge, conditions);

  // ── Mental ────────────────────────────────────────────

  const mentalScore1 = mentalScore(p1Profile);
  const mentalScore2 = mentalScore(p2Profile);
  const mentalDiff = mentalScore1 - mentalScore2;
  const mentalEdge: "p1" | "p2" | "neutral" = mentalDiff >= 1.5 ? "p1" : mentalDiff <= -1.5 ? "p2" : "neutral";
  const mNote = buildMentalNote(p1Profile, p2Profile, mentalEdge);

  // ── Contexto del torneo ────────────────────────────────

  const tContextNote = buildTourneyContextNote(
    p1Profile, p2Profile, conditions.tournament, conditions.tourneyLevel
  );

  // ── Factor de riesgo ──────────────────────────────────

  const risk = buildRiskFactor(p1Profile, p2Profile, conditions);

  // ── Score táctico global ──────────────────────────────

  let score = 0;
  if (w1vW2) score += 2;
  if (w2vW1) score -= 2;
  score += sEdgeVal * 0.6;
  score += physDiff * 0.5;
  score += mentalDiff * 0.7;
  // Ventaja de home
  if (p1Profile.homeVenues?.some((v) => conditions.tournament.toLowerCase().includes(v))) score += 1.5;
  if (p2Profile.homeVenues?.some((v) => conditions.tournament.toLowerCase().includes(v))) score -= 1.5;

  const tEdge: "p1" | "p2" | "neutral" = score >= 2 ? "p1" : score <= -2 ? "p2" : "neutral";
  const keyInsight = buildKeyInsight(p1Profile, p2Profile, w1vW2, w2vW1, surfEdge, mentalEdge, surf);

  return {
    p1Profile, p2Profile,
    weaponVsWeakness: w1vW2,
    weakness2vs1: w2vW1,
    surfaceEdge: surfEdge,
    surfaceNote: surfNote,
    weatherNote: wNote,
    physicalEdge: physEdge,
    physicalNote: physNote,
    mentalEdge: mentalEdge,
    mentalNote: mNote,
    tourneyContextNote: tContextNote,
    riskFactor: risk,
    keyInsight,
    tacticalEdge: tEdge,
    tacticalEdgeScore: Math.round(score * 10) / 10,
  };
}

// ── Helpers internos ──────────────────────────────────────

function inferStyle(pat: PlayerPatterns | null): string {
  if (!pat) return "aggressive-baseliner";
  const aces = pat.avgAces ?? 0;
  const bpSave = pat.bpSavePct ?? 0.5;
  const winners = pat.avgWinners ?? 0;
  const duration = pat.avgDuration ?? 90;
  if (aces >= 7) return "big-server";
  if (bpSave >= 0.70 && duration >= 115 && winners <= 24) return "counter-puncher";
  if (winners >= 28 && duration <= 100) return "aggressive-baseliner";
  return "aggressive-baseliner";
}

function surfFromStyle(style: string, surface: string): number {
  if (surface === "clay") {
    return style === "counter-puncher" ? 8 : style === "big-server" ? 5 : 7;
  }
  if (surface === "grass") {
    return style === "big-server" || style === "serve-and-volley" ? 8 : 6;
  }
  return 7; // hard default
}

function mentalScore(p: TacticalProfile): number {
  const baseMap = { elevates: 10, consistent: 7, inconsistent: 4, declines: 2 };
  return (baseMap[p.pressure] + p.clutch + p.comeback) / 3;
}

/**
 * Comprueba si el arma principal de P1 ataca directamente la debilidad de P2.
 * Devuelve una frase descriptiva o null si no hay match.
 */
function checkWeaponVsWeakness(p1: TacticalProfile, p2: TacticalProfile, surf: string): string | null {
  const weapon = p1.weapon.toLowerCase();
  const weakness = p2.weakness.toLowerCase();

  // Patrones de weapon-weakness que se conocen del tenis
  const matches: Array<[RegExp, RegExp, string]> = [
    [/topspin|forehand.*(alto|bote|pesado)/i, /backhand.*(alto|bote)|revés.*(alto|bote)/i,
      `el topspin de ${p1.name} genera botes altos que atacan directamente la zona de dificultad del revés de ${p2.name}`],
    [/saque|kick/i, /segundo.*(servicio|saque)|saque.*(atacado|débil)/i,
      `el saque de ${p1.name} neutraliza la capacidad de ${p2.name} de atacar el segundo servicio — su arma principal`],
    [/revés|backhand.*dtl/i, /revés.*(presión|débil|bloqu)|backhand.*(presión)/i,
      `el revés de ${p1.name} ataca directamente la zona de menor seguridad del backhand de ${p2.name}`],
    [/drop.shot|dejada/i, /arcilla.*(lento)|ritmo.*(lento)|peloteo.*(largo)/i,
      `el drop shot de ${p1.name} rompe el ritmo defensivo de ${p2.name} antes de que pueda establecer el peloteo largo`],
    [/velocidad|speed|zurdo/i, /ritmo.*(lento)|topspin.*(alto)/i,
      `la velocidad de ${p1.name} le permite tomar el tiempo antes de que ${p2.name} genere el efecto y bote que necesita`],
    [/net|red|volea/i, /pase|passing|red.*débil/i,
      `el juego de red de ${p1.name} explota la debilidad de ${p2.name} al subir — sus pases no son su punto fuerte`],
  ];

  for (const [wMatch, weakMatch, note] of matches) {
    if (wMatch.test(weapon) && weakMatch.test(weakness)) return note;
    if (wMatch.test(weapon) && weakMatch.test(p2.weakness2 ?? "")) return note;
  }

  // Inferencia por estilo: algunos matchups son conocidos
  if (p1.style === "big-server" && p2.style === "counter-puncher") {
    if (surf !== "clay") {
      return `el saque de ${p1.name} elimina el juego de peloteo que necesita ${p2.name} — en ${surf === "grass" ? "hierba" : "pista dura"} ese matchup es claramente favorable al servidor`;
    }
  }
  if (p1.style === "counter-puncher" && p2.style === "big-server" && surf === "clay") {
    return `en arcilla, el juego de peloteo de ${p1.name} neutraliza la ventaja de saque de ${p2.name} — la tierra ralentiza la pelota y obliga a construir el punto`;
  }
  if (p1.style === "all-court" && (p2.style === "counter-puncher" || p2.style === "defensive-baseliner")) {
    return `la variedad táctica de ${p1.name} (drop shots, subidas a la red, cambios de ritmo) crea problemas estructurales para el juego lineal de ${p2.name}`;
  }

  return null;
}

function buildSurfaceNote(p1: TacticalProfile, p2: TacticalProfile, surf: string, diff: number): string {
  const surfLabel = surf === "clay" ? "arcilla" : surf === "grass" ? "hierba" : "pista dura";
  const favored = diff >= 2 ? p1.name : diff <= -2 ? p2.name : null;

  if (!favored) {
    return `Ambos jugadores son competitivos en ${surfLabel} — la superficie no es un factor diferencial claro en este partido.`;
  }

  const score1 = p1[surf as "clay" | "hard" | "grass"];
  const score2 = p2[surf as "clay" | "hard" | "grass"];
  const loser = diff >= 2 ? p2.name : p1.name;

  if (surf === "clay") {
    return `En arcilla, ${favored} tiene una ventaja contextual significativa (${score1 > score2 ? score1 : score2}/10 vs ${score1 > score2 ? score2 : score1}/10) — sus patrones de juego se adaptan mejor a los botes altos y peloteos largos que caracterizan esta superficie. ${loser} necesitará neutralizar esa ventaja cambiando el ritmo.`;
  }
  if (surf === "grass") {
    return `En hierba, ${favored} se beneficia de una superficie que amplifica su tipo de juego — el bote bajo y el punto más corto favorecen su arma principal. ${loser} tendrá menos tiempo para ejecutar su táctica habitual.`;
  }
  return `En pista dura, ${favored} ha demostrado históricamente mejores resultados en esta superficie — su juego se adapta mejor al ritmo y rebote de la pista dura que el de ${loser}.`;
}

function buildWeatherNote(
  p1: TacticalProfile,
  p2: TacticalProfile,
  weather: NonNullable<MatchupConditions["weather"]>,
): string | null {
  const parts: string[] = [];

  if (weather.windSpeed > 25) {
    // Viento: afecta más al topspin que al juego plano
    const topspinPlayer1 = p1.style === "counter-puncher" || p1.weapon.includes("topspin");
    const topspinPlayer2 = p2.style === "counter-puncher" || p2.weapon.includes("topspin");
    if (topspinPlayer1 && !topspinPlayer2) {
      parts.push(`el viento de ${weather.windSpeed.toFixed(0)} km/h complica más el juego de ${p1.name} — su topspin pesado pierde dirección con el viento, mientras que el juego más plano de ${p2.name} es más estable`);
    } else if (topspinPlayer2 && !topspinPlayer1) {
      parts.push(`el viento (${weather.windSpeed.toFixed(0)} km/h) penaliza el juego de alto topspin de ${p2.name} más que el juego de ${p1.name}`);
    } else {
      parts.push(`las condiciones de viento (${weather.windSpeed.toFixed(0)} km/h) harán el partido impredecible para ambos — la gestión del viento puede ser el factor diferencial`);
    }
  }

  if (weather.temp > 35) {
    const fitter = p1.fitness >= p2.fitness ? p1.name : p2.name;
    parts.push(`el calor extremo (${weather.temp.toFixed(0)}°C) convertirá este partido en una batalla física — ${fitter} tiene ventaja de condición física en estas circunstancias`);
  } else if (weather.temp < 10) {
    const bigServer = p1.style === "big-server" ? p1.name : p2.style === "big-server" ? p2.name : null;
    if (bigServer) {
      parts.push(`el frío (${weather.temp.toFixed(0)}°C) ralentiza las pelotas y reduce el efecto del saque de ${bigServer} — en estas condiciones el peloteo largo gana importancia`);
    }
  }

  if (weather.humidity > 75) {
    parts.push(`la alta humedad (${weather.humidity}%) hará la pelota más pesada — los jugadores con saque como arma principal ven reducido su margen de ventaja`);
  }

  return parts.length > 0 ? parts.join(". ") + "." : null;
}

function buildPhysicalNote(
  p1: TacticalProfile,
  p2: TacticalProfile,
  edge: "p1" | "p2" | "neutral",
  conditions: MatchupConditions,
): string | null {
  if (edge === "neutral") return null;
  const fav = edge === "p1" ? p1 : p2;
  const other = edge === "p1" ? p2 : p1;

  const isLongMatch = ["grand-slam", "masters-1000"].includes(conditions.tourneyLevel);
  const suffix = isLongMatch
    ? ` — especialmente relevante en un ${conditions.tourneyLevel === "grand-slam" ? "Grand Slam al mejor de 5 sets" : "Masters 1000"}`
    : "";

  return `${fav.name} tiene ventaja física sobre ${other.name} en condición y velocidad${suffix}. En los tramos finales del partido, esa diferencia puede ser determinante.`;
}

function buildMentalNote(
  p1: TacticalProfile,
  p2: TacticalProfile,
  edge: "p1" | "p2" | "neutral",
): string | null {
  if (edge === "neutral") return null;
  const fav = edge === "p1" ? p1 : p2;
  const other = edge === "p1" ? p2 : p1;

  const favDesc =
    fav.pressure === "elevates" ? `${fav.name} eleva su nivel en los momentos decisivos — sus estadísticas en puntos clave son superiores a su media general` :
    fav.pressure === "consistent" ? `${fav.name} es mentalmente consistente y no se desmorona en los momentos difíciles` :
    `${fav.name} es más fiable mentalmente en este contexto`;

  const otherDesc =
    other.pressure === "declines" ? `mientras que ${other.name} tiene un historial documentado de caídas de nivel en los puntos más importantes` :
    other.pressure === "inconsistent" ? `mientras que ${other.name} ha mostrado inconsistencia mental en los momentos límite` :
    `frente a ${other.name} que es menos predecible bajo presión`;

  return `${favDesc}, ${otherDesc}.`;
}

function buildTourneyContextNote(
  p1: TacticalProfile,
  p2: TacticalProfile,
  tournament: string,
  level: string,
): string | null {
  const t = tournament.toLowerCase();

  // Home advantage
  const p1Home = p1.homeVenues?.some((v) => t.includes(v));
  const p2Home = p2.homeVenues?.some((v) => t.includes(v));

  if (p1Home) {
    return `${p1.name} juega con ventaja de local en ${tournament} — el apoyo del público y el conocimiento de las condiciones específicas de esta pista son un activo real.`;
  }
  if (p2Home) {
    return `${p2.name} juega en su territorio en ${tournament} — el factor casa puede ser un elemento más en un partido ya de por sí ajustado.`;
  }

  // Grand Slam context
  if (level === "grand-slam") {
    const gs1 = p1.clutch >= 9;
    const gs2 = p2.clutch >= 9;
    if (gs1 && !gs2) {
      return `En un Grand Slam, el historial mental de ${p1.name} en los momentos más importantes es un activo adicional — los jugadores que han ganado GS tienen una ventaja psicológica real en las últimas rondas.`;
    }
    if (gs2 && !gs1) {
      return `El contexto de Grand Slam favorece a ${p2.name} — su historial en las últimas rondas de los majors es superior.`;
    }
  }

  // Finals of major tournaments
  if (level === "masters-1000" || level === "grand-slam") {
    if (p1.pressure === "declines" || p2.pressure === "declines") {
      const at_risk = p1.pressure === "declines" ? p1.name : p2.name;
      return `En una etapa avanzada del torneo, el historial de ${at_risk} en las últimas rondas de los torneos importantes es un factor de incertidumbre adicional.`;
    }
  }

  return null;
}

function buildRiskFactor(
  p1: TacticalProfile,
  p2: TacticalProfile,
  conditions: MatchupConditions,
): string | null {
  // Si el favorito tiene historial de inconsistencia
  if (p1.pressure === "inconsistent" || p1.pressure === "declines") {
    return `La inconsistencia de ${p1.name} es el factor de riesgo principal — si no está al 100%, ${p2.name} tiene la capacidad de aprovechar esas fluctuaciones.`;
  }
  if (p2.pressure === "inconsistent" || p2.pressure === "declines") {
    return `El comodín es la posibilidad de que ${p2.name} aparezca en uno de sus mejores días — su irregularidad hace difícil predecir cuándo ocurrirá ese partido brillante.`;
  }
  // Superficie como riesgo
  if (conditions.surface.includes("clay") && p1.clay <= 5) {
    return `En arcilla, el juego de ${p1.name} está fuera de su zona de confort — la superficie puede nivelar un partido que en pista dura tendría un resultado más claro.`;
  }
  if (conditions.surface.includes("grass") && (p1.grass <= 5 || p2.grass <= 5)) {
    const atRisk = p1.grass <= 5 ? p1.name : p2.name;
    return `La hierba sigue siendo una superficie impredecible — el factor temporal (adaptación a los primeros días de temporada) puede influir en el rendimiento de ${atRisk}.`;
  }
  // Clima
  if (conditions.weather && conditions.weather.windSpeed > 30) {
    return `Las condiciones de viento fuerte (${conditions.weather.windSpeed.toFixed(0)} km/h) son el mayor factor de disrupción — pueden nivelar el partido independientemente de la calidad técnica de cada jugador.`;
  }
  return null;
}

function buildKeyInsight(
  p1: TacticalProfile,
  p2: TacticalProfile,
  w1vW2: string | null,
  w2vW1: string | null,
  surfEdge: "p1" | "p2" | "neutral",
  mentalEdge: "p1" | "p2" | "neutral",
  surf: string,
): string {
  if (w1vW2 && !w2vW1) {
    return `Matchup favorable para ${p1.name}: ${w1vW2.split(" — ")[0]}. La táctica de ${p2.name} tendrá que encontrar otro camino.`;
  }
  if (w2vW1 && !w1vW2) {
    return `Matchup complicado para ${p1.name}: ${w2vW1.split(" — ")[0]}. Necesitará cambiar el plan si ese patrón domina.`;
  }
  if (w1vW2 && w2vW1) {
    return `Partido de doble filo — ambos jugadores tienen armas que atacan las debilidades del rival. Quien ejecute mejor en los momentos clave decidirá el partido.`;
  }
  if (surfEdge !== "neutral") {
    const fav = surfEdge === "p1" ? p1.name : p2.name;
    return `La superficie es el factor diferencial: ${fav} tiene ventaja estructural en ${surf === "clay" ? "arcilla" : surf === "grass" ? "hierba" : "pista dura"}.`;
  }
  if (mentalEdge !== "neutral") {
    const fav = mentalEdge === "p1" ? p1.name : p2.name;
    return `Partido igualado técnicamente — el factor mental favorece a ${fav} y puede ser el elemento diferencial en los momentos decisivos.`;
  }
  return "Partido muy equilibrado sin ventajas tácticas claras — la consistencia del día y los momentos clave decidirán el ganador.";
}
