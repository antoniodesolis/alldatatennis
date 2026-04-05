/**
 * lib/analytics/match-pattern.ts
 *
 * Clasifica un partido en: dominio | batalla | irregular | remontada | walkover
 * a partir del marcador, usando las reglas del usuario:
 *   - >3 breaks (aprox) en 3 sets → irregular
 *   - pocos breaks + partido largo → batalla
 *   - ganó rápido + pocos breaks  → dominio
 *   - perdió el primer set        → remontada
 */

export type MatchPattern = "dominio" | "batalla" | "irregular" | "remontada" | "walkover";

interface SetScore {
  winnerGames: number;   // juegos del ganador del PARTIDO en este set
  loserGames: number;
  isTiebreak: boolean;
  gameDiff: number;      // |winnerGames - loserGames| (proxy de breaks)
  winnerWon: boolean;    // el ganador del partido ganó este set
}

/** Parsea el score desde la perspectiva del ganador (result="W"). */
function parseSets(score: string): SetScore[] {
  const tokens = score.toUpperCase()
    .replace(/RET|ABD|DEF/g, "")
    .trim()
    .split(/\s+/);

  const sets: SetScore[] = [];
  for (const tok of tokens) {
    const m = tok.match(/^(\d+)-(\d+)(?:\(\d+\))?$/);
    if (!m) continue;
    const a = parseInt(m[1]);   // siempre >= b en el formato estándar (winner first)
    const b = parseInt(m[2]);
    const isTiebreak = (a === 7 && b === 6) || (a === 6 && b === 7);
    const winnerWon = a > b;
    sets.push({
      winnerGames: Math.max(a, b),
      loserGames: Math.min(a, b),
      isTiebreak,
      gameDiff: Math.abs(a - b),
      winnerWon,
    });
  }
  return sets;
}

/**
 * Estima el número total de breaks en el partido desde el marcador.
 * Heurística: cada juego de diferencia ≈ 1 break neto.
 * Sets de tiebreak = 0 breaks (ambos mantuvieron servicio hasta el 6-6).
 */
function estimateBreaks(sets: SetScore[]): number {
  return sets.reduce((acc, s) => acc + (s.isTiebreak ? 0 : s.gameDiff), 0);
}

export function inferMatchPattern(
  score: string | null | undefined,
  bestOf = 3,
): MatchPattern {
  if (!score) return "irregular";

  const s = score.trim().toUpperCase();
  if (s === "W/O" || s.startsWith("DEF")) return "walkover";

  const sets = parseSets(score);
  if (sets.length === 0) return "irregular";

  const totalSets = sets.length;
  const winnerSetsWon = sets.filter((s) => s.winnerWon).length;
  const loserSetsWon  = sets.filter((s) => !s.winnerWon).length;
  const totalGames    = sets.reduce((a, s) => a + s.winnerGames + s.loserGames, 0);
  const breaks        = estimateBreaks(sets);
  const tbCount       = sets.filter((s) => s.isTiebreak).length;

  // ── Remontada: ganador del partido perdió el primer set ────
  if (sets.length >= 3 && sets[0] && !sets[0].winnerWon) {
    return "remontada";
  }

  // ── Dominio: ganó sin perder sets + márgenes amplios ──────
  if (loserSetsWon === 0) {
    // Victorias muy dominantes: 6-1 6-2, 6-0 6-1, etc.
    const avgDiff = sets.reduce((a, s) => a + s.gameDiff, 0) / sets.length;
    if (avgDiff >= 4 && breaks >= 5) return "dominio";
    // Victoria limpia en 2 sets con breaks claros
    if (breaks >= 3 && !sets.some((s) => s.isTiebreak)) return "dominio";
    // Ganó en 2 sets pero todo fue muy igualado (tiebreaks)
    if (tbCount >= 2) return "batalla";
    // Straight sets moderados
    return breaks >= 3 ? "dominio" : "batalla";
  }

  // ── 3 sets jugados ─────────────────────────────────────────
  if (totalSets === 3) {
    // Muchos breaks → irregular
    if (breaks > 3) return "irregular";
    // Tiebreaks + partido muy disputado → batalla
    if (tbCount >= 2 || breaks <= 2) return "batalla";
    return "irregular";
  }

  // ── 5 sets (Grand Slams) ───────────────────────────────────
  if (totalSets >= 4) {
    if (breaks <= 4) return "batalla";
    return "irregular";
  }

  return "irregular";
}

/** Descripción legible del patrón para el análisis. */
export function matchPatternLabel(p: MatchPattern): string {
  return {
    dominio:   "Dominio claro — el ganador controló el partido de principio a fin",
    batalla:   "Batalla táctica — partido muy igualado con pocos breaks y alta tensión",
    irregular: "Partido irregular — muchos breaks y fluctuaciones en el nivel de juego",
    remontada: "Remontada — el ganador recuperó una desventaja de un set",
    walkover:  "Walkover / retirada",
  }[p];
}

/** Qué aprendemos del patrón sobre el GANADOR. */
export function winnerInsightFromPattern(p: MatchPattern): string | null {
  return {
    dominio:   "mostró dominio táctico y físico — capaz de mantener nivel alto durante todo el partido",
    batalla:   "sólido en situaciones de presión — demostró fiabilidad en los puntos decisivos",
    irregular: "aprovechó la irregularidad del rival — capaz de ganar partidos sin su mejor tenis",
    remontada: "carácter mental destacable — capaz de remontar desde una posición desfavorable",
    walkover:  null,
  }[p];
}

/** Qué aprendemos del patrón sobre el PERDEDOR. */
export function loserInsightFromPattern(p: MatchPattern): string | null {
  return {
    dominio:   "sufrió un desgaste importante — no encontró respuesta táctica al juego del ganador",
    batalla:   "peleó hasta el final pero cedió en los momentos decisivos",
    irregular: "nivel inconsistente — los errores propios pesaron tanto como las armas del rival",
    remontada: "no supo cerrar la ventaja de un set — perdió solidez en el tramo final",
    walkover:  null,
  }[p];
}
