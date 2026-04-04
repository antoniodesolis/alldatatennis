/**
 * Scraper histórico de TennisExplorer — resultados ATP 2025-2026.
 *
 * URL: https://www.tennisexplorer.com/results/?type=atp-single&year=YYYY&month=MM&day=DD
 * Itera día a día; ~459 requests para Jan 2025 – Apr 2026 con 700ms delay = ~5 min.
 *
 * Estructura HTML confirmada:
 *   - <tr class="head flags"> → cabecera de torneo con nombre y enlace
 *   - <tr id="rN" class="one fRow bott"> → fila jugador A (match-detail link aquí)
 *   - <tr id="rNb" class="one"> → fila jugador B
 *   - <td class="result">2</td> → sets ganados (ganador siempre en la primera fila)
 *   - <td class="score">6</td>, <td class="score">3</td>… → sets en columnas 1-5
 *   - <td class="score">6<sup>5</sup></td> → set con tiebreak (loser marcó 5 en TB)
 *
 * source = "te_history"  → en COALESCE tiene más prioridad que "te_scrape" (datos del día)
 */

import { getDb } from "../db/client";
import { upsertPlayer } from "../db/queries";
import { normalizeSurface, normalizeRound, ATP_SLUG_MAP } from "../analytics/player-resolver";
import { getPlayerStyle } from "../analytics/player-styles";
import { getTourneyLevel, isIndoor, type TourneyLevel } from "./tourney-meta";
import { playerScoreStats } from "./score-parser";

const UA  = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
const DELAY_MS = 1200;

// ── Surface lookup ────────────────────────────────────────

const CLAY_KW   = ["roland garros","monte-carlo","monte carlo","madrid","rome","foro italico","barcelona","hamburg","buenos aires","santiago","rio","houston","estoril","munich","geneva","lyon","kitzbuhel","gstaad","bastad","båstad","umag","croatia","casablanca","marrakech","istanbul","bucharest","geneva","swiss open (clay)","eastbourne clay"];
const GRASS_KW  = ["wimbledon","halle","queens","queen's","eastbourne","hertogenbosch","mallorca","birmingham","nottingham"];
const IHARD_KW  = ["rotterdam","marseille","dallas","montpellier","sofia","metz","vienna","erste bank","paris master","rolex paris","bnp paribas masters","atp finals","nitto atp","next gen","basel","swiss indoor","dubai","doha","qatar","antwerp","gijon","stockholm","milan"];

function surfaceFromName(name: string): string {
  const n = name.toLowerCase();
  if (CLAY_KW.some((k)  => n.includes(k))) return "clay";
  if (GRASS_KW.some((k) => n.includes(k))) return "grass";
  if (IHARD_KW.some((k) => n.includes(k))) return "indoor hard";
  return "hard";  // default para ATP: mayoría en pista dura
}

// ── Tourney level inference ───────────────────────────────

function inferTELevel(name: string): TourneyLevel {
  const n = name.toLowerCase();
  if (/australian open|roland.garros|wimbledon|us open/.test(n)) return "grand-slam";
  if (/masters 1000|indian wells|miami|monte.carlo|madrid|rome|foro italico|canada|montreal|toronto|cincinnati|shanghai|paris master|rolex paris/.test(n)) return "masters-1000";
  if (/nitto atp finals|atp finals|tour finals/.test(n)) return "atp-finals";
  return getTourneyLevel("A", name);
}

// ── HTML helpers ──────────────────────────────────────────

function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** Extrae el score de sets en formato "6-3 3-6 7-5" a partir de dos arrays de celdas */
function buildScore(aScores: string[], bScores: string[]): string | null {
  const sets: string[] = [];
  const len = Math.min(aScores.length, bScores.length);
  for (let i = 0; i < len; i++) {
    const a = aScores[i]; const b = bScores[i];
    if (!a || !b || a === "&nbsp;" || b === "&nbsp;") break;
    // Extraer número base y posible tiebreak de <sup>
    const aNum = a.replace(/<sup[^>]*>\d+<\/sup>/i, "").trim();
    const bTb  = (b.match(/<sup[^>]*>(\d+)<\/sup>/i) ?? [])[1] ?? null;
    const aNum2 = parseInt(aNum); const bNum = parseInt(b.replace(/<[^>]+>/g, "").trim());
    if (isNaN(aNum2) || isNaN(bNum)) break;
    // Tiebreak: si aNum=7 y bNum=6 (o a=6 b=7 para el perdedor) mostrar (TB score)
    if ((aNum2 === 7 && bNum === 6) || (aNum2 === 6 && bNum === 7)) {
      const tbScore = bTb ?? null;
      sets.push(tbScore ? `${aNum2}-${bNum}(${tbScore})` : `${aNum2}-${bNum}`);
    } else {
      sets.push(`${aNum2}-${bNum}`);
    }
  }
  return sets.length > 0 ? sets.join(" ") : null;
}

// ── Parser principal ──────────────────────────────────────

interface ParsedRow {
  matchNum: string;      // "10" from id="r10"
  isB: boolean;          // true para id="r10b"
  playerSlug: string;
  playerName: string;
  setsWon: number;       // valor de <td class="result">
  scoresCells: string[]; // raw innerHTML de las 5 score cells
  matchDetailId: string | null;
  matchTime: string | null;
}

interface TEMatch {
  teMatchId: string;
  date: string;
  tournament: string;
  tournamentSlug: string;
  surface: string;
  round: string | null;
  winnerSlug: string;
  loserSlug: string;
  winnerName: string;
  loserName: string;
  score: string | null;
  matchTime: string | null;
}

function parseDayPage(html: string, date: string): TEMatch[] {
  const results: TEMatch[] = [];
  // Almacena el torneo activo cuando se ve la primera fila del par (la "a")
  const rowMap = new Map<string, { a?: ParsedRow; b?: ParsedRow; tournament: string; tournamentSlug: string }>();
  const rowOrder: string[] = [];

  let currentTournament = "";
  let currentTournamentSlug = "";

  // Iterar fila a fila
  const rowRe = /<tr([^>]*)>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;

  while ((m = rowRe.exec(html)) !== null) {
    const attrs = m[1];
    const inner = m[2];

    // Cabecera de torneo
    if (/class="[^"]*head[^"]*flags[^"]*"/.test(attrs)) {
      // Extraer nombre y slug del torneo del primer enlace <a> en la cabecera
      // IMPORTANTE: usar [\s\S]*?<\/a> para no capturar las celdas de columna (S 1 2 3 4 5)
      const tnLink = inner.match(/href="\/([^/"]+)\/\d{4}\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      if (tnLink) {
        currentTournamentSlug = tnLink[1];
        currentTournament = stripTags(tnLink[2]).trim();
      }
      continue;
    }

    // Filas de partido — tienen id="rNN" o id="rNNb"
    const idM = attrs.match(/\bid="r(\d+)(b?)"/);
    if (!idM) continue;

    const matchNum = idM[1];
    const isB = idM[2] === "b";

    // Slug y nombre del jugador
    const playerLinkM = inner.match(/href="\/player\/([^/"]+)\/?[^"]*"[^>]*>([^<]+)<\/a>/i);
    if (!playerLinkM) continue;
    const playerSlug = normalizeTeSlug(playerLinkM[1]);
    const playerName = playerLinkM[2].replace(/\s*\(\d+\)\s*$/, "").trim(); // quitar seed ej "(9)"

    // Sets ganados
    const resultM = inner.match(/class="result"[^>]*>(\d+)<\/td>/);
    const setsWon = resultM ? parseInt(resultM[1]) : -1;

    // Celdas de score (5 columnas)
    const scoreMatches = [...inner.matchAll(/class="score"[^>]*>([\s\S]*?)<\/td>/gi)];
    const scoresCells  = scoreMatches.map((sm) => sm[1].trim());

    // Match-detail ID (sólo en la fila "a", que tiene rowspan)
    const detailM = inner.match(/match-detail\/\?id=(\d+)/);
    const matchDetailId = detailM ? detailM[1] : null;

    // Hora del partido
    const timeM = inner.match(/class="[^"]*time[^"]*"[^>]*>([\d:]+)<br/);
    const matchTime = timeM ? timeM[1].trim() : null;

    const row: ParsedRow = { matchNum, isB, playerSlug, playerName, setsWon, scoresCells, matchDetailId, matchTime };

    if (!rowMap.has(matchNum)) {
      // Guardar el torneo activo al crear el par (la fila "a" llega primero)
      rowMap.set(matchNum, { tournament: currentTournament, tournamentSlug: currentTournamentSlug });
      rowOrder.push(matchNum);
    }
    const pair = rowMap.get(matchNum)!;
    if (isB) pair.b = row; else pair.a = row;
  }

  // Combinar pares
  for (const num of rowOrder) {
    const pair = rowMap.get(num)!;
    if (!pair.a || !pair.b) continue;  // par incompleto

    const rowA = pair.a;
    const rowB = pair.b;

    // Usar el torneo guardado cuando se parseó este par, no el último de la página
    const pairTournament     = pair.tournament;
    const pairTournamentSlug = pair.tournamentSlug;

    // Filtrar eventos no ATP-main-tour
    if (!isATPMainTour(pairTournament)) continue;

    // Determinar ganador: mayor setsWon
    const aWins = rowA.setsWon >= rowB.setsWon;
    const winner = aWins ? rowA : rowB;
    const loser  = aWins ? rowB : rowA;

    // Score (reconstruir combinando set cells)
    const winnerCells = (aWins ? rowA : rowB).scoresCells;
    const loserCells  = (aWins ? rowB : rowA).scoresCells;
    const score = buildScore(winnerCells, loserCells);

    const teMatchId = rowA.matchDetailId ? `teh_${rowA.matchDetailId}` : `teh_${date}_${num}`;

    const surface = surfaceFromName(pairTournament);

    results.push({
      teMatchId,
      date,
      tournament: pairTournament,
      tournamentSlug: pairTournamentSlug,
      surface,
      round: null,   // TE results pages no muestran ronda en la lista principal
      winnerSlug: winner.playerSlug,
      loserSlug:  loser.playerSlug,
      winnerName: winner.playerName,
      loserName:  loser.playerName,
      score,
      matchTime: rowA.matchTime,
    });
  }

  return results;
}

// ── ATP main tour filter ──────────────────────────────────

const SKIP_KW = [
  "challenger", "chall.", "utr pro", "utr ", "davis cup", "itf",
  "futures", "series", "hopman", "barletta", "miyazaki", "menorca",
  "sao leopoldo", "san luis potosi", "university games", "university",
  "world games", "pan american", "continental cup", "nations cup",
  // Ligas nacionales por equipos
  "bundesliga", "nationalliga", "championship", "ligue", "liga ",
  "premier league", "ekstraklasa", "division", "interclub",
];

// Torneos ATP que contienen palabras del filtro y NO deben excluirse
const SKIP_ALLOWLIST = ["indian wells", "monte-carlo", "monte carlo"];

function isATPMainTour(tournament: string): boolean {
  const n = tournament.toLowerCase();
  if (SKIP_ALLOWLIST.some((kw) => n.includes(kw))) return true;
  return !SKIP_KW.some((kw) => n.includes(kw));
}

// ── DB insert ─────────────────────────────────────────────

let _insertStmt: ReturnType<ReturnType<typeof getDb>["prepare"]> | null = null;

function getInsertStmt() {
  if (_insertStmt) return _insertStmt;
  const db = getDb();
  _insertStmt = db.prepare(`
    INSERT INTO player_match_stats
      (te_slug, te_match_id, match_date, tournament, surface, round,
       opponent_slug, result, score, duration_min,
       aces, double_faults, serve_pts, first_in, first_won, second_won,
       serve_games, bp_saved, bp_faced, return_pts_won,
       winners, unforced_errors, match_time, time_of_day, opponent_style,
       best_of, tourney_level, indoor, opponent_rank,
       sets_played, won_deciding, tb_played, tb_won, bp_converted, bp_opportunities,
       court_speed, source)
    VALUES
      (@te_slug, @te_match_id, @match_date, @tournament, @surface, @round,
       @opponent_slug, @result, @score, @duration_min,
       NULL, NULL, NULL, NULL, NULL, NULL,
       NULL, NULL, NULL, NULL,
       NULL, NULL, @match_time, NULL, @opponent_style,
       @best_of, @tourney_level, @indoor, NULL,
       @sets_played, @won_deciding, @tb_played, @tb_won, NULL, NULL,
       NULL, @source)
    ON CONFLICT(te_slug, te_match_id) DO UPDATE SET
      tournament    = COALESCE(excluded.tournament,    tournament),
      surface       = COALESCE(excluded.surface,       surface),
      round         = COALESCE(excluded.round,         round),
      score         = COALESCE(excluded.score,         score),
      result        = COALESCE(excluded.result,        result),
      match_time    = COALESCE(excluded.match_time,    match_time),
      tourney_level = COALESCE(excluded.tourney_level, tourney_level),
      indoor        = COALESCE(excluded.indoor,        indoor),
      opponent_slug = COALESCE(excluded.opponent_slug, opponent_slug),
      opponent_style= COALESCE(excluded.opponent_style,opponent_style),
      sets_played   = COALESCE(excluded.sets_played,   sets_played),
      won_deciding  = COALESCE(excluded.won_deciding,  won_deciding),
      tb_played     = COALESCE(excluded.tb_played,     tb_played),
      tb_won        = COALESCE(excluded.tb_won,        tb_won),
      source        = CASE WHEN excluded.source = 'te_history' THEN excluded.source ELSE source END
  `);
  return _insertStmt;
}

function insertMatches(matches: TEMatch[]): { inserted: number; dupes: number } {
  if (matches.length === 0) return { inserted: 0, dupes: 0 };
  const db  = getDb();
  const stmt = getInsertStmt();
  let inserted = 0, dupes = 0;

  const run = db.transaction(() => {
    for (const m of matches) {
      const level  = inferTELevel(m.tournament);
      const indoor = isIndoor(m.tournament, m.surface) ? 1 : 0;

      upsertPlayer({ te_slug: m.winnerSlug, atp_code: null, full_name: m.winnerName, sackmann_id: null });
      upsertPlayer({ te_slug: m.loserSlug,  atp_code: null, full_name: m.loserName,  sackmann_id: null });

      const wStats = m.score ? playerScoreStats(m.score, "W", 3) : null;
      const lStats = m.score ? playerScoreStats(m.score, "L", 3) : null;

      const base = {
        te_match_id:  m.teMatchId,
        match_date:   m.date,
        tournament:   m.tournament,
        surface:      m.surface,
        round:        m.round,
        score:        m.score,
        duration_min: null,
        match_time:   m.matchTime,
        tourney_level: level,
        indoor,
        best_of: 3,
        source: "te_history",
      };

      const rW = stmt.run({
        ...base,
        te_slug:       m.winnerSlug,
        opponent_slug: m.loserSlug,
        result:        "W",
        opponent_style: getPlayerStyle(m.loserSlug),
        sets_played:   wStats?.setsPlayed   ?? null,
        won_deciding:  wStats?.wonDeciding  ? 1 : (wStats?.wentToDeciding ? 0 : null),
        tb_played:     wStats?.tbPlayed     ?? null,
        tb_won:        wStats?.tbWon        ?? null,
      });

      const rL = stmt.run({
        ...base,
        te_slug:       m.loserSlug,
        opponent_slug: m.winnerSlug,
        result:        "L",
        opponent_style: getPlayerStyle(m.winnerSlug),
        sets_played:   lStats?.setsPlayed   ?? null,
        won_deciding:  lStats?.wentToDeciding ? 0 : null,
        tb_played:     lStats?.tbPlayed     ?? null,
        tb_won:        lStats?.tbWon        ?? null,
      });

      if ((rW.changes ?? 0) + (rL.changes ?? 0) > 0) inserted++; else dupes++;
    }
  });

  run();
  return { inserted, dupes };
}

// ── HTTP fetch ────────────────────────────────────────────

// Usa https nativo de Node.js para evitar el caché de Next.js fetch
import https from "https";

function httpsGet(url: string, timeoutMs = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Connection": "close",
      },
      // Nueva conexión TCP por request; evita ECONNRESET en keep-alive
      agent: false,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
    });
    req.setTimeout(timeoutMs, () => { req.destroy(new Error("timeout")); });
    req.on("error", reject);
  });
}

async function fetchDayPage(year: number, month: number, day: number): Promise<string | null> {
  const mm  = String(month).padStart(2, "0");
  const dd  = String(day).padStart(2, "0");
  const url = `https://www.tennisexplorer.com/results/?type=atp-single&year=${year}&month=${mm}&day=${dd}`;
  try {
    return await httpsGet(url);
  } catch (e) {
    console.warn(`[te-history] Error fetch ${url}:`, e);
    return null;
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * TE usa slugs con sufijo hash para desambiguar (ej. "sinner-8b8e8", "fritz-f1aa7").
 * Si el nombre base está en ATP_SLUG_MAP, usamos el nombre corto canónico.
 * Así los datos de te_history son compatibles con los de sackmann_csv.
 */
function normalizeTeSlug(slug: string): string {
  const m = slug.match(/^(.+)-([a-f0-9]{4,8})$/);
  if (m) {
    const base = m[1];
    if (ATP_SLUG_MAP[base] !== undefined) return base;
  }
  return slug;
}

// ── Public API ────────────────────────────────────────────

export interface DayResult {
  date: string;
  matches: number;
  inserted: number;
  dupes: number;
  error?: string;
}

export interface MonthResult {
  year: number;
  month: number;
  days: number;
  matches: number;
  inserted: number;
  dupes: number;
}

/**
 * Scrapea y guarda un día concreto.
 */
export async function scrapeTeDay(year: number, month: number, day: number): Promise<DayResult> {
  const date = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  const html = await fetchDayPage(year, month, day);
  if (!html) return { date, matches: 0, inserted: 0, dupes: 0, error: "fetch_failed" };

  const parsed = parseDayPage(html, date);
  if (parsed.length === 0) return { date, matches: 0, inserted: 0, dupes: 0 };

  const { inserted, dupes } = insertMatches(parsed);
  return { date, matches: parsed.length, inserted, dupes };
}

/**
 * Scrapea un mes completo día a día.
 */
export async function scrapeTeMonth(year: number, month: number): Promise<MonthResult> {
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  let totalMatches = 0, totalInserted = 0, totalDupes = 0, daysProcessed = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    if (d > today) break; // no futuro

    const r = await scrapeTeDay(year, month, day);
    totalMatches   += r.matches;
    totalInserted  += r.inserted;
    totalDupes     += r.dupes;
    daysProcessed++;

    if (r.matches > 0) {
      console.log(`[te-history] ${r.date}: ${r.matches} partidos, +${r.inserted} nuevos`);
    }
    await sleep(DELAY_MS);
  }

  return { year, month, days: daysProcessed, matches: totalMatches, inserted: totalInserted, dupes: totalDupes };
}

export interface HistoryResult {
  months: MonthResult[];
  totalMatches: number;
  totalInserted: number;
  totalDupes: number;
}

/**
 * Ingesta histórica completa desde fromDate hasta hoy.
 */
export async function ingestTEHistory(fromDate = "2025-01-01"): Promise<HistoryResult> {
  const from = new Date(fromDate);
  const to   = new Date();

  // Listar meses únicos
  const months: { year: number; month: number }[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= to) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }

  const results: MonthResult[] = [];
  for (const { year, month } of months) {
    console.log(`[te-history] Procesando ${year}-${String(month).padStart(2,"0")}…`);
    const r = await scrapeTeMonth(year, month);
    results.push(r);
    console.log(`[te-history] ${year}-${String(month).padStart(2,"0")}: ${r.matches} partidos, ${r.inserted} nuevos, ${r.dupes} dupes`);
  }

  return {
    months: results,
    totalMatches:  results.reduce((s, r) => s + r.matches, 0),
    totalInserted: results.reduce((s, r) => s + r.inserted, 0),
    totalDupes:    results.reduce((s, r) => s + r.dupes, 0),
  };
}
