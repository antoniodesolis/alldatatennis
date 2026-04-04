/**
 * lib/analytics/narrative.ts
 *
 * Generador de análisis narrativo experto — suena a analista ATP de élite,
 * no a una plantilla. Usa datos reales de perfiles, matchup y condiciones.
 *
 * Estructura de 3-4 párrafos:
 *   1. Contexto del partido (torneo, importancia, momento de forma)
 *   2. Análisis táctico del matchup
 *   3. Factor clave (lo que va a decidir el partido)
 *   4. Predicción con razonamiento final
 */

import type { MatchupIntelligence } from "./matchup-intelligence";
import type { TacticalProfile } from "./player-profiles";
import type { PlayerPatterns } from "./patterns";

export interface NarrativeInput {
  p1Name: string;
  p2Name: string;
  p1Slug: string;
  p2Slug: string;
  tournament: string;
  tourneyLevel: string;
  surface: string;
  winPct1: number;
  winPct2: number;
  recentForm1?: { winRate: number | null; matches: number };
  recentForm2?: { winRate: number | null; matches: number };
  h2h?: { p1Wins: number; p2Wins: number; total: number };
  p1Patterns: PlayerPatterns | null;
  p2Patterns: PlayerPatterns | null;
  matchup: MatchupIntelligence;
  mainFactor?: string; // el factor con más peso del motor
}

export interface TacticalAnalysis {
  narrative: string;        // análisis completo en 3-4 párrafos
  matchupSummary: string;   // una línea: "Ventaja táctica de Alcaraz por su topspin vs revés de Lehecka"
  keyWeapon: string | null; // arma diferencial del favorito
  riskFactor: string | null;
  confidence: "alta" | "moderada" | "baja";
}

// ── Generador principal ───────────────────────────────────

export function generateNarrative(input: NarrativeInput): TacticalAnalysis {
  const { matchup, winPct1, winPct2 } = input;
  const favored = winPct1 >= winPct2 ? "p1" : "p2";
  const favoredName = favored === "p1" ? input.p1Name : input.p2Name;
  const underdogName = favored === "p1" ? input.p2Name : input.p1Name;
  const favoredProfile = favored === "p1" ? matchup.p1Profile : matchup.p2Profile;
  const underdogProfile = favored === "p1" ? matchup.p2Profile : matchup.p1Profile;
  const winPctFav = Math.max(winPct1, winPct2);
  const winPctDog = Math.min(winPct1, winPct2);

  const p1Last = shortName(input.p1Name);
  const p2Last = shortName(input.p2Name);
  const favLast = favored === "p1" ? p1Last : p2Last;
  const dogLast = favored === "p1" ? p2Last : p1Last;

  const surf = input.surface.includes("clay") ? "arcilla"
    : input.surface.includes("grass") ? "hierba"
    : input.surface.includes("indoor") ? "pista dura indoor"
    : "pista dura";

  // ── Párrafo 1: Contexto ─────────────────────────────────
  const para1 = buildContextParagraph(input, favLast, dogLast, winPctFav, surf);

  // ── Párrafo 2: Análisis táctico ─────────────────────────
  const para2 = buildTacticalParagraph(matchup, favoredProfile, underdogProfile, favLast, dogLast, surf, input);

  // ── Párrafo 3: Factor clave ─────────────────────────────
  const para3 = buildKeyFactorParagraph(matchup, favoredProfile, underdogProfile, favLast, dogLast, winPctFav, surf, input);

  // ── Párrafo 4: Predicción ───────────────────────────────
  const para4 = buildConclusionParagraph(input, favLast, dogLast, winPctFav, winPctDog, favoredProfile, underdogProfile, surf);

  const narrative = [para1, para2, para3, para4].filter(Boolean).join("\n\n");

  // ── Metadatos ───────────────────────────────────────────
  const matchupSummary = buildMatchupSummary(matchup, favoredProfile, underdogProfile, favLast, dogLast, surf);
  const keyWeapon = buildKeyWeapon(matchup, favored);
  const confidence: "alta" | "moderada" | "baja" =
    winPctFav >= 72 ? "alta" : winPctFav >= 60 ? "moderada" : "baja";

  return {
    narrative,
    matchupSummary,
    keyWeapon,
    riskFactor: matchup.riskFactor,
    confidence,
  };
}

// ── Constructores de párrafos ─────────────────────────────

function buildContextParagraph(
  input: NarrativeInput,
  favLast: string,
  dogLast: string,
  winPctFav: number,
  surf: string,
): string {
  const levelLabel = levelName(input.tourneyLevel);
  const importanceAdj = levelAdj(input.tourneyLevel);

  // Forma reciente
  const formNote1 = input.recentForm1?.winRate != null
    ? formDescription(input.recentForm1.winRate, input.p1Name.split(" ").pop()!)
    : null;
  const formNote2 = input.recentForm2?.winRate != null
    ? formDescription(input.recentForm2.winRate, input.p2Name.split(" ").pop()!)
    : null;

  const contextParts: string[] = [];

  // Apertura con el torneo
  const opener = pick([
    `Este ${levelLabel} de ${input.tournament} presenta un encuentro de alta calidad táctica`,
    `${input.tournament} acoge un partido de ${importanceAdj} con dos perfiles muy diferentes`,
    `La pista de ${surf} de ${input.tournament} será el escenario de un duelo`,
  ]);

  // Descripción del favorito
  const favDesc = winPctFav >= 70
    ? `donde ${favLast} llega como claro favorito`
    : winPctFav >= 60
    ? `donde ${favLast} parte con ventaja moderada`
    : `que se presenta muy igualado entre ${favLast} y ${dogLast}`;

  contextParts.push(`${opener} ${favDesc}.`);

  // Forma reciente
  if (formNote1) contextParts.push(formNote1);
  if (formNote2 && formNote2 !== formNote1) contextParts.push(formNote2);

  // H2H si existe
  if (input.h2h && input.h2h.total >= 2) {
    const h2hWins = input.p1Name === favLast || favLast === shortName(input.p1Name)
      ? input.h2h.p1Wins : input.h2h.p2Wins;
    const h2hLoss = input.h2h.total - h2hWins;
    if (h2hWins !== h2hLoss) {
      contextParts.push(
        `En el historial directo, ${h2hWins > h2hLoss ? favLast : dogLast} lleva ventaja (${Math.max(h2hWins, h2hLoss)}-${Math.min(h2hWins, h2hLoss)}) — un dato relevante en partidos con historial establecido.`
      );
    } else {
      contextParts.push(`El H2H está perfectamente igualado (${h2hWins}-${h2hLoss}), lo que añade incertidumbre adicional.`);
    }
  }

  return contextParts.join(" ");
}

function buildTacticalParagraph(
  matchup: MatchupIntelligence,
  favoredProfile: TacticalProfile,
  underdogProfile: TacticalProfile,
  favLast: string,
  dogLast: string,
  surf: string,
  input: NarrativeInput,
): string {
  const parts: string[] = [];

  // Arma del favorito
  parts.push(
    `Tácticamente, ${favLast} basa su juego en ${favoredProfile.weapon} — ${favoredProfile.tacticalNote.split(".")[0].toLowerCase()}.`
  );

  // Weapon vs weakness si existe
  if (matchup.weaponVsWeakness) {
    parts.push(`El matchup tiene una dimensión táctica clara: ${matchup.weaponVsWeakness}.`);
  }

  // Nota de superficie
  parts.push(matchup.surfaceNote);

  // Nota del underdog
  if (underdogProfile.tacticalNote) {
    const dogNote = underdogProfile.tacticalNote.split(".")[0].toLowerCase();
    parts.push(`Por su parte, ${dogLast} ${dogNote}.`);
  }

  return parts.join(" ");
}

function buildKeyFactorParagraph(
  matchup: MatchupIntelligence,
  favoredProfile: TacticalProfile,
  underdogProfile: TacticalProfile,
  favLast: string,
  dogLast: string,
  winPctFav: number,
  surf: string,
  input: NarrativeInput,
): string {
  const parts: string[] = [];

  // Factor mental si es diferencial
  if (matchup.mentalNote) {
    parts.push(matchup.mentalNote);
  }

  // Clima si hay nota
  if (matchup.weatherNote) {
    parts.push(`Las condiciones ambientales añaden una variable: ${matchup.weatherNote.toLowerCase()}`);
  }

  // Físico si hay nota
  if (matchup.physicalNote) {
    parts.push(matchup.physicalNote);
  }

  // Contexto del torneo
  if (matchup.tourneyContextNote) {
    parts.push(matchup.tourneyContextNote);
  }

  // Si no hay factores adicionales claros, hacer una reflexión sobre el matchup
  if (parts.length === 0) {
    if (winPctFav >= 70) {
      parts.push(
        `El factor decisivo será si ${dogLast} puede mantener su nivel durante todo el partido — la ventaja estructural de ${favLast} tiende a crecer en los tramos finales.`
      );
    } else {
      parts.push(
        `En un partido tan igualado, los break points y los momentos de mayor tensión definirán quién se impone — ${favLast} y ${dogLast} llegan con recursos similares para afrontar esas situaciones.`
      );
    }
  }

  // Key insight del matchup
  if (matchup.keyInsight) {
    parts.push(matchup.keyInsight);
  }

  return parts.join(" ");
}

function buildConclusionParagraph(
  input: NarrativeInput,
  favLast: string,
  dogLast: string,
  winPctFav: number,
  winPctDog: number,
  favoredProfile: TacticalProfile,
  underdogProfile: TacticalProfile,
  surf: string,
): string {
  const dominanceAdj = winPctFav >= 78 ? "gran favorito"
    : winPctFav >= 70 ? "claro favorito"
    : winPctFav >= 62 ? "ligero favorito"
    : "igualado con ligera ventaja";

  const favoredIs = `${favLast} se presenta como ${dominanceAdj} (${winPctFav}%)`;

  // Cómo puede ganar el underdog
  const upset: string = winPctDog >= 35
    ? `aunque ${dogLast} tiene margen real de sorpresa si ${underdogProfile.weapon.split(" — ")[0]} funciona al máximo nivel.`
    : winPctDog >= 25
    ? `${dogLast} necesitaría un día excepcional y que ${favLast} esté por debajo de su media para materializar la sorpresa.`
    : `la sorpresa requeriría un colapso inusual de ${favLast}, algo que su perfil mental hace poco probable.`;

  // Factor de riesgo
  const riskNote = input.matchup.riskFactor
    ? ` El elemento de incertidumbre: ${input.matchup.riskFactor.toLowerCase()}`
    : "";

  return `${favoredIs}, ${upset}${riskNote}`;
}

// ── Helpers de texto ──────────────────────────────────────

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  // Si el último token es inicial (A.), usar el primero
  const last = parts[parts.length - 1];
  if (/^[A-Z]\.?$/.test(last)) return parts[0];
  return last;
}

function levelName(level: string): string {
  return {
    "grand-slam": "Grand Slam",
    "masters-1000": "Masters 1000",
    "atp-500": "ATP 500",
    "atp-250": "ATP 250",
    "atp-finals": "ATP Finals",
  }[level] ?? "torneo ATP";
}

function levelAdj(level: string): string {
  return {
    "grand-slam": "máximo nivel",
    "masters-1000": "alto nivel",
    "atp-500": "buen nivel",
    "atp-250": "nivel medio-alto",
    "atp-finals": "élite",
  }[level] ?? "nivel ATP";
}

function formDescription(winRate: number, playerLastName: string): string {
  if (winRate >= 0.80) return `${playerLastName} llega en un estado de forma excepcional en las últimas semanas.`;
  if (winRate >= 0.65) return `${playerLastName} tiene buenas sensaciones recientes.`;
  if (winRate >= 0.50) return `${playerLastName} viene de una racha regular, ni especialmente buena ni mala.`;
  if (winRate >= 0.35) return `${playerLastName} llega a este partido en un momento de forma irregular, con más derrotas que victorias recientes.`;
  return `${playerLastName} llega en un bache de resultados — la confianza puede ser un factor.`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildMatchupSummary(
  matchup: MatchupIntelligence,
  favoredProfile: TacticalProfile,
  underdogProfile: TacticalProfile,
  favLast: string,
  dogLast: string,
  surf: string,
): string {
  if (matchup.weaponVsWeakness) {
    const core = matchup.weaponVsWeakness.split(" — ")[0];
    return `Ventaja táctica de ${favLast}: ${core.replace(/^el /, "").replace(/^la /, "")}.`;
  }
  if (matchup.surfaceEdge !== "neutral") {
    const fav = matchup.surfaceEdge === "p1" ? favLast : dogLast;
    return `Ventaja de ${fav} por mejor adaptación a ${surf}.`;
  }
  if (matchup.mentalEdge !== "neutral") {
    const fav = matchup.mentalEdge === "p1" ? favLast : dogLast;
    return `Partido igualado tácticamente — ventaja mental de ${fav} en los puntos decisivos.`;
  }
  return `Partido muy igualado — ningún factor diferencial claro, la ejecución del día decidirá.`;
}

function buildKeyWeapon(matchup: MatchupIntelligence, favored: "p1" | "p2"): string | null {
  const favProfile = favored === "p1" ? matchup.p1Profile : matchup.p2Profile;
  return favProfile.weapon ?? null;
}
