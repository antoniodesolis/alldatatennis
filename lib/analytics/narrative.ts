/**
 * lib/analytics/narrative.ts
 *
 * Generador de análisis narrativo experto — completamente específico para cada partido.
 * Enfoque: contar la historia del partido, no listar datos. Cada análisis parte del
 * dato más decisivo del matchup concreto y construye alrededor de él.
 */

import type { MatchupIntelligence } from "./matchup-intelligence";
import type { TacticalProfile } from "./player-profiles";
import type { PlayerPatterns, SplitStat } from "./patterns";

// ── Tipos de entrada ──────────────────────────────────────

export interface NarrativeInput {
  // Identidad
  p1Name: string;
  p2Name: string;
  p1Slug: string;
  p2Slug: string;

  // Contexto del partido
  tournament: string;
  tourneyLevel: string;
  surface: string;
  round?: string;              // "R128"|"R64"|"R32"|"R16"|"QF"|"SF"|"F"|"Q"|"RR"
  timeOfDay?: string;          // "day" | "evening" | "night"
  isIndoor?: boolean;
  courtSpeed?: number | null;  // CSI 0-100
  courtProfile?: string | null;// "fast" | "medium-fast" | "medium" | "slow"

  // Condiciones climáticas (si outdoor)
  weather?: {
    temp: number;
    windSpeed: number;
    humidity: number;
    effect: string;
  };

  // Probabilidades
  winPct1: number;
  winPct2: number;

  // Rankings estimados
  p1Rank?: number | null;
  p2Rank?: number | null;

  // Forma reciente (3 meses)
  recentForm1?: { winRate: number | null; matches: number };
  recentForm2?: { winRate: number | null; matches: number };

  // Rachas actuales (positivo = racha ganadora, negativo = perdedora)
  p1Streak?: number;
  p2Streak?: number;

  // Días de descanso
  daysRest1?: number | null;
  daysRest2?: number | null;

  // H2H
  h2h?: { p1Wins: number; p2Wins: number; total: number };

  // Rendimiento en el turno de este partido (day/evening/night)
  p1TimeOfDaySplit?: { winRate: number | null; matches: number } | null;
  p2TimeOfDaySplit?: { winRate: number | null; matches: number } | null;

  // Historial en este torneo específico
  p1TourneyHistory?: { winRate: number | null; matches: number } | null;
  p2TourneyHistory?: { winRate: number | null; matches: number } | null;

  // Patrones completos
  p1Patterns: PlayerPatterns | null;
  p2Patterns: PlayerPatterns | null;

  // Análisis del matchup (armas vs debilidades, superficie, clima, etc.)
  matchup: MatchupIntelligence;

  // Factor con más peso del motor
  mainFactor?: string;

  // Insights acumulados de partidos reales
  p1AccumulatedInsights?: AccumulatedInsightsSnap | null;
  p2AccumulatedInsights?: AccumulatedInsightsSnap | null;
}

export interface AccumulatedInsightsSnap {
  matchPatterns: { dominio: number; batalla: number; irregular: number; remontada: number };
  tacticalObservations: string[];
  weaponsConfirmed: string[];
  weaknessesConfirmed: string[];
  mentalObservations: string[];
  matchCount: number;
}

export interface TacticalAnalysis {
  narrative: string;
  matchupSummary: string;
  keyWeapon: string | null;
  riskFactor: string | null;
  confidence: "alta" | "moderada" | "baja";
}

// ── Tipo de matchup ──────────────────────────────────────

type MatchupType =
  | "dominio-claro"    // favorito ≥72% + ventaja táctica clara
  | "choque-estilos"   // estilos muy distintos, desequilibrio moderado
  | "test-mental"      // SF/F o muy igualado con H2H relevante
  | "batalla-fisica"   // arcilla + fitness diferente o calor extremo
  | "sorpresa"         // underdog con buena superficie o forma
  | "equilibrado";     // genuinamente abierto

// ── Utilidades ────────────────────────────────────────────

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  if (/^[A-Z]\.?$/.test(last)) return parts[0];
  return last;
}

/** Porcentaje con 1 decimal (ej. 68.4%) */
function pct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "?%";
  const val = v * 100;
  return val % 1 === 0 ? `${val.toFixed(0)}%` : `${val.toFixed(decimals)}%`;
}

/** Capitaliza la primera letra */
function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Diferencia en puntos porcentuales */
function pctDiff(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  return Math.abs(a - b) * 100;
}

/** Hash simple para variar frases sin randomness */
function nameHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function surfaceKey(surface: string): "clay" | "hard" | "grass" | "indoor" {
  if (surface.includes("clay")) return "clay";
  if (surface.includes("grass")) return "grass";
  if (surface.includes("indoor")) return "indoor";
  return "hard";
}

function surfaceLabel(s: string): string {
  if (s.includes("clay")) return "arcilla";
  if (s.includes("grass")) return "hierba";
  if (s.includes("indoor")) return "pista dura indoor";
  return "pista dura";
}

function levelName(level: string): string {
  return ({
    "grand-slam":   "Grand Slam",
    "masters-1000": "Masters 1000",
    "atp-500":      "ATP 500",
    "atp-250":      "ATP 250",
    "atp-finals":   "ATP Finals",
  } as Record<string, string>)[level] ?? "torneo ATP";
}

function roundName(round: string | undefined): string | null {
  if (!round) return null;
  return ({
    "R128": "primera ronda",
    "R64":  "segunda ronda",
    "R32":  "tercera ronda",
    "R16":  "octavos de final",
    "QF":   "cuartos de final",
    "SF":   "semifinal",
    "F":    "final",
    "RR":   "fase de grupos",
    "Q":    "clasificación",
    "Q1":   "primera ronda de clasificación",
    "Q2":   "segunda ronda de clasificación",
    "BR":   "partido por el tercer puesto",
  } as Record<string, string>)[round.toUpperCase()] ?? null;
}

function matchesWonInTourney(round: string | undefined): number | null {
  return ({
    "R128": 0, "R64": 1, "R32": 2, "R16": 3,
    "QF": 4, "SF": 5, "F": 6, "RR": 0,
  } as Record<string, number>)[round?.toUpperCase() ?? ""] ?? null;
}

function weatherSignificant(w: NarrativeInput["weather"]): boolean {
  if (!w) return false;
  return w.windSpeed > 15 || w.temp > 30 || w.temp < 14 || w.humidity > 75;
}

function getSurfaceSplit(pat: PlayerPatterns | null, surface: string): SplitStat | null {
  if (!pat) return null;
  if (pat.surfaceSplits) {
    const key = surface.includes("clay") ? "clay"
      : surface.includes("grass") ? "grass"
      : surface.includes("indoor") ? "indoor hard"
      : "hard";
    const s = pat.surfaceSplits[key];
    if (s && s.matches >= 5) return s;
  }
  if (pat.surface && pat.surface !== "" && pat.winRate != null && pat.matchesUsed >= 5) {
    return { winRate: pat.winRate, matches: pat.matchesUsed, wins: pat.wins, losses: pat.losses };
  }
  return null;
}

function getLevelSplit(pat: PlayerPatterns | null, level: string): SplitStat | null {
  if (!pat?.levelSplits) return null;
  const s = pat.levelSplits[level];
  return s && s.matches >= 4 ? s : null;
}

function getRoundSplit(pat: PlayerPatterns | null, round: string | undefined): SplitStat | null {
  if (!round || !pat?.roundSplits) return null;
  const s = pat.roundSplits[round.toUpperCase()];
  return s && s.matches >= 6 ? s : null;
}

// ── Detectar tipo de matchup ─────────────────────────────

function detectMatchupType(
  winPctFav: number,
  favProfile: TacticalProfile,
  dogProfile: TacticalProfile,
  matchup: MatchupIntelligence,
  input: NarrativeInput,
  favIsP1: boolean,
): MatchupType {
  const { surface, round } = input;

  // Dominio claro: favorito muy por encima + ventaja táctica
  if (winPctFav >= 72 && Math.abs(matchup.tacticalEdgeScore) >= 2) return "dominio-claro";

  // Choque de estilos: estilos opuestos
  const styleClash = (
    (favProfile.style === "big-server"           && (dogProfile.style === "counter-puncher" || dogProfile.style === "defensive-baseliner")) ||
    (favProfile.style === "counter-puncher"      && (dogProfile.style === "big-server" || dogProfile.style === "aggressive-baseliner")) ||
    (favProfile.style === "serve-and-volley"     && dogProfile.style === "defensive-baseliner") ||
    (favProfile.style === "aggressive-baseliner" && dogProfile.style === "counter-puncher")
  );
  if (styleClash && winPctFav >= 55) return "choque-estilos";

  // Test mental: SF/F con partido igualado, o H2H muy vivo
  const isLateRound = round === "SF" || round === "F" || round === "QF";
  const h2hClose = input.h2h && input.h2h.total >= 4 && Math.abs(input.h2h.p1Wins - input.h2h.p2Wins) <= 2;
  if (isLateRound && winPctFav <= 65) return "test-mental";
  if (h2hClose && winPctFav <= 62) return "test-mental";

  // Batalla física: arcilla o calor con diferencia de fitness
  const fitDiff = Math.abs((favProfile.fitness ?? 5) - (dogProfile.fitness ?? 5));
  const hotWeather = !input.isIndoor && input.weather && input.weather.temp > 30;
  if ((surface.includes("clay") || hotWeather) && fitDiff >= 2) return "batalla-fisica";

  // Sorpresa potencial: underdog tiene buena superficie o buena forma reciente
  const dogPat = favIsP1 ? input.p2Patterns : input.p1Patterns;
  const dogSurf = getSurfaceSplit(dogPat, surface);
  const dogForm = favIsP1 ? input.recentForm2 : input.recentForm1;
  const dogStreak = favIsP1 ? input.p2Streak : input.p1Streak;
  if (winPctFav <= 63) {
    if (dogSurf && (dogSurf.winRate ?? 0) >= 0.68) return "sorpresa";
    if (dogForm && (dogForm.winRate ?? 0) >= 0.72 && dogForm.matches >= 6) return "sorpresa";
    if ((dogStreak ?? 0) >= 5) return "sorpresa";
  }

  return "equilibrado";
}

// ── Párrafo 1: La escena — narración de entrada ──────────

function buildOpeningParagraph(
  input: NarrativeInput,
  matchupType: MatchupType,
  favLast: string,
  dogLast: string,
  favIsP1: boolean,
  winPctFav: number,
  winPctDog: number,
  favProfile: TacticalProfile,
  dogProfile: TacticalProfile,
): string {
  const surf = surfaceLabel(input.surface);
  const level = levelName(input.tourneyLevel);
  const rnd = roundName(input.round);
  const winsNeeded = matchesWonInTourney(input.round);
  const rndCtx = rnd ? `${cap(rnd)} del ` : "";

  const favPat = favIsP1 ? input.p1Patterns : input.p2Patterns;
  const dogPat = favIsP1 ? input.p2Patterns : input.p1Patterns;
  const favSurf = getSurfaceSplit(favPat, input.surface);
  const dogSurf = getSurfaceSplit(dogPat, input.surface);
  const favStreak = favIsP1 ? input.p1Streak : input.p2Streak;
  const dogStreak = favIsP1 ? input.p2Streak : input.p1Streak;

  const seed = nameHash(favLast + dogLast);
  const parts: string[] = [];

  // ── Apertura principal según tipo de matchup ─────────────

  if (matchupType === "dominio-claro") {
    const openers = [
      `${rndCtx}${input.tournament} tiene un favorito muy claro: ${favLast} con el ${winPctFav}% de probabilidades sobre ${surf} de ${level}.`,
      `Sobre el papel, ${favLast} lleva la iniciativa en esta ${rnd ?? "ronda"} del ${input.tournament} — ${winPctFav}% frente al ${winPctDog}% de ${dogLast}.`,
      `${rndCtx}${input.tournament}. El modelo ve a ${favLast} como gran favorito (${winPctFav}%) y hay motivos concretos para ello.`,
    ];
    parts.push(pick(openers, seed));

    // Añadir el dato más decisivo
    if (favSurf && dogSurf) {
      const diff = pctDiff(favSurf.winRate, dogSurf.winRate);
      if (diff != null && diff >= 10) {
        parts.push(`En ${surf}, ${favLast} tiene un historial muy superior: ${pct(favSurf.winRate)} en ${favSurf.matches} partidos frente al ${pct(dogSurf.winRate)} de ${dogLast} — una diferencia de ${diff.toFixed(0)} puntos que no es casualidad.`);
      }
    }

  } else if (matchupType === "choque-estilos") {
    const stylePairs: Record<string, string> = {
      "big-server":           "servicio como arma letal",
      "counter-puncher":      "defensa sólida y contraataque",
      "aggressive-baseliner": "juego ofensivo desde el fondo",
      "serve-and-volley":     "red y presión constante",
      "baseliner":            "consistencia desde el fondo",
      "all-court":            "juego completo y adaptable",
    };
    const favStyle = stylePairs[favProfile.style] ?? favProfile.style;
    const dogStyle = stylePairs[dogProfile.style] ?? dogProfile.style;
    const openers = [
      `${rndCtx}${input.tournament} — ${level} sobre ${surf}. Dos filosofías distintas se enfrentan: ${favLast} con ${favStyle}, ${dogLast} con ${dogStyle}. Quien imponga su modelo de juego desde el inicio tiene mucho ganado.`,
      `Un choque de estilos en ${rndCtx.toLowerCase() || ""}${input.tournament}: ${favLast} (${favStyle}) contra ${dogLast} (${dogStyle}) en ${surf} de ${level}. La pregunta no es solo quién juega mejor, sino quién dicta los términos del partido.`,
    ];
    parts.push(pick(openers, seed));

  } else if (matchupType === "test-mental") {
    const matchesCtx = winsNeeded != null ? `${winsNeeded} victorias para llegar aquí` : "partidos duros para llegar";
    const openers = [
      `${rndCtx}${input.tournament} — uno de esos partidos que se deciden tanto en la cabeza como en la pista. ${favLast} (${winPctFav}%) y ${dogLast} (${winPctDog}%) llegan muy igualados, y en ${level} sobre ${surf} eso significa que los momentos de presión lo decidirán todo.`,
      `${cap(rnd ?? "esta ronda")} del ${input.tournament}: ${level} sobre ${surf}, con dos jugadores separados por ${winPctFav - winPctDog} puntos porcentuales. Cuando la diferencia es tan pequeña, el factor mental pesa tanto como las estadísticas.`,
    ];
    parts.push(pick(openers, seed));

    if (winsNeeded != null && winsNeeded >= 4) {
      parts.push(`Ambos han acumulado ${matchesCtx} — la fatiga física y mental es parte del contexto que no aparece en ninguna hoja de datos.`);
    }

    if (input.h2h && input.h2h.total >= 3) {
      const p1h = input.h2h.p1Wins, p2h = input.h2h.p2Wins;
      const favH = favIsP1 ? p1h : p2h, dogH = favIsP1 ? p2h : p1h;
      if (favH !== dogH) {
        const leader = favH > dogH ? favLast : dogLast;
        const trailer = favH > dogH ? dogLast : favLast;
        parts.push(`El H2H habla: ${leader} lleva ${Math.max(favH, dogH)}-${Math.min(favH, dogH)} en sus duelos directos — un dato psicológico que pesa cuando el marcador está igualado.`);
      } else {
        parts.push(`El H2H está completamente igualado (${p1h}-${p2h}) — ninguno tiene ventaja psicológica sobre el otro.`);
      }
    }

  } else if (matchupType === "batalla-fisica") {
    const fitFav = favProfile.fitness ?? 5;
    const fitDog = dogProfile.fitness ?? 5;
    const hotCtx = !input.isIndoor && input.weather && input.weather.temp > 30
      ? ` con ${input.weather.temp.toFixed(0)}°C en la pista` : "";
    const openers = [
      `${rndCtx}${input.tournament} — ${level} sobre ${surf}${hotCtx}. No todos los partidos en ${surf} se deciden con los golpes; este puede depender de quién aguante mejor físicamente en los momentos finales.`,
      `Sobre ${surf}${hotCtx}, este partido del ${input.tournament} tiene pinta de ser largo y desgastante. La capacidad física puede acabar siendo más decisiva que la técnica.`,
    ];
    parts.push(pick(openers, seed));
    if (Math.abs(fitFav - fitDog) >= 2) {
      const fitterP = fitFav >= fitDog ? favLast : dogLast;
      const fitterVal = Math.max(fitFav, fitDog);
      const lessP = fitFav >= fitDog ? dogLast : favLast;
      const lessVal = Math.min(fitFav, fitDog);
      parts.push(`El perfil físico favorece a ${fitterP} (${fitterVal}/10 vs ${lessVal}/10 de ${lessP}) — una ventaja que se amplía si el partido llega al tercer set.`);
    }

  } else if (matchupType === "sorpresa") {
    const dogStrVal = dogStreak ?? 0;
    const openers = [
      `${rndCtx}${input.tournament} — ${level} sobre ${surf}. ${favLast} sale como favorito (${winPctFav}%), pero ${dogLast} (${winPctDog}%) llega con argumentos reales para complicarlo.`,
      `Sobre ${surf} de ${level}, ${favLast} tiene la ventaja teórica (${winPctFav}%), aunque los datos de ${dogLast} dicen que subestimarlo sería un error.`,
    ];
    parts.push(pick(openers, seed));

    if (dogSurf && (dogSurf.winRate ?? 0) >= 0.68) {
      parts.push(`${dogLast} rinde especialmente bien en ${surf}: ${pct(dogSurf.winRate)} en ${dogSurf.matches} partidos — no es casualidad que el modelo no lo descarte.`);
    } else if (dogStrVal >= 5) {
      parts.push(`${dogLast} llega con ${dogStrVal} victorias en fila — forma que no se puede ignorar.`);
    }

  } else {
    // equilibrado
    const openers = [
      `${rndCtx}${input.tournament} — ${level} sobre ${surf}. El modelo lo ve muy abierto: ${favLast} con el ${winPctFav}% y ${dogLast} con el ${winPctDog}%. En la práctica, cualquiera puede ganar.`,
      `Hay partidos difíciles de analizar porque genuinamente pueden salir de cualquier manera. Este, en ${rndCtx.toLowerCase() || ""}${input.tournament} sobre ${surf}, es uno de ellos: ${winPctFav}% vs ${winPctDog}%.`,
    ];
    parts.push(pick(openers, seed));
  }

  // ── Rachas (solo si son significativas y no ya mencionadas) ──
  const favStreakVal = favStreak ?? 0;
  const dogStreakVal = dogStreak ?? 0;

  if (favStreakVal >= 3 && matchupType !== "dominio-claro") {
    const streakPhrases = [
      `${favLast} encadena ${favStreakVal} victorias consecutivas y llega con confianza.`,
      `La racha de ${favLast} — ${favStreakVal} victorias seguidas — refuerza su condición de favorito.`,
      `${favLast} está en un buen momento: ${favStreakVal} triunfos al hilo antes de este partido.`,
    ];
    parts.push(pick(streakPhrases, seed + 1));
  } else if (favStreakVal <= -3) {
    parts.push(`${favLast} llega con ${Math.abs(favStreakVal)} derrotas seguidas — un bache que el modelo tiene en cuenta.`);
  }

  if (dogStreakVal >= 4) {
    const streakPhrases = [
      `${dogLast} también llega con confianza: ${dogStreakVal} victorias en fila.`,
      `No hay que olvidar que ${dogLast} lleva ${dogStreakVal} triunfos seguidos — llega con momentum.`,
    ];
    parts.push(pick(streakPhrases, seed + 2));
  } else if (dogStreakVal <= -3) {
    parts.push(`${dogLast} viene de perder ${Math.abs(dogStreakVal)} seguidos — llega en un momento difícil.`);
  }

  // ── Descanso (solo si es desequilibrado) ─────────────────
  const favRest = favIsP1 ? input.daysRest1 : input.daysRest2;
  const dogRest = favIsP1 ? input.daysRest2 : input.daysRest1;
  if (favRest != null && dogRest != null) {
    if (favRest === 0 && dogRest >= 2) {
      parts.push(`Un factor a seguir: ${favLast} jugó hoy mismo y llega con menos tiempo de recuperación que ${dogLast} (${dogRest} días de descanso).`);
    } else if (dogRest === 0 && favRest >= 2) {
      parts.push(`${dogLast} llega con fatiga acumulada — jugó hoy, mientras ${favLast} ha podido descansar ${favRest} días.`);
    }
  }

  return parts.join(" ");
}

// ── Párrafo 2: El campo de batalla clave ─────────────────

function buildBattlegroundParagraph(
  input: NarrativeInput,
  matchupType: MatchupType,
  favLast: string,
  dogLast: string,
  favIsP1: boolean,
  winPctFav: number,
  favProfile: TacticalProfile,
  dogProfile: TacticalProfile,
): string {
  const parts: string[] = [];
  const { matchup } = input;
  const surf = surfaceLabel(input.surface);
  const seed = nameHash(favLast + dogLast + "battle");

  const favPat = favIsP1 ? input.p1Patterns : input.p2Patterns;
  const dogPat = favIsP1 ? input.p2Patterns : input.p1Patterns;
  const favSurf = getSurfaceSplit(favPat, input.surface);
  const dogSurf = getSurfaceSplit(dogPat, input.surface);

  // ── El dato de superficie (con interpretación, no solo números) ──
  if (favSurf && dogSurf) {
    const diff = pctDiff(favSurf.winRate, dogSurf.winRate);
    if (diff != null && diff >= 15) {
      const better = (favSurf.winRate ?? 0) >= (dogSurf.winRate ?? 0) ? favLast : dogLast;
      const betterPct = pct(Math.max(favSurf.winRate ?? 0, dogSurf.winRate ?? 0));
      const worsePct = pct(Math.min(favSurf.winRate ?? 0, dogSurf.winRate ?? 0));
      const worseN = better === favLast ? dogLast : favLast;
      parts.push(`Mirando los números en ${surf}, la diferencia salta a la vista: ${better} gana ${betterPct} de sus partidos en esta superficie (${better === favLast ? favSurf.matches : dogSurf.matches}p) frente al ${worsePct} de ${worseN}. Eso es una brecha de ${diff.toFixed(0)} puntos — si el terreno importa (y siempre importa), el duelo está marcado desde el inicio.`);
    } else if (diff != null && diff >= 7) {
      const better = (favSurf.winRate ?? 0) >= (dogSurf.winRate ?? 0) ? favLast : dogLast;
      parts.push(`Los registros en ${surf} dan ventaja moderada a ${better}: ${pct(favSurf.winRate)} vs ${pct(dogSurf.winRate)}, con ${favSurf.matches} y ${dogSurf.matches} partidos respectivamente — diferencia real pero no determinante.`);
    } else if (diff != null) {
      parts.push(`En ${surf} los números de ambos son muy parejos: ${favLast} con ${pct(favSurf.winRate)} (${favSurf.matches}p) y ${dogLast} con ${pct(dogSurf.winRate)} (${dogSurf.matches}p). La superficie no será el factor decisivo.`);
    }
  } else if (matchup.surfaceNote) {
    parts.push(cap(matchup.surfaceNote));
  }

  // ── Break points — interpretados como consecuencia ─────────
  const favBpSave = favPat?.bpSavePct;
  const dogBpSave = dogPat?.bpSavePct;
  const favBpConv = favPat?.bpConversionPct;
  const dogBpConv = dogPat?.bpConversionPct;

  if (favBpSave != null && dogBpSave != null) {
    const saveDiff = (favBpSave - dogBpSave) * 100;
    if (Math.abs(saveDiff) >= 8) {
      const stronger = saveDiff > 0 ? favLast : dogLast;
      const weaker   = saveDiff > 0 ? dogLast : favLast;
      const strongPct = pct(saveDiff > 0 ? favBpSave : dogBpSave);
      const weakPct   = pct(saveDiff > 0 ? dogBpSave : favBpSave);
      const consequence = Math.abs(saveDiff) >= 15
        ? `En la práctica, cada vez que ${weaker} enfrenta un break point, hay más de un ${(100 - parseFloat(weakPct)).toFixed(0)}% de que pierda el juego — una presión que se acumula.`
        : `La diferencia de ${Math.abs(saveDiff).toFixed(1)} puntos en break points salvados (${strongPct} de ${stronger} vs ${weakPct} de ${weaker}) puede parecer pequeña, pero en los momentos decisivos marca la diferencia.`;
      parts.push(consequence);
    }
  }

  if (favBpConv != null && dogBpConv != null && (favBpSave == null || dogBpSave == null || Math.abs((favBpSave - dogBpSave) * 100) < 8)) {
    const convDiff = (favBpConv - dogBpConv) * 100;
    if (Math.abs(convDiff) >= 7) {
      const better = convDiff > 0 ? favLast : dogLast;
      const worse  = convDiff > 0 ? dogLast : favLast;
      parts.push(`Como restador, ${better} convierte el ${pct(convDiff > 0 ? favBpConv : dogBpConv)} de sus oportunidades de break — ${pct(Math.abs(convDiff) / 100)} más que ${worse}. Eso se traduce en breaks reales cuando llega la oportunidad.`);
    }
  }

  // ── Saque — cuando hay diferencia real ────────────────────
  const fav1stWon  = favPat?.firstServeWonPct;
  const dog1stWon  = dogPat?.firstServeWonPct;
  const fav2ndWon  = favPat?.secondServeWonPct;
  const dog2ndWon  = dogPat?.secondServeWonPct;
  const favAces    = favPat?.avgAces;
  const dogAces    = dogPat?.avgAces;

  if (fav1stWon != null && dog1stWon != null) {
    const diff1st = (fav1stWon - dog1stWon) * 100;
    if (Math.abs(diff1st) >= 6) {
      const better = diff1st > 0 ? favLast : dogLast;
      const betterPct = pct(diff1st > 0 ? fav1stWon : dog1stWon);
      const worsePct  = pct(diff1st > 0 ? dog1stWon : fav1stWon);
      const acesNote = favAces != null && dogAces != null && Math.abs(favAces - dogAces) >= 1.5
        ? ` (${diff1st > 0 ? favLast : dogLast} también saca más aces: ${(diff1st > 0 ? favAces : dogAces).toFixed(1)} de media)`
        : "";
      parts.push(`En el saque, ${better} gana el ${betterPct} de los puntos con el primer servicio frente al ${worsePct} del rival${acesNote} — una ventaja que libera presión en sus juegos de saque.`);
    }
  }
  if (fav2ndWon != null && dog2ndWon != null && (fav1stWon == null || dog1stWon == null || Math.abs((fav1stWon - dog1stWon) * 100) < 6)) {
    const diff2nd = (fav2ndWon - dog2ndWon) * 100;
    if (Math.abs(diff2nd) >= 6) {
      const better = diff2nd > 0 ? favLast : dogLast;
      parts.push(`Con el segundo servicio, ${better} es más fiable (${pct(diff2nd > 0 ? fav2ndWon : dog2ndWon)} vs ${pct(diff2nd > 0 ? dog2ndWon : fav2ndWon)}) — clave cuando el primero falla.`);
    }
  }

  // ── Tiebreaks y 3er set — con escenario condicional ──────
  const favTb = favPat?.tbStats;
  const dogTb = dogPat?.tbStats;
  const favDs = favPat?.thirdSetStats;
  const dogDs = dogPat?.thirdSetStats;

  if (favTb && dogTb && favTb.played >= 8 && dogTb.played >= 8 && favTb.winRate != null && dogTb.winRate != null) {
    const tbDiff = (favTb.winRate - dogTb.winRate) * 100;
    if (Math.abs(tbDiff) >= 10) {
      const betterTb = tbDiff > 0 ? favLast : dogLast;
      const worseTb  = tbDiff > 0 ? dogLast : favLast;
      const betterPct = pct(tbDiff > 0 ? favTb.winRate : dogTb.winRate);
      const worsePct  = pct(tbDiff > 0 ? dogTb.winRate : favTb.winRate);
      // Añadir dato de 3er set si refuerza la misma dirección
      const ds3note = favDs && dogDs && favDs.played >= 5 && dogDs.played >= 5
        ? (() => {
            const ds3diff = ((tbDiff > 0 ? favDs.winRate ?? 0 : dogDs.winRate ?? 0) - (tbDiff > 0 ? dogDs.winRate ?? 0 : favDs.winRate ?? 0)) * 100;
            return ds3diff >= 10
              ? ` En sets decisivos también: ${betterTb} gana el ${pct(tbDiff > 0 ? favDs.winRate : dogDs.winRate)} de los partidos que llegan al tercer set.`
              : "";
          })()
        : "";
      parts.push(`Si el partido llega al tiebreak, la historia cambia: ${betterTb} gana ${betterPct} de sus desempates frente al ${worsePct} de ${worseTb}.${ds3note}`);
    }
  } else if (favDs && dogDs && favDs.played >= 6 && dogDs.played >= 6 && favDs.winRate != null && dogDs.winRate != null) {
    const dsDiff = (favDs.winRate - dogDs.winRate) * 100;
    if (Math.abs(dsDiff) >= 12) {
      const better = dsDiff > 0 ? favLast : dogLast;
      const betterPct = pct(dsDiff > 0 ? favDs.winRate : dogDs.winRate);
      const worsePct  = pct(dsDiff > 0 ? dogDs.winRate : favDs.winRate);
      parts.push(`En partidos que llegan al tercer set, ${better} tiene un historial significativamente mejor: ${betterPct} vs ${worsePct} — un dato clave si el partido se complica.`);
    }
  }

  // ── Indoor — solo si aplica ───────────────────────────────
  if (input.isIndoor) {
    const favIndoor = favPat?.indoorSplits?.indoor;
    const dogIndoor = dogPat?.indoorSplits?.indoor;
    if (favIndoor && dogIndoor && favIndoor.matches >= 5 && dogIndoor.matches >= 5) {
      const indDiff = ((favIndoor.winRate ?? 0) - (dogIndoor.winRate ?? 0)) * 100;
      if (Math.abs(indDiff) >= 10) {
        const better = indDiff > 0 ? favLast : dogLast;
        const betterPct = pct(indDiff > 0 ? favIndoor.winRate : dogIndoor.winRate);
        const worsePct  = pct(indDiff > 0 ? dogIndoor.winRate : favIndoor.winRate);
        parts.push(`Bajo techo, ${better} rinde notablemente mejor: ${betterPct} vs ${worsePct} — un dato específico para este contexto indoor.`);
      }
    }
  }

  // ── Agresividad — winners vs no forzados ─────────────────
  const favWin = favPat?.avgWinners;
  const dogWin = dogPat?.avgWinners;
  const favUE  = favPat?.avgUnforced;
  const dogUE  = dogPat?.avgUnforced;
  if (favWin != null && dogWin != null && favUE != null && dogUE != null) {
    const favRatio = favUE > 0 ? favWin / favUE : null;
    const dogRatio = dogUE > 0 ? dogWin / dogUE : null;
    if (favRatio != null && dogRatio != null && Math.abs(favRatio - dogRatio) >= 0.25) {
      const moreAgg = favRatio > dogRatio ? favLast : dogLast;
      const moreAggRatio = Math.max(favRatio, dogRatio);
      const lessAgg = favRatio > dogRatio ? dogLast : favLast;
      const lessAggRatio = Math.min(favRatio, dogRatio);
      parts.push(`Estilo ofensivo: ${moreAgg} genera ${moreAggRatio.toFixed(1)} winners por error no forzado frente al ${lessAggRatio.toFixed(1)} de ${lessAgg} — una diferencia que define quién dicta el ritmo.`);
    }
  }

  // ── Ronda específica (con contexto) ─────────────────────
  const MIN_ROUND_MATCHES = 6;
  if (input.round && !["Q", "Q1", "Q2", "RR"].includes(input.round.toUpperCase())) {
    const favRound = getRoundSplit(favPat, input.round);
    const dogRound = getRoundSplit(dogPat, input.round);
    const rnd = roundName(input.round);
    if (favRound && dogRound && favRound.matches >= MIN_ROUND_MATCHES && dogRound.matches >= MIN_ROUND_MATCHES) {
      const roundDiff = pctDiff(favRound.winRate, dogRound.winRate);
      if (roundDiff != null && roundDiff >= 12) {
        const better = (favRound.winRate ?? 0) >= (dogRound.winRate ?? 0) ? favLast : dogLast;
        const betterPct = pct(Math.max(favRound.winRate ?? 0, dogRound.winRate ?? 0));
        parts.push(`Un dato que añade contexto: en ${rnd ?? "esta ronda"}, ${better} tiene un historial notablemente mejor (${betterPct}) — no todos los jugadores rinden igual cuando el torneo avanza y la presión aumenta.`);
      }
    }
  }

  // ── Armas vs debilidades — el corazón táctico ─────────────
  if (matchup.weaponVsWeakness) {
    parts.push(matchup.weaponVsWeakness);
  } else {
    // Sin confrontación directa: describir el choque de estilos
    const styleDesc = pick([
      `${favLast} intentará imponer ${favProfile.weapon.toLowerCase()}, mientras ${dogLast} responderá con ${dogProfile.weapon.toLowerCase()}.`,
      `El duelo se plantea entre el ${favProfile.weapon.toLowerCase()} de ${favLast} y la respuesta de ${dogLast} basada en ${dogProfile.weapon.toLowerCase()}.`,
    ], seed);
    parts.push(styleDesc);
  }

  // ── CSI — solo si hay diferencia real ─────────────────────
  if (input.courtSpeed != null && input.courtProfile) {
    const csiKeyMap: Record<string, "fast"|"mediumFast"|"medium"|"slow"> = {
      "fast": "fast", "medium-fast": "mediumFast", "medium": "medium", "slow": "slow",
    };
    const csiKey = csiKeyMap[input.courtProfile];
    const p1Csi = csiKey ? favPat?.courtSpeedSplits?.[csiKey] : undefined;
    const p2Csi = csiKey ? dogPat?.courtSpeedSplits?.[csiKey] : undefined;
    if (p1Csi && p2Csi && p1Csi.matches >= 5 && p2Csi.matches >= 5) {
      const diff = ((p1Csi.winRate ?? 0) - (p2Csi.winRate ?? 0)) * 100;
      if (Math.abs(diff) >= 10) {
        const better = diff > 0 ? favLast : dogLast;
        parts.push(`El CSI de esta pista (${input.courtSpeed.toFixed(0)}/100) también suma a favor de ${better}, que tiene mejores números en superficies de esta velocidad.`);
      }
    }
  }

  // ── Turno del partido ─────────────────────────────────────
  if (input.timeOfDay && input.timeOfDay !== "day") {
    const split1 = favIsP1 ? input.p1TimeOfDaySplit : input.p2TimeOfDaySplit;
    const split2 = favIsP1 ? input.p2TimeOfDaySplit : input.p1TimeOfDaySplit;
    if (split1 && split2 && split1.matches >= 5 && split2.matches >= 5) {
      const diff = ((split1.winRate ?? 0) - (split2.winRate ?? 0)) * 100;
      const todLabel = input.timeOfDay === "night" ? "nocturno" : "vespertino";
      if (Math.abs(diff) >= 10) {
        const better = diff > 0 ? favLast : dogLast;
        const betterPct = pct(diff > 0 ? split1.winRate : split2.winRate);
        parts.push(`En turno ${todLabel}, ${better} tiene un mejor rendimiento histórico (${betterPct}) — un detalle menor pero real.`);
      }
    }
  }

  return parts.filter(Boolean).join(" ");
}

// ── Párrafo 3: Cómo se juega este partido ────────────────

function buildStoryParagraph(
  input: NarrativeInput,
  matchupType: MatchupType,
  favLast: string,
  dogLast: string,
  favIsP1: boolean,
  winPctFav: number,
  favProfile: TacticalProfile,
  dogProfile: TacticalProfile,
): string {
  const parts: string[] = [];
  const { matchup } = input;
  const surf = surfaceLabel(input.surface);
  const seed = nameHash(favLast + dogLast + "story");

  const favPat = favIsP1 ? input.p1Patterns : input.p2Patterns;
  const dogPat = favIsP1 ? input.p2Patterns : input.p1Patterns;
  const favAccum = favIsP1 ? input.p1AccumulatedInsights : input.p2AccumulatedInsights;
  const dogAccum = favIsP1 ? input.p2AccumulatedInsights : input.p1AccumulatedInsights;

  // ── Clima con consecuencias específicas ───────────────────
  if (!input.isIndoor && input.weather && weatherSignificant(input.weather)) {
    const w = input.weather;
    if (w.windSpeed > 20) {
      const favStyle = favProfile.style;
      const dogStyle = dogProfile.style;
      if (favStyle === "big-server" || favStyle === "aggressive-baseliner") {
        parts.push(`Con ${w.windSpeed.toFixed(0)} km/h de viento, el juego directo de ${favLast} se ve menos afectado que el de un jugador que depende del topspin para generar profundidad.`);
      } else if (dogStyle === "counter-puncher") {
        parts.push(`El viento de ${w.windSpeed.toFixed(0)} km/h puede ser un aliado inesperado para ${dogLast}: le quita ritmo al juego y favorece al que defiende sobre el que ataca.`);
      } else {
        parts.push(cap(matchup.weatherNote ?? `El viento de ${w.windSpeed.toFixed(0)} km/h es el factor X — los errores no forzados subirán para ambos.`));
      }
    } else if (w.temp > 30) {
      const fitDiff = (favProfile.fitness ?? 5) - (dogProfile.fitness ?? 5);
      if (fitDiff >= 2) {
        parts.push(`Los ${w.temp.toFixed(0)}°C van a exigir físicamente desde el primer game. ${favLast}, con mayor capacidad aeróbica (${favProfile.fitness}/10 vs ${dogProfile.fitness}/10), debería gestionar mejor el desgaste si el partido se alarga.`);
      } else if (fitDiff <= -2) {
        parts.push(`El calor extremo (${w.temp.toFixed(0)}°C) juega a favor de ${dogLast}: físicamente más preparado para aguantar en condiciones duras, lo que puede traducirse en ventaja en los momentos críticos del tercer set.`);
      } else {
        parts.push(`Con ${w.temp.toFixed(0)}°C, la gestión energética será fundamental. El que menos gaste en los dos primeros sets tendrá más argumentos si el partido se decide al final.`);
      }
    } else if (w.humidity > 75) {
      parts.push(`La humedad del ${w.humidity}% ralentiza la pelota — favorece al que prefiere intercambios largos y tiene margen para el error.`);
    } else if (w.temp < 14) {
      parts.push(`El frío (${w.temp.toFixed(0)}°C) cambia la dinámica: la pelota bota menos y más rápido, penalizando el topspin pesado y favoreciendo a quien golpea flat.`);
    }
  }

  // ── Historial en el torneo específico ─────────────────────
  const favTh = favIsP1 ? input.p1TourneyHistory : input.p2TourneyHistory;
  const dogTh = favIsP1 ? input.p2TourneyHistory : input.p1TourneyHistory;
  if (favTh && dogTh && (favTh.matches >= 3 || dogTh.matches >= 3)) {
    const diff = ((favTh.winRate ?? 0) - (dogTh.winRate ?? 0)) * 100;
    if (Math.abs(diff) >= 12) {
      const better = diff > 0 ? favLast : dogLast;
      const betterPct = pct(diff > 0 ? favTh.winRate : dogTh.winRate);
      const betterM = diff > 0 ? favTh.matches : dogTh.matches;
      const worse = diff > 0 ? dogLast : favLast;
      const worsePct = pct(diff > 0 ? dogTh.winRate : favTh.winRate);
      parts.push(`En ${input.tournament} hay un historial que no miente: ${better} gana el ${betterPct} en ${betterM} apariciones previas; ${worse} solo el ${worsePct}. Conocer bien una pista — los rebotes, la velocidad, el ambiente — tiene valor real.`);
    }
  } else if (favTh && favTh.matches >= 4 && (favTh.winRate ?? 0) >= 0.72) {
    parts.push(`${favLast} conoce bien ${input.tournament}: ${pct(favTh.winRate)} en ${favTh.matches} partidos previos aquí. Cuando el torneo le sienta bien, eso suma.`);
  } else if (dogTh && dogTh.matches >= 4 && (dogTh.winRate ?? 0) >= 0.70) {
    parts.push(`Dato a favor de ${dogLast}: ${pct(dogTh.winRate)} en ${dogTh.matches} partidos en ${input.tournament}. Un torneo que claramente le viene bien.`);
  }

  // ── Observaciones reales de partidos recientes ─────────────
  if (favAccum && favAccum.tacticalObservations.length > 0) {
    const obs = favAccum.tacticalObservations[0];
    if (obs && obs.length > 20) {
      parts.push(`Lo que revelan los últimos partidos de ${favLast}: ${obs.charAt(0).toLowerCase() + obs.slice(1)}.`);
    }
  }
  if (dogAccum && dogAccum.weaknessesConfirmed.length > 0) {
    const w = dogAccum.weaknessesConfirmed[0];
    if (w && w.length > 15) {
      parts.push(`Un punto débil reciente de ${dogLast} que ${favLast} puede explotar: ${w.charAt(0).toLowerCase() + w.slice(1)}.`);
    }
  }

  // ── Rendimiento ante rivales de nivel similar ────────────
  const favOppRank = favPat?.opponentRankSplits;
  const dogOppRank = dogPat?.opponentRankSplits;
  const p1Rank = input.p1Rank;
  const p2Rank = input.p2Rank;

  // Si ambos son top-50, comparar su rendimiento ante top-50
  if (p1Rank != null && p2Rank != null && p1Rank <= 50 && p2Rank <= 50) {
    const favTop50 = favOppRank?.top50;
    const dogTop50 = dogOppRank?.top50;
    if (favTop50 && dogTop50 && favTop50.matches >= 8 && dogTop50.matches >= 8) {
      const rankDiff = ((favTop50.winRate ?? 0) - (dogTop50.winRate ?? 0)) * 100;
      if (Math.abs(rankDiff) >= 10) {
        const better = rankDiff > 0 ? favLast : dogLast;
        const betterPct = pct(rankDiff > 0 ? favTop50.winRate : dogTop50.winRate);
        const worsePct  = pct(rankDiff > 0 ? dogTop50.winRate : favTop50.winRate);
        parts.push(`Ante rivales del top 50, ${better} tiene mejor registro (${betterPct} vs ${worsePct}) — un dato que cobra relevancia precisamente en este tipo de partidos.`);
      }
    }
  } else if (p1Rank != null && p2Rank != null && Math.min(p1Rank, p2Rank) <= 10) {
    // Al menos uno es top-10 — mirar rendimiento ante top-10
    const favTop10 = favOppRank?.top10;
    const dogTop10 = dogOppRank?.top10;
    if (favTop10 && dogTop10 && favTop10.matches >= 5 && dogTop10.matches >= 5) {
      const rankDiff = ((favTop10.winRate ?? 0) - (dogTop10.winRate ?? 0)) * 100;
      if (Math.abs(rankDiff) >= 12) {
        const better = rankDiff > 0 ? favLast : dogLast;
        const betterPct = pct(rankDiff > 0 ? favTop10.winRate : dogTop10.winRate);
        parts.push(`Ante el top 10, ${better} mantiene un ${betterPct} de victorias — evidencia de que sube el nivel cuando el rival es de élite.`);
      }
    }
  }

  // ── Nota mental / física del matchup ─────────────────────
  if (matchup.mentalNote) parts.push(cap(matchup.mentalNote));
  if (matchup.physicalNote) parts.push(cap(matchup.physicalNote));

  // ── Cómo puede ganar el underdog ─────────────────────────
  if (winPctFav < 78) {
    if (matchup.weakness2vs1) {
      parts.push(`Para ${dogLast}, el camino más claro pasa por ${matchup.weakness2vs1}.`);
    } else if (dogAccum && dogAccum.weaponsConfirmed.length > 0) {
      const weapon = dogAccum.weaponsConfirmed[0];
      parts.push(`Si ${dogLast} consigue que ${weapon.charAt(0).toLowerCase() + weapon.slice(1)}, su opción de victoria es real.`);
    }
  }

  // ── Insight clave ─────────────────────────────────────────
  if (matchup.keyInsight) parts.push(cap(matchup.keyInsight));

  // Fallback según tipo de matchup
  if (parts.length === 0) {
    if (matchupType === "equilibrado" || winPctFav <= 60) {
      parts.push(`En un duelo tan igualado, el partido lo decidirán los momentos de mayor tensión — los break points al 40-40 y los puntos clave de cada set.`);
    } else if (matchupType === "dominio-claro") {
      parts.push(`La ventaja estructural de ${favLast} tiende a crecer cuanto más largo sea el partido — la regularidad en los tramos finales es su firma.`);
    } else {
      parts.push(`Quien gestione mejor la presión en los momentos clave tendrá la ventaja — en esta clase de enfrentamientos los detalles marcan la diferencia.`);
    }
  }

  return parts.join(" ");
}

// ── Párrafo 4: El veredicto ──────────────────────────────

function buildVerdictParagraph(
  input: NarrativeInput,
  matchupType: MatchupType,
  favLast: string,
  dogLast: string,
  favIsP1: boolean,
  winPctFav: number,
  winPctDog: number,
  favProfile: TacticalProfile,
  dogProfile: TacticalProfile,
): string {
  const seed = nameHash(favLast + dogLast + "verdict");
  const favPat = favIsP1 ? input.p1Patterns : input.p2Patterns;
  const dogPat = favIsP1 ? input.p2Patterns : input.p1Patterns;
  const favStreak = favIsP1 ? input.p1Streak : input.p2Streak;
  const dogStreak = favIsP1 ? input.p2Streak : input.p1Streak;
  const favRest = favIsP1 ? input.daysRest1 : input.daysRest2;
  const dogRest = favIsP1 ? input.daysRest2 : input.daysRest1;

  // Adjetivo para el favorito
  const dominanceAdj = winPctFav >= 80 ? "gran favorito"
    : winPctFav >= 72 ? "favorito claro"
    : winPctFav >= 63 ? "ligero favorito"
    : "mínimo favorito";

  // Factores que suman o restan
  const conditionsFor: string[] = [];
  const conditionsAgainst: string[] = [];

  if (favRest != null && dogRest != null) {
    if (favRest >= 2 && dogRest === 0) conditionsFor.push(`más descansado (${favRest}d vs partido hoy de ${dogLast})`);
    else if (favRest === 0 && dogRest >= 2) conditionsAgainst.push(`jugó hoy, con menos recuperación`);
  }
  if ((favStreak ?? 0) >= 5) conditionsFor.push(`racha de ${favStreak} victorias`);
  if ((dogStreak ?? 0) >= 5) conditionsAgainst.push(`${dogLast} también llega en racha (${dogStreak})`);

  const favSurf = getSurfaceSplit(favPat, input.surface);
  const dogSurf = getSurfaceSplit(dogPat, input.surface);
  if (favSurf && dogSurf) {
    const diff = ((favSurf.winRate ?? 0) - (dogSurf.winRate ?? 0)) * 100;
    if (diff >= 12) conditionsFor.push(`mejor rendimiento histórico en ${surfaceLabel(input.surface)} (${pct(favSurf.winRate)} vs ${pct(dogSurf.winRate)})`);
    else if (diff <= -12) conditionsAgainst.push(`${dogLast} más cómodo en ${surfaceLabel(input.surface)} (${pct(dogSurf.winRate)} vs ${pct(favSurf.winRate)})`);
  }

  // Construir el bloque de veredicto
  const verdictIntros = [
    `${favLast} se presenta como ${dominanceAdj} con el ${winPctFav}% de probabilidades.`,
    `El modelo sitúa a ${favLast} como ${dominanceAdj}: ${winPctFav}% frente al ${winPctDog}% de ${dogLast}.`,
    `${winPctFav}% para ${favLast}, ${winPctDog}% para ${dogLast} — lo que lo convierte en ${dominanceAdj}.`,
  ];
  let verdict = pick(verdictIntros, seed);

  if (conditionsFor.length > 0) {
    verdict += ` Hoy también cuenta a su favor: ${conditionsFor.join(", ")}.`;
  }
  if (conditionsAgainst.length > 0) {
    verdict += ` No todo es positivo para él: ${conditionsAgainst.join("; ")}.`;
  }

  // Nota de nivel si hay dato sólido
  const favLevel = getLevelSplit(favPat, input.tourneyLevel);
  if (favLevel && favLevel.matches >= 8 && (favLevel.winRate ?? 0) >= 0.78) {
    verdict += ` En ${levelName(input.tourneyLevel)}, ${favLast} gana el ${pct(favLevel.winRate)} de sus partidos — un referente que respalda la predicción.`;
  }

  // Escenario de sorpresa — específico por tipo de matchup
  let upset: string;
  if (winPctDog >= 40) {
    upset = matchupType === "sorpresa"
      ? `${dogLast} tiene argumentos reales: si su ${dogProfile.weapon.split(" — ")[0].toLowerCase()} funciona desde el primer game, puede sostener el nivel durante todo el partido.`
      : `${dogLast} tiene margen de sorpresa — ${winPctDog}% no es poca cosa. Si impone su juego y limita los errores, el resultado puede ser cualquiera.`;
  } else if (winPctDog >= 28) {
    upset = `Para ${dogLast}, ganar requiere que ${favLast} tenga un día por debajo de su nivel o que el partido tome un giro inusual — posible, aunque no lo más probable.`;
  } else {
    upset = `${dogLast} necesitaría un colapso inusual del favorito — estadísticamente improbable dado el margen.`;
  }

  // Factor de riesgo si lo hay
  const riskNote = input.matchup.riskFactor
    ? ` Factor de incertidumbre a vigilar: ${input.matchup.riskFactor.charAt(0).toLowerCase() + input.matchup.riskFactor.slice(1)}.`
    : "";

  return `${verdict} ${upset}${riskNote}`;
}

// ── Generador principal ───────────────────────────────────

export function generateNarrative(input: NarrativeInput): TacticalAnalysis {
  const { matchup, winPct1, winPct2 } = input;
  const favIsP1 = winPct1 >= winPct2;
  const favoredName = favIsP1 ? input.p1Name : input.p2Name;
  const underdogName = favIsP1 ? input.p2Name : input.p1Name;
  const favoredProfile = favIsP1 ? matchup.p1Profile : matchup.p2Profile;
  const underdogProfile = favIsP1 ? matchup.p2Profile : matchup.p1Profile;
  const winPctFav = Math.max(winPct1, winPct2);
  const winPctDog = Math.min(winPct1, winPct2);

  const favLast = shortName(favoredName);
  const dogLast = shortName(underdogName);

  const matchupType = detectMatchupType(winPctFav, favoredProfile, underdogProfile, matchup, input, favIsP1);

  const para1 = buildOpeningParagraph(input, matchupType, favLast, dogLast, favIsP1, winPctFav, winPctDog, favoredProfile, underdogProfile);
  const para2 = buildBattlegroundParagraph(input, matchupType, favLast, dogLast, favIsP1, winPctFav, favoredProfile, underdogProfile);
  const para3 = buildStoryParagraph(input, matchupType, favLast, dogLast, favIsP1, winPctFav, favoredProfile, underdogProfile);
  const para4 = buildVerdictParagraph(input, matchupType, favLast, dogLast, favIsP1, winPctFav, winPctDog, favoredProfile, underdogProfile);

  const narrative = [para1, para2, para3, para4].filter(Boolean).join("\n\n");

  const matchupSummary = buildMatchupSummary(matchup, favoredProfile, underdogProfile, favLast, dogLast);
  const keyWeapon = favoredProfile.weapon ?? null;
  const confidence: "alta" | "moderada" | "baja" =
    winPctFav >= 72 ? "alta" : winPctFav >= 60 ? "moderada" : "baja";

  return { narrative, matchupSummary, keyWeapon, riskFactor: matchup.riskFactor, confidence };
}

function buildMatchupSummary(
  matchup: MatchupIntelligence,
  favoredProfile: TacticalProfile,
  underdogProfile: TacticalProfile,
  favLast: string,
  dogLast: string,
): string {
  if (matchup.weaponVsWeakness) {
    const core = matchup.weaponVsWeakness.split(" — ")[0];
    return `Ventaja táctica de ${favLast}: ${core.replace(/^el /, "").replace(/^la /, "")}.`;
  }
  if (matchup.surfaceEdge !== "neutral") {
    const fav = matchup.surfaceEdge === "p1" ? favLast : dogLast;
    return `Ventaja de ${fav} por mejor adaptación a la superficie.`;
  }
  if (matchup.mentalEdge !== "neutral") {
    const fav = matchup.mentalEdge === "p1" ? favLast : dogLast;
    return `Partido igualado tácticamente — ventaja mental de ${fav} en puntos decisivos.`;
  }
  return `Partido muy igualado — la ejecución del día decidirá.`;
}
