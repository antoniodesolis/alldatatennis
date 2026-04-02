// ATP Singles matches para hoy — scraping de TennisExplorer
// Fuente: https://www.tennisexplorer.com/matches/?type=atp-single

export interface ATPMatch {
  id: string;          // ID de TennisExplorer
  player1: string;
  player2: string;
  player1Slug: string; // slug de TennisExplorer, p.e. "prizmic"
  player2Slug: string;
  tournament: string;
  tournamentSlug: string; // p.e. "houston"
  time: string;           // "21:00" (hora local del partido)
  surface: string;        // "clay" | "hard" | "grass" | "indoor hard" | "carpet"
  round: string;          // "round of 16" | "quarterfinal" | "semifinal" | "final"
  status: string;         // "scheduled" | "live" | "finished"
}

// Superficie por torneo conocido (cache estático para acelerar respuesta)
// Se complementa con datos del match-detail en tiempo real
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

const ROUND_NORMALIZE: Record<string, string> = {
  "round of 128": "R128", "round of 64": "R64", "round of 32": "R32",
  "round of 16": "R16", "quarterfinal": "QF", "quarterfinals": "QF",
  "semifinal": "SF", "semifinals": "SF", "final": "F",
  "q1": "Q1", "q2": "Q2", "qualification": "Q",
};

function normalizeRound(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return ROUND_NORMALIZE[lower] ?? raw;
}

function cleanName(raw: string): string {
  // Remove seeding "(1)", "(WC)", etc.
  return raw.replace(/\s*\([^)]*\)\s*/g, "").trim();
}

function parseTournamentSlug(href: string): string {
  // href like "/houston/2026/atp-men/" → "houston"
  const m = href.match(/^\/([^/]+)\//);
  return m ? m[1] : href;
}

function guessSurface(slug: string): string {
  for (const [key, surf] of Object.entries(SURFACE_MAP)) {
    if (slug.includes(key)) return surf;
  }
  return "";
}

// Parsea el HTML de TennisExplorer y extrae los partidos ATP singles
function parseMatches(html: string): ATPMatch[] {
  const matches: ATPMatch[] = [];

  // Dividir por bloques de torneo
  const blocks = html.split('<tr class="head flags">').slice(1);

  for (const block of blocks) {
    // Nombre del torneo: texto visible del <a> (después de dos <span>)
    // HTML: <a href="/houston/2026/atp-men/"><span...>&nbsp;</span><span...>&nbsp;</span>Houston</a>
    const tMatch = block.match(/href="(\/[^"]+\/2026\/atp-men\/[^"]*)">(?:[^<]*<[^>]+>[^<]*<\/[^>]+>){1,4}([^<]+)<\/a>/);
    if (!tMatch) continue;

    const tournamentHref = tMatch[1];
    const tournamentName = tMatch[2].trim();
    const slug = parseTournamentSlug(tournamentHref);
    const staticSurface = guessSurface(slug);

    // Estructura real de TennisExplorer:
    //   <tr id="rXX"  class="...bott..."> jugador1 (contiene "first time" con hora)
    //   <tr id="rXXb" class="...">        jugador2 (sin celda de hora)
    const pairRegex = /<tr id="([a-z]\d+)" class="[^"]*bott[^"]*"[^>]*>([\s\S]*?)<\/tr>\s*<tr id="[a-z]\d+b"[^>]*>([\s\S]*?)<\/tr>/g;
    let m: RegExpExecArray | null;

    while ((m = pairRegex.exec(block)) !== null) {
      const row1 = m[2];
      const row2 = m[3];

      // Hora
      const timeMatch = row1.match(/class="first time"[^>]*>\s*(\d{1,2}:\d{2})/);
      const time = timeMatch ? timeMatch[1] : "";

      // Jugadores — extraer nombre y slug de TennisExplorer
      const p1Match = row1.match(/class="t-name"><a href="\/player\/([^"]+)">([^<]+)<\/a>/);
      const p2Match = row2.match(/class="t-name"><a href="\/player\/([^"]+)">([^<]+)<\/a>/);
      if (!p1Match || !p2Match) continue;

      const player1Slug = p1Match[1].replace(/\/$/, "");
      const player2Slug = p2Match[1].replace(/\/$/, "");
      const player1 = cleanName(p1Match[2]);
      const player2 = cleanName(p2Match[2]);
      if (!player1 || !player2) continue;

      // Estado
      const hasResult = /class="result">\d/.test(row1);
      const isLive = /●/.test(row1) || /class="[^"]*live[^"]*"/.test(row1);
      const status = isLive ? "live" : hasResult ? "finished" : "scheduled";

      // ID para match-detail
      const detailId = row1.match(/match-detail\/\?id=(\d+)/)?.[1] ?? m[1];

      matches.push({
        id: detailId,
        player1,
        player2,
        player1Slug,
        player2Slug,
        tournament: tournamentName,
        tournamentSlug: slug,
        time,
        surface: staticSurface,
        round: "",
        status,
      });
    }
  }

  return matches;
}

// Enriquece superficie y ronda desde los match-detail pages
// Solo hacemos peticiones para los primeros N partidos (para no saturar)
async function enrichMatches(matches: ATPMatch[]): Promise<ATPMatch[]> {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

  // Agrupar torneos únicos sin superficie conocida
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

        // Formato: "Today, 01:05, Houston, round of 16, clay"
        const infoMatch = html.match(/boxBasic lGray">[^,]+,\s*[\d:]+,\s*<a[^>]*>[^<]+<\/a>,\s*([^,<]+),\s*([^<]+)</i);
        if (!infoMatch) return;

        const round = normalizeRound(infoMatch[1].trim());
        const surface = infoMatch[2].trim().toLowerCase();

        // Aplicar a todos los partidos del mismo torneo
        const match = matches.find(m => m.id === id);
        if (!match) return;

        for (const m of matches) {
          if (m.tournamentSlug === match.tournamentSlug) {
            if (!m.surface) m.surface = surface;
            if (!m.round) m.round = round;
          }
        }
      } catch {
        // ignorar errores individuales
      }
    })
  );

  return matches;
}

// Caché 30 minutos
let cache: { matches: ATPMatch[]; ts: number } | null = null;
const CACHE_MS = 30 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return Response.json({ matches: cache.matches, count: cache.matches.length, cached: true });
  }

  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  try {
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
    let matches = parseMatches(html);

    if (matches.length === 0) throw new Error("0 partidos parseados");

    // Enriquecer con ronda y superficie para torneos desconocidos
    matches = await enrichMatches(matches);

    // Ordenar: scheduled primero → por hora, luego live, luego finished
    const ORDER = { scheduled: 0, live: 1, finished: 2 };
    matches.sort((a, b) => {
      const so = ORDER[a.status as keyof typeof ORDER] - ORDER[b.status as keyof typeof ORDER];
      if (so !== 0) return so;
      return a.time.localeCompare(b.time);
    });

    cache = { matches, ts: Date.now() };
    return Response.json({ matches, count: matches.length, cached: false });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[matches] Error:", msg);
    return Response.json({ error: msg, matches: [], count: 0 }, { status: 502 });
  }
}
