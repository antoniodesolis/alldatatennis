// ATP Singles matches — scraping de TennisExplorer
// ?date=YYYY-MM-DD  → resultados históricos (por defecto hoy en vivo)

import { NextRequest } from "next/server";

export interface ATPMatch {
  id: string;
  player1: string;
  player2: string;
  player1Slug: string;
  player2Slug: string;
  tournament: string;
  tournamentSlug: string;
  time: string;
  surface: string;
  round: string;
  status: string;         // "scheduled" | "live" | "finished"
  score?: string;         // "6-3 7-5" (desde perspectiva del ganador)
  winner?: "player1" | "player2"; // quién ganó
}

// ── Superficie estática por torneo ────────────────────────

const SURFACE_MAP: Record<string, string> = {
  houston: "clay", bucharest: "clay", marrakech: "clay",
  "monte-carlo": "clay", barcelona: "clay", madrid: "clay",
  rome: "clay", paris: "indoor hard", wimbledon: "grass",
  "us-open": "hard", "australian-open": "hard", "roland-garros": "clay",
  miami: "hard", dubai: "hard", doha: "hard", rotterdam: "indoor hard",
  marseille: "indoor hard", sofia: "indoor hard", montpellier: "indoor hard",
  dallas: "indoor hard", rio: "clay", "buenos-aires": "clay",
  acapulco: "hard", "indian-wells": "hard",
};

const CLAY_KW   = ["roland garros","monte-carlo","monte carlo","madrid","rome","foro italico","barcelona","hamburg","buenos aires","santiago","rio","houston","estoril","munich","geneva","lyon","kitzbuhel","gstaad","bastad","umag","croatia","casablanca","marrakech","istanbul","bucharest"];
const GRASS_KW  = ["wimbledon","halle","queens","queen's","eastbourne","hertogenbosch","mallorca","birmingham","nottingham"];
const IHARD_KW  = ["rotterdam","marseille","dallas","montpellier","sofia","metz","vienna","paris master","atp finals","nitto atp","next gen","basel","dubai","doha","qatar","antwerp","stockholm"];

const ROUND_NORMALIZE: Record<string, string> = {
  "round of 128": "R128", "round of 64": "R64", "round of 32": "R32",
  "round of 16": "R16", "quarterfinal": "QF", "quarterfinals": "QF",
  "semifinal": "SF", "semifinals": "SF", "final": "F",
  "q1": "Q1", "q2": "Q2", "qualification": "Q",
};

const SKIP_KW = [
  "challenger","chall.","utr pro","utr ","davis cup","itf",
  "futures","series","hopman","barletta","miyazaki","menorca",
  "sao leopoldo","san luis potosi","university games","university",
  "world games","pan american","continental cup","nations cup",
  "bundesliga","nationalliga","championship","ligue","liga ",
  "premier league","ekstraklasa","division","interclub",
];
const SKIP_ALLOWLIST = ["indian wells","monte-carlo","monte carlo"];

// ── Helpers ───────────────────────────────────────────────

function normalizeRound(raw: string): string {
  return ROUND_NORMALIZE[raw.toLowerCase().trim()] ?? raw;
}

function cleanName(raw: string): string {
  return raw.replace(/\s*\([^)]*\)\s*/g, "").trim();
}

function parseTournamentSlug(href: string): string {
  const m = href.match(/^\/([^/]+)\//);
  return m ? m[1] : href;
}

function guessSurface(slug: string): string {
  for (const [key, surf] of Object.entries(SURFACE_MAP)) {
    if (slug.includes(key)) return surf;
  }
  return "";
}

function surfaceFromName(name: string): string {
  const n = name.toLowerCase();
  if (CLAY_KW.some((k)  => n.includes(k))) return "clay";
  if (GRASS_KW.some((k) => n.includes(k))) return "grass";
  if (IHARD_KW.some((k) => n.includes(k))) return "indoor hard";
  return "hard";
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function isATPMainTour(tournament: string): boolean {
  const n = tournament.toLowerCase();
  if (SKIP_ALLOWLIST.some((kw) => n.includes(kw))) return true;
  return !SKIP_KW.some((kw) => n.includes(kw));
}

/** Reconstruye el score desde perspectiva del ganador: "6-3 7-5(3)" */
function buildScore(winCells: string[], losCells: string[]): string | null {
  const sets: string[] = [];
  const len = Math.min(winCells.length, losCells.length);
  for (let i = 0; i < len; i++) {
    const a = winCells[i]; const b = losCells[i];
    if (!a || !b || a === "&nbsp;" || b === "&nbsp;") break;
    const aNum = parseInt(a.replace(/<[^>]+>/g, "").trim());
    const bNum = parseInt(b.replace(/<[^>]+>/g, "").trim());
    if (isNaN(aNum) || isNaN(bNum)) break;
    const tbScore = (b.match(/<sup[^>]*>(\d+)<\/sup>/i) ?? [])[1] ?? null;
    if ((aNum === 7 && bNum === 6) || (aNum === 6 && bNum === 7)) {
      sets.push(tbScore ? `${aNum}-${bNum}(${tbScore})` : `${aNum}-${bNum}`);
    } else {
      sets.push(`${aNum}-${bNum}`);
    }
  }
  return sets.length > 0 ? sets.join(" ") : null;
}

// ── Parser para la página de partidos de hoy (live) ───────

function parseMatches(html: string): ATPMatch[] {
  const matches: ATPMatch[] = [];
  const blocks = html.split('<tr class="head flags">').slice(1);

  for (const block of blocks) {
    const tMatch = block.match(/href="(\/[^"]+\/2026\/atp-men\/[^"]*)">(?:[^<]*<[^>]+>[^<]*<\/[^>]+>){1,4}([^<]+)<\/a>/);
    if (!tMatch) continue;

    const tournamentHref = tMatch[1];
    const tournamentName = tMatch[2].trim();
    const slug = parseTournamentSlug(tournamentHref);
    const staticSurface = guessSurface(slug);

    const pairRegex = /<tr id="([a-z]\d+)" class="[^"]*bott[^"]*"[^>]*>([\s\S]*?)<\/tr>\s*<tr id="[a-z]\d+b"[^>]*>([\s\S]*?)<\/tr>/g;
    let m: RegExpExecArray | null;

    while ((m = pairRegex.exec(block)) !== null) {
      const row1 = m[2];
      const row2 = m[3];

      const timeMatch = row1.match(/class="first time"[^>]*>\s*(\d{1,2}:\d{2})/);
      const time = timeMatch ? timeMatch[1] : "";

      const p1Match = row1.match(/class="t-name"><a href="\/player\/([^"]+)">([^<]+)<\/a>/);
      const p2Match = row2.match(/class="t-name"><a href="\/player\/([^"]+)">([^<]+)<\/a>/);
      if (!p1Match || !p2Match) continue;

      const player1Slug = p1Match[1].replace(/\/$/, "");
      const player2Slug = p2Match[1].replace(/\/$/, "");
      const player1 = cleanName(p1Match[2]);
      const player2 = cleanName(p2Match[2]);
      if (!player1 || !player2) continue;

      const hasResult = /class="result">\d/.test(row1);
      const isLive = /●/.test(row1) || /class="[^"]*live[^"]*"/.test(row1);
      const status = isLive ? "live" : hasResult ? "finished" : "scheduled";

      const detailId = row1.match(/match-detail\/\?id=(\d+)/)?.[1] ?? m[1];

      // Extraer score para partidos terminados
      let score: string | undefined;
      let winner: "player1" | "player2" | undefined;
      if (hasResult) {
        const p1SetsM = row1.match(/class="result"[^>]*>(\d+)/);
        const p2SetsM = row2.match(/class="result"[^>]*>(\d+)/);
        const p1Sets = p1SetsM ? parseInt(p1SetsM[1]) : 0;
        const p2Sets = p2SetsM ? parseInt(p2SetsM[1]) : 0;
        const scoreRe = /class="score"[^>]*>([\s\S]*?)<\/td>/g;
        const p1Cells = [...row1.matchAll(scoreRe)].map((s) => s[1]);
        const p2Cells = [...row2.matchAll(scoreRe)].map((s) => s[1]);
        const p1Wins = p1Sets >= p2Sets;
        winner = p1Wins ? "player1" : "player2";
        score = buildScore(p1Wins ? p1Cells : p2Cells, p1Wins ? p2Cells : p1Cells) ?? undefined;
      }

      matches.push({
        id: detailId,
        player1, player2, player1Slug, player2Slug,
        tournament: tournamentName, tournamentSlug: slug,
        time, surface: staticSurface, round: "", status,
        score, winner,
      });
    }
  }

  return matches;
}

// ── Parser para la página de resultados históricos ────────

function parseResultsPage(html: string): ATPMatch[] {
  const results: ATPMatch[] = [];
  const rowMap = new Map<string, {
    a?: { playerSlug: string; playerName: string; setsWon: number; scoresCells: string[]; matchDetailId: string | null; matchTime: string };
    b?: { playerSlug: string; playerName: string; setsWon: number; scoresCells: string[]; matchDetailId: string | null; matchTime: string };
    tournament: string; tournamentSlug: string;
  }>();
  const rowOrder: string[] = [];

  let currentTournament = "";
  let currentTournamentSlug = "";

  const rowRe = /<tr([^>]*)>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;

  while ((m = rowRe.exec(html)) !== null) {
    const attrs = m[1];
    const inner = m[2];

    if (/class="[^"]*head[^"]*flags[^"]*"/.test(attrs)) {
      const tnLink = inner.match(/href="\/([^/"]+)\/\d{4}\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      if (tnLink) {
        currentTournamentSlug = tnLink[1];
        currentTournament = stripTags(tnLink[2]).trim();
      }
      continue;
    }

    const idM = attrs.match(/\bid="r(\d+)(b?)"/);
    if (!idM) continue;

    const matchNum = idM[1];
    const isB = idM[2] === "b";

    const playerLinkM = inner.match(/href="\/player\/([^/"]+)\/?[^"]*"[^>]*>([^<]+)<\/a>/i);
    if (!playerLinkM) continue;
    const playerSlug = playerLinkM[1].replace(/\/+$/, "");
    const playerName = playerLinkM[2].replace(/\s*\(\d+\)\s*$/, "").trim();

    const resultM = inner.match(/class="result"[^>]*>(\d+)<\/td>/);
    const setsWon = resultM ? parseInt(resultM[1]) : -1;

    const scoreMatches = [...inner.matchAll(/class="score"[^>]*>([\s\S]*?)<\/td>/gi)];
    const scoresCells = scoreMatches.map((sm) => sm[1].trim());

    const detailM = inner.match(/match-detail\/\?id=(\d+)/);
    const matchDetailId = detailM ? detailM[1] : null;

    const timeM = inner.match(/class="[^"]*time[^"]*"[^>]*>([\d:]+)<br/i);
    const matchTime = timeM ? timeM[1].trim() : "";

    if (!rowMap.has(matchNum)) {
      rowMap.set(matchNum, { tournament: currentTournament, tournamentSlug: currentTournamentSlug });
      rowOrder.push(matchNum);
    }
    const pair = rowMap.get(matchNum)!;
    const rowData = { playerSlug, playerName, setsWon, scoresCells, matchDetailId, matchTime };
    if (isB) pair.b = rowData; else pair.a = rowData;
  }

  for (const num of rowOrder) {
    const pair = rowMap.get(num)!;
    if (!pair.a || !pair.b) continue;

    const { a, b, tournament, tournamentSlug } = pair;
    if (!isATPMainTour(tournament)) continue;

    const aWins = a.setsWon >= b.setsWon;
    const winRow = aWins ? a : b;
    const losRow = aWins ? b : a;

    const score = buildScore(winRow.scoresCells, losRow.scoresCells) ?? undefined;
    const id = a.matchDetailId ?? `res_${num}`;
    const surface = guessSurface(tournamentSlug) || surfaceFromName(tournament);

    results.push({
      id,
      player1: a.playerName,
      player2: b.playerName,
      player1Slug: a.playerSlug,
      player2Slug: b.playerSlug,
      tournament,
      tournamentSlug,
      time: a.matchTime,
      surface,
      round: "",
      status: "finished",
      score,
      winner: aWins ? "player1" : "player2",
    });
  }

  return results;
}

// ── Enriquecimiento (ronda y superficie desde match-detail) ─

async function enrichMatches(matches: ATPMatch[]): Promise<ATPMatch[]> {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
  const tournamentsToFetch = [...new Set(
    matches.filter(m => !m.surface).map(m => m.id).slice(0, 5)
  )];

  await Promise.all(
    tournamentsToFetch.map(async (id) => {
      try {
        const res = await fetch(`https://www.tennisexplorer.com/match-detail/?id=${id}`, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const html = await res.text();
        const infoMatch = html.match(/boxBasic lGray">[^,]+,\s*[\d:]+,\s*<a[^>]*>[^<]+<\/a>,\s*([^,<]+),\s*([^<]+)</i);
        if (!infoMatch) return;
        const round = normalizeRound(infoMatch[1].trim());
        const surface = infoMatch[2].trim().toLowerCase();
        const match = matches.find(m => m.id === id);
        if (!match) return;
        for (const m of matches) {
          if (m.tournamentSlug === match.tournamentSlug) {
            if (!m.surface) m.surface = surface;
            if (!m.round) m.round = round;
          }
        }
      } catch { /* ignorar */ }
    })
  );

  return matches;
}

// ── Cache por fecha ───────────────────────────────────────

const dateCache = new Map<string, { matches: ATPMatch[]; ts: number }>();
const TODAY_CACHE_MS  = 30 * 60 * 1000;  // 30 min para hoy (datos live)
const PAST_CACHE_MS   = 24 * 60 * 60 * 1000; // 24h para días pasados

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── GET handler ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const dateParam = req.nextUrl.searchParams.get("date") ?? todayStr;
  const isToday = dateParam === todayStr;
  const cacheTTL = isToday ? TODAY_CACHE_MS : PAST_CACHE_MS;

  const cached = dateCache.get(dateParam);
  if (cached && Date.now() - cached.ts < cacheTTL) {
    return Response.json({ matches: cached.matches, count: cached.matches.length, cached: true, date: dateParam });
  }

  try {
    let matches: ATPMatch[];

    if (isToday) {
      // ── Partidos de hoy (live) ──────────────────────────
      const res = await fetch("https://www.tennisexplorer.com/matches/?type=atp-single", {
        headers: {
          "User-Agent": UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(`TennisExplorer HTTP ${res.status}`);
      const html = await res.text();
      matches = parseMatches(html);
      if (matches.length === 0) throw new Error("0 partidos parseados");
      matches = await enrichMatches(matches);

    } else {
      // ── Resultados de días pasados ──────────────────────
      const [year, month, day] = dateParam.split("-").map(Number);
      const url = `https://www.tennisexplorer.com/results/?type=atp-single&year=${year}&month=${month}&day=${day}`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`TennisExplorer HTTP ${res.status}`);
      const html = await res.text();
      matches = parseResultsPage(html);
    }

    // Ordenar: scheduled → hora, live, finished
    const ORDER = { scheduled: 0, live: 1, finished: 2 };
    matches.sort((a, b) => {
      const so = ORDER[a.status as keyof typeof ORDER] - ORDER[b.status as keyof typeof ORDER];
      if (so !== 0) return so;
      return a.time.localeCompare(b.time);
    });

    dateCache.set(dateParam, { matches, ts: Date.now() });
    return Response.json({ matches, count: matches.length, cached: false, date: dateParam });

  } catch (err) {
    const msg = (err as Error).message;
    console.error("[matches] Error:", msg);
    return Response.json({ error: msg, matches: [], count: 0, date: dateParam }, { status: 502 });
  }
}
