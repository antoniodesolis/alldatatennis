/**
 * Metadatos estáticos de torneos ATP:
 *   - Nivel: "grand-slam" | "masters-1000" | "atp-500" | "atp-250" | "atp-finals" | "other"
 *   - Indoor: true/false
 *
 * Sackmann tourney_level: G=Grand Slam, M=Masters 1000, A=250/500, F=Finals, D=Davis, C=Challenger
 * Diferenciamos 500 vs 250 por nombre de torneo.
 */

export type TourneyLevel = "grand-slam" | "masters-1000" | "atp-500" | "atp-250" | "atp-finals" | "other";

// Torneos ATP 500 (por fragmento de nombre, case-insensitive)
const ATP_500_NAMES = [
  "rotterdam", "abn amro",
  "acapulco", "telcel",
  "dubai", "dubai duty free",
  "barcelona", "barcelona open",
  "hamburg", "german open",
  "halle", "terra wortmann",
  "queen's", "queens club",
  "washington", "citi open",
  "beijing", "china open",
  "tokyo", "toray pan pacific", "rakuten japan",
  "vienna", "erste bank",
  "basel", "swiss indoors",
];

// Torneos indoor (por fragmento de nombre, case-insensitive)
const INDOOR_NAMES = [
  "rotterdam", "abn amro",
  "marseille", "open 13", "open sud de france",
  "dallas", "american express",
  "montpellier",
  "sofia", "open sofia",
  "metz", "moselle open",
  "vienna", "erste bank",
  "basel", "swiss indoors",
  "paris", "rolex paris", "bnp paribas masters",
  "dubai", "dubai duty free",
  "doha", "qatar exxon",
  "atp finals", "nitto atp finals", "barclays atp", "tour finals",
  "next gen atp", "milan", // Next Gen Finals
];

function matchesAny(name: string, list: string[]): boolean {
  const lower = name.toLowerCase();
  return list.some((kw) => lower.includes(kw));
}

/**
 * Determina el nivel del torneo.
 * level: Sackmann tourney_level char (G/M/A/F/D/C)
 * name: tourney_name string
 */
export function getTourneyLevel(level: string, name: string): TourneyLevel {
  switch (level.toUpperCase()) {
    case "G": return "grand-slam";
    case "M": return "masters-1000";
    case "F": return "atp-finals";
    case "D": return "other"; // Davis Cup
    case "C": return "other"; // Challenger
    case "A":
      return matchesAny(name, ATP_500_NAMES) ? "atp-500" : "atp-250";
    default:  return "other";
  }
}

/**
 * Determina si el torneo es indoor.
 */
export function isIndoor(name: string, surface: string): boolean {
  // "Indoor Hard" en el surface
  if (surface.toLowerCase().includes("indoor")) return true;
  if (surface.toLowerCase().includes("carpet")) return true;
  return matchesAny(name, INDOOR_NAMES);
}
