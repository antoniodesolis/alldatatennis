/**
 * Clasificación estática del estilo de juego de los jugadores ATP.
 *
 * Estilos:
 *   "big-server"           — Saque dominante, puntos directos, activo en red
 *                            (Bublik, Opelka, Shelton, Berrettini, Karlovic)
 *   "aggressive-baseliner" — Golpes agresivos desde el fondo, busca el winner
 *                            (Zverev, Tsitsipas, FAA, Fritz, Shapovalov, Rublev)
 *   "all-court"            — Versátil, dominante en todas las superficies
 *                            (Alcaraz, Sinner, Djokovic, Medvedev)
 *   "counter-puncher"      — Defensivo/retriever, ritmo lento, resiste largos rallies
 *                            (Baez, Tabilo, Cerundolo, Etcheverry, Ruud en tierra)
 *   "baseliner"            — Jugador de fondo estándar, sin rasgo dominante claro
 *                            (la mayoría del tour)
 *
 * La clave es el te_slug canónico.
 */

export type PlayerStyle =
  | "big-server"
  | "aggressive-baseliner"
  | "all-court"
  | "counter-puncher"
  | "baseliner";

export const PLAYER_STYLES: Record<string, PlayerStyle> = {
  // ── All-court (top tier, dominan todo) ───────────────────
  alcaraz:    "all-court",
  sinner:     "all-court",
  djokovic:   "all-court",
  medvedev:   "all-court",
  hurkacz:    "all-court",
  norrie:     "all-court",
  draper:     "all-court",
  machac:     "all-court",
  mensik:     "all-court",
  fonseca:    "all-court",

  // ── Big servers ──────────────────────────────────────────
  bublik:     "big-server",
  opelka:     "big-server",
  shelton:    "big-server",
  berrettini: "big-server",
  isner:      "big-server",
  raonic:     "big-server",
  karlovic:   "big-server",
  griekspoor: "big-server",
  "mpetshi-perricard": "big-server",
  struff:     "big-server",
  nakashima:  "big-server",
  paul:       "big-server",

  // ── Aggressive baseliners ─────────────────────────────────
  zverev:     "aggressive-baseliner",
  tsitsipas:  "aggressive-baseliner",
  "auger-aliassime": "aggressive-baseliner",
  fritz:      "aggressive-baseliner",
  shapovalov: "aggressive-baseliner",
  rublev:     "aggressive-baseliner",
  khachanov:  "aggressive-baseliner",
  tiafoe:     "aggressive-baseliner",
  dimitrov:   "aggressive-baseliner",
  cilic:      "aggressive-baseliner",
  wawrinka:   "aggressive-baseliner",
  kyrgios:    "aggressive-baseliner",
  monfils:    "aggressive-baseliner",
  "de-minaur": "aggressive-baseliner",
  michelsen:  "aggressive-baseliner",
  fils:       "aggressive-baseliner",
  brooksby:   "aggressive-baseliner",
  musetti:    "aggressive-baseliner",
  cobolli:    "aggressive-baseliner",
  arnaldi:    "aggressive-baseliner",
  lehecka:    "aggressive-baseliner",
  rune:       "aggressive-baseliner",
  korda:      "aggressive-baseliner",
  darderi:    "aggressive-baseliner",
  marozsan:   "aggressive-baseliner",
  navone:     "aggressive-baseliner",

  // ── Counter-punchers / defensivos ────────────────────────
  baez:       "counter-puncher",
  tabilo:     "counter-puncher",
  cerundolo:  "counter-puncher",
  etcheverry: "counter-puncher",
  ruud:       "counter-puncher",
  garin:      "counter-puncher",
  "diaz-acosta": "counter-puncher",
  cecchinato: "counter-puncher",
  coric:      "counter-puncher",
  lajovic:    "counter-puncher",
  djere:      "counter-puncher",
  fucsovics:  "counter-puncher",
  kecmanovic: "counter-puncher",
  "bautista-agut": "counter-puncher",
  "carballes-baena": "counter-puncher",
  "carreno-busta": "counter-puncher",
  goffin:     "counter-puncher",
  mannarino:  "counter-puncher",
  ofner:      "counter-puncher",
  sonego:     "counter-puncher",
  gasquet:    "counter-puncher",
  moutet:     "counter-puncher",

  // ── Baseliners estándar (default implícito para el resto) ─
  // Se puede ampliar según se vayan catalogando más jugadores
  prizmic:    "baseliner",
  droguet:    "baseliner",
  merida:     "baseliner",
  buse:       "baseliner",
  "ugo-carabelli": "baseliner",
  carabelli:  "baseliner",
  jarry:      "baseliner",
  borges:     "baseliner",
  nardi:      "baseliner",
  giron:      "baseliner",
  halys:      "baseliner",
  bonzi:      "baseliner",
  altmaier:   "baseliner",
  munar:      "baseliner",
};

/**
 * Devuelve el estilo del jugador dado su te_slug.
 * Si no está catalogado, devuelve "baseliner" como fallback.
 */
export function getPlayerStyle(teSlug: string): PlayerStyle {
  return PLAYER_STYLES[teSlug] ?? "baseliner";
}

/**
 * Categoría de hora del partido.
 * Entrada: "21:00", "14:30", etc. (hora local del torneo)
 */
export type TimeOfDay = "day" | "evening" | "night" | "unknown";

export function classifyTimeOfDay(matchTime: string | null | undefined): TimeOfDay {
  if (!matchTime) return "unknown";
  const m = matchTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "unknown";
  const h = parseInt(m[1]);
  if (h >= 6  && h < 17) return "day";
  if (h >= 17 && h < 21) return "evening";
  return "night"; // 21:00-05:59
}

/**
 * Categoría de duración del partido.
 */
export type MatchLength = "short" | "medium" | "long" | "unknown";

export function classifyMatchLength(durationMin: number | null | undefined): MatchLength {
  if (durationMin == null) return "unknown";
  if (durationMin < 80)   return "short";   // < 1h20
  if (durationMin <= 150) return "medium";  // 1h20 – 2h30
  return "long";                            // > 2h30
}
