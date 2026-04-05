// Rankings ATP — datos scrapeados el 2026-03-31, actualizables vía scraping
// Los códigos son los reales de atptour.com (extraídos de los URLs de cada jugador)

export interface ATPPlayer {
  rank: number;
  name: string;
  country: string; // emoji flag
  atpCode: string; // 4-char ATP code, e.g. "s0ag"
  photo: string;   // URL del proxy local /api/photo/[code]
  points: string;
}

// Mapa de códigos de bandera ATP (2-3 letras) → emoji
const FLAGS: Record<string, string> = {
  esp: "🇪🇸", ita: "🇮🇹", ger: "🇩🇪", srb: "🇷🇸", aus: "🇦🇺",
  can: "🇨🇦", usa: "🇺🇸", rus: "🇷🇺", kaz: "🇰🇿", nor: "🇳🇴",
  cze: "🇨🇿", fra: "🇫🇷", gbr: "🇬🇧", den: "🇩🇰", ned: "🇳🇱",
  arg: "🇦🇷", mon: "🇲🇨", bel: "🇧🇪", por: "🇵🇹", gre: "🇬🇷",
  hun: "🇭🇺", cro: "🇭🇷", per: "🇵🇪", bih: "🇧🇦", bul: "🇧🇬",
  aut: "🇦🇹", sui: "🇨🇭", chi: "🇨🇱", bra: "🇧🇷", pol: "🇵🇱",
  geo: "🇬🇪", uzb: "🇺🇿", svk: "🇸🇰", slo: "🇸🇮", col: "🇨🇴",
  ecu: "🇪🇨", uru: "🇺🇾", par: "🇵🇾",
};

// Top 100 ATP reales — ranking 31 marzo 2026 — extraídos de atptour.com
const STATIC_TOP100: ATPPlayer[] = [
  { rank:1,  name:"Carlos Alcaraz",               country: FLAGS.esp, atpCode:"a0e2", photo:"https://www.atptour.com/-/media/alias/player-headshot/a0e2", points:"" },
  { rank:2,  name:"Jannik Sinner",                country: FLAGS.ita, atpCode:"s0ag", photo:"https://www.atptour.com/-/media/alias/player-headshot/s0ag", points:"" },
  { rank:3,  name:"Alexander Zverev",             country: FLAGS.ger, atpCode:"z355", photo:"https://www.atptour.com/-/media/alias/player-headshot/z355", points:"" },
  { rank:4,  name:"Novak Djokovic",               country: FLAGS.srb, atpCode:"d643", photo:"https://www.atptour.com/-/media/alias/player-headshot/d643", points:"" },
  { rank:5,  name:"Lorenzo Musetti",              country: FLAGS.ita, atpCode:"m0ej", photo:"https://www.atptour.com/-/media/alias/player-headshot/m0ej", points:"" },
  { rank:6,  name:"Alex de Minaur",               country: FLAGS.aus, atpCode:"dh58", photo:"https://www.atptour.com/-/media/alias/player-headshot/dh58", points:"" },
  { rank:7,  name:"Felix Auger-Aliassime",        country: FLAGS.can, atpCode:"ag37", photo:"https://www.atptour.com/-/media/alias/player-headshot/ag37", points:"" },
  { rank:8,  name:"Taylor Fritz",                 country: FLAGS.usa, atpCode:"fb98", photo:"https://www.atptour.com/-/media/alias/player-headshot/fb98", points:"" },
  { rank:9,  name:"Ben Shelton",                  country: FLAGS.usa, atpCode:"s0s1", photo:"https://www.atptour.com/-/media/alias/player-headshot/s0s1", points:"" },
  { rank:10, name:"Daniil Medvedev",              country: FLAGS.rus, atpCode:"mm58", photo:"https://www.atptour.com/-/media/alias/player-headshot/mm58", points:"" },
  { rank:11, name:"Alexander Bublik",             country: FLAGS.kaz, atpCode:"bk92", photo:"https://www.atptour.com/-/media/alias/player-headshot/bk92", points:"" },
  { rank:12, name:"Casper Ruud",                  country: FLAGS.nor, atpCode:"rh16", photo:"https://www.atptour.com/-/media/alias/player-headshot/rh16", points:"" },
  { rank:13, name:"Flavio Cobolli",               country: FLAGS.ita, atpCode:"c0e9", photo:"https://www.atptour.com/-/media/alias/player-headshot/c0e9", points:"" },
  { rank:14, name:"Jiri Lehecka",                 country: FLAGS.cze, atpCode:"l0bv", photo:"https://www.atptour.com/-/media/alias/player-headshot/l0bv", points:"" },
  { rank:15, name:"Karen Khachanov",              country: FLAGS.rus, atpCode:"ke29", photo:"https://www.atptour.com/-/media/alias/player-headshot/ke29", points:"" },
  { rank:16, name:"Andrey Rublev",                country: FLAGS.rus, atpCode:"re44", photo:"https://www.atptour.com/-/media/alias/player-headshot/re44", points:"" },
  { rank:17, name:"Alejandro Davidovich Fokina",  country: FLAGS.esp, atpCode:"dh50", photo:"https://www.atptour.com/-/media/alias/player-headshot/dh50", points:"" },
  { rank:18, name:"Frances Tiafoe",               country: FLAGS.usa, atpCode:"td51", photo:"https://www.atptour.com/-/media/alias/player-headshot/td51", points:"" },
  { rank:19, name:"Luciano Darderi",              country: FLAGS.ita, atpCode:"d0fj", photo:"https://www.atptour.com/-/media/alias/player-headshot/d0fj", points:"" },
  { rank:20, name:"Francisco Cerundolo",          country: FLAGS.arg, atpCode:"c0au", photo:"https://www.atptour.com/-/media/alias/player-headshot/c0au", points:"" },
  { rank:21, name:"Tommy Paul",                   country: FLAGS.usa, atpCode:"pl56", photo:"https://www.atptour.com/-/media/alias/player-headshot/pl56", points:"" },
  { rank:22, name:"Learner Tien",                 country: FLAGS.usa, atpCode:"t0ha", photo:"https://www.atptour.com/-/media/alias/player-headshot/t0ha", points:"" },
  { rank:23, name:"Valentin Vacherot",            country: FLAGS.mon, atpCode:"va25", photo:"https://www.atptour.com/-/media/alias/player-headshot/va25", points:"" },
  { rank:24, name:"Cameron Norrie",               country: FLAGS.gbr, atpCode:"n771", photo:"https://www.atptour.com/-/media/alias/player-headshot/n771", points:"" },
  { rank:25, name:"Jack Draper",                  country: FLAGS.gbr, atpCode:"d0co", photo:"https://www.atptour.com/-/media/alias/player-headshot/d0co", points:"" },
  { rank:26, name:"Jakub Mensik",                 country: FLAGS.cze, atpCode:"m0ni", photo:"https://www.atptour.com/-/media/alias/player-headshot/m0ni", points:"" },
  { rank:27, name:"Arthur Rinderknech",           country: FLAGS.fra, atpCode:"rc91", photo:"https://www.atptour.com/-/media/alias/player-headshot/rc91", points:"" },
  { rank:28, name:"Arthur Fils",                  country: FLAGS.fra, atpCode:"f0f1", photo:"https://www.atptour.com/-/media/alias/player-headshot/f0f1", points:"" },
  { rank:29, name:"Holger Rune",                  country: FLAGS.den, atpCode:"r0dg", photo:"https://www.atptour.com/-/media/alias/player-headshot/r0dg", points:"" },
  { rank:30, name:"Tallon Griekspoor",            country: FLAGS.ned, atpCode:"gj37", photo:"https://www.atptour.com/-/media/alias/player-headshot/gj37", points:"" },
  { rank:31, name:"T.M. Etcheverry",              country: FLAGS.arg, atpCode:"ea24", photo:"https://www.atptour.com/-/media/alias/player-headshot/ea24", points:"" },
  { rank:32, name:"Corentin Moutet",              country: FLAGS.fra, atpCode:"mw02", photo:"https://www.atptour.com/-/media/alias/player-headshot/mw02", points:"" },
  { rank:33, name:"Brandon Nakashima",            country: FLAGS.usa, atpCode:"n0ae", photo:"https://www.atptour.com/-/media/alias/player-headshot/n0ae", points:"" },
  { rank:34, name:"Ugo Humbert",                  country: FLAGS.fra, atpCode:"hh26", photo:"https://www.atptour.com/-/media/alias/player-headshot/hh26", points:"" },
  { rank:35, name:"Alex Michelsen",               country: FLAGS.usa, atpCode:"m0qi", photo:"https://www.atptour.com/-/media/alias/player-headshot/m0qi", points:"" },
  { rank:36, name:"Gabriel Diallo",               country: FLAGS.can, atpCode:"d0f6", photo:"https://www.atptour.com/-/media/alias/player-headshot/d0f6", points:"" },
  { rank:37, name:"Jaume Munar",                  country: FLAGS.esp, atpCode:"mu94", photo:"https://www.atptour.com/-/media/alias/player-headshot/mu94", points:"" },
  { rank:38, name:"Denis Shapovalov",             country: FLAGS.can, atpCode:"su55", photo:"https://www.atptour.com/-/media/alias/player-headshot/su55", points:"" },
  { rank:39, name:"Alejandro Tabilo",             country: FLAGS.chi, atpCode:"te30", photo:"https://www.atptour.com/-/media/alias/player-headshot/te30", points:"" },
  { rank:40, name:"Joao Fonseca",                 country: FLAGS.bra, atpCode:"f0fv", photo:"https://www.atptour.com/-/media/alias/player-headshot/f0fv", points:"" },
  { rank:41, name:"Jenson Brooksby",              country: FLAGS.usa, atpCode:"b0cd", photo:"https://www.atptour.com/-/media/alias/player-headshot/b0cd", points:"" },
  { rank:42, name:"Sebastian Korda",              country: FLAGS.usa, atpCode:"k0ah", photo:"https://www.atptour.com/-/media/alias/player-headshot/k0ah", points:"" },
  { rank:43, name:"Adrian Mannarino",             country: FLAGS.fra, atpCode:"me82", photo:"https://www.atptour.com/-/media/alias/player-headshot/me82", points:"" },
  { rank:44, name:"Terence Atmane",               country: FLAGS.fra, atpCode:"a0gc", photo:"https://www.atptour.com/-/media/alias/player-headshot/a0gc", points:"" },
  { rank:45, name:"Alexei Popyrin",               country: FLAGS.aus, atpCode:"p09z", photo:"https://www.atptour.com/-/media/alias/player-headshot/p09z", points:"" },
  { rank:46, name:"Zizou Bergs",                  country: FLAGS.bel, atpCode:"bu13", photo:"https://www.atptour.com/-/media/alias/player-headshot/bu13", points:"" },
  { rank:47, name:"Fabian Marozsan",              country: FLAGS.hun, atpCode:"m0ci", photo:"https://www.atptour.com/-/media/alias/player-headshot/m0ci", points:"" },
  { rank:48, name:"Nuno Borges",                  country: FLAGS.por, atpCode:"bt72", photo:"https://www.atptour.com/-/media/alias/player-headshot/bt72", points:"" },
  { rank:49, name:"Stefanos Tsitsipas",           country: FLAGS.gre, atpCode:"te51", photo:"https://www.atptour.com/-/media/alias/player-headshot/te51", points:"" },
  { rank:50, name:"Sebastian Baez",               country: FLAGS.arg, atpCode:"b0bi", photo:"https://www.atptour.com/-/media/alias/player-headshot/b0bi", points:"" },
  { rank:51, name:"Marton Fucsovics",             country: FLAGS.hun, atpCode:"f724", photo:"https://www.atptour.com/-/media/alias/player-headshot/f724", points:"" },
  { rank:52, name:"Daniel Altmaier",              country: FLAGS.ger, atpCode:"ae14", photo:"https://www.atptour.com/-/media/alias/player-headshot/ae14", points:"" },
  { rank:53, name:"Kamil Majchrzak",              country: FLAGS.pol, atpCode:"mq75", photo:"https://www.atptour.com/-/media/alias/player-headshot/mq75", points:"" },
  { rank:54, name:"Marin Cilic",                  country: FLAGS.cro, atpCode:"c977", photo:"https://www.atptour.com/-/media/alias/player-headshot/c977", points:"" },
  { rank:55, name:"Tomas Machac",                 country: FLAGS.cze, atpCode:"m0fh", photo:"https://www.atptour.com/-/media/alias/player-headshot/m0fh", points:"" },
  { rank:56, name:"Ethan Quinn",                  country: FLAGS.usa, atpCode:"q02l", photo:"https://www.atptour.com/-/media/alias/player-headshot/q02l", points:"" },
  { rank:57, name:"G. Mpetshi-Perricard",         country: FLAGS.fra, atpCode:"m0gz", photo:"https://www.atptour.com/-/media/alias/player-headshot/m0gz", points:"" },
  { rank:58, name:"Miomir Kecmanovic",            country: FLAGS.srb, atpCode:"ki95", photo:"https://www.atptour.com/-/media/alias/player-headshot/ki95", points:"" },
  { rank:59, name:"Ignacio Buse",                 country: FLAGS.per, atpCode:"b0id", photo:"https://www.atptour.com/-/media/alias/player-headshot/b0id", points:"" },
  { rank:60, name:"Mariano Navone",               country: FLAGS.arg, atpCode:"n0bs", photo:"https://www.atptour.com/-/media/alias/player-headshot/n0bs", points:"" },
  { rank:61, name:"Yannick Hanfmann",             country: FLAGS.ger, atpCode:"h997", photo:"https://www.atptour.com/-/media/alias/player-headshot/h997", points:"" },
  { rank:62, name:"Botic van de Zandschulp",      country: FLAGS.ned, atpCode:"v812", photo:"https://www.atptour.com/-/media/alias/player-headshot/v812", points:"" },
  { rank:63, name:"Lorenzo Sonego",               country: FLAGS.ita, atpCode:"su87", photo:"https://www.atptour.com/-/media/alias/player-headshot/su87", points:"" },
  { rank:64, name:"Reilly Opelka",                country: FLAGS.usa, atpCode:"o522", photo:"https://www.atptour.com/-/media/alias/player-headshot/o522", points:"" },
  { rank:65, name:"Raphael Collignon",            country: FLAGS.bel, atpCode:"c0jp", photo:"https://www.atptour.com/-/media/alias/player-headshot/c0jp", points:"" },
  { rank:66, name:"Marcos Giron",                 country: FLAGS.usa, atpCode:"gc88", photo:"https://www.atptour.com/-/media/alias/player-headshot/gc88", points:"" },
  { rank:67, name:"Camilo Ugo Carabelli",         country: FLAGS.arg, atpCode:"u182", photo:"https://www.atptour.com/-/media/alias/player-headshot/u182", points:"" },
  { rank:68, name:"Arthur Cazaux",                country: FLAGS.fra, atpCode:"c0h0", photo:"https://www.atptour.com/-/media/alias/player-headshot/c0h0", points:"" },
  { rank:69, name:"J.M. Cerundolo",               country: FLAGS.arg, atpCode:"c0c8", photo:"https://www.atptour.com/-/media/alias/player-headshot/c0c8", points:"" },
  { rank:70, name:"Vit Kopriva",                  country: FLAGS.cze, atpCode:"ki82", photo:"https://www.atptour.com/-/media/alias/player-headshot/ki82", points:"" },
  { rank:71, name:"Valentin Royer",               country: FLAGS.fra, atpCode:"r0eb", photo:"https://www.atptour.com/-/media/alias/player-headshot/r0eb", points:"" },
  { rank:72, name:"Hubert Hurkacz",               country: FLAGS.pol, atpCode:"hb71", photo:"https://www.atptour.com/-/media/alias/player-headshot/hb71", points:"" },
  { rank:73, name:"Mattia Bellucci",              country: FLAGS.ita, atpCode:"b0gg", photo:"https://www.atptour.com/-/media/alias/player-headshot/b0gg", points:"" },
  { rank:74, name:"Damir Dzumhur",                country: FLAGS.bih, atpCode:"d923", photo:"https://www.atptour.com/-/media/alias/player-headshot/d923", points:"" },
  { rank:75, name:"Jan-Lennard Struff",           country: FLAGS.ger, atpCode:"sl28", photo:"https://www.atptour.com/-/media/alias/player-headshot/sl28", points:"" },
  { rank:76, name:"Alexander Shevchenko",         country: FLAGS.kaz, atpCode:"s0h2", photo:"https://www.atptour.com/-/media/alias/player-headshot/s0h2", points:"" },
  { rank:77, name:"R.A. Burruchaga",              country: FLAGS.arg, atpCode:"b0fv", photo:"https://www.atptour.com/-/media/alias/player-headshot/b0fv", points:"" },
  { rank:78, name:"Sebastian Ofner",              country: FLAGS.aut, atpCode:"o513", photo:"https://www.atptour.com/-/media/alias/player-headshot/o513", points:"" },
  { rank:79, name:"Eliot Spizzirri",              country: FLAGS.usa, atpCode:"s0ja", photo:"https://www.atptour.com/-/media/alias/player-headshot/s0ja", points:"" },
  { rank:80, name:"Roberto Bautista Agut",        country: FLAGS.esp, atpCode:"bd06", photo:"https://www.atptour.com/-/media/alias/player-headshot/bd06", points:"" },
  { rank:81, name:"Hamad Medjedovic",             country: FLAGS.srb, atpCode:"m0jf", photo:"https://www.atptour.com/-/media/alias/player-headshot/m0jf", points:"" },
  { rank:82, name:"Zachary Svajda",               country: FLAGS.usa, atpCode:"s0k7", photo:"https://www.atptour.com/-/media/alias/player-headshot/s0k7", points:"" },
  { rank:83, name:"T.A. Tirante",                 country: FLAGS.arg, atpCode:"t0a1", photo:"https://www.atptour.com/-/media/alias/player-headshot/t0a1", points:"" },
  { rank:84, name:"Aleksandar Vukic",             country: FLAGS.aus, atpCode:"v832", photo:"https://www.atptour.com/-/media/alias/player-headshot/v832", points:"" },
  { rank:85, name:"Aleksandar Kovacevic",         country: FLAGS.usa, atpCode:"k0az", photo:"https://www.atptour.com/-/media/alias/player-headshot/k0az", points:"" },
  { rank:86, name:"Filip Misolic",                country: FLAGS.aut, atpCode:"m0jz", photo:"https://www.atptour.com/-/media/alias/player-headshot/m0jz", points:"" },
  { rank:87, name:"Francisco Comesana",           country: FLAGS.arg, atpCode:"c0df", photo:"https://www.atptour.com/-/media/alias/player-headshot/c0df", points:"" },
  { rank:88, name:"Pablo Carreno Busta",          country: FLAGS.esp, atpCode:"cd85", photo:"https://www.atptour.com/-/media/alias/player-headshot/cd85", points:"" },
  { rank:89, name:"Rafael Jodar",                 country: FLAGS.esp, atpCode:"j0dz", photo:"https://www.atptour.com/-/media/alias/player-headshot/j0dz", points:"" },
  { rank:90, name:"Quentin Halys",                country: FLAGS.fra, atpCode:"hb64", photo:"https://www.atptour.com/-/media/alias/player-headshot/hb64", points:"" },
  { rank:91, name:"Matteo Berrettini",            country: FLAGS.ita, atpCode:"bk40", photo:"https://www.atptour.com/-/media/alias/player-headshot/bk40", points:"" },
  { rank:92, name:"Alexander Blockx",             country: FLAGS.bel, atpCode:"b0pg", photo:"https://www.atptour.com/-/media/alias/player-headshot/b0pg", points:"" },
  { rank:93, name:"Grigor Dimitrov",              country: FLAGS.bul, atpCode:"d875", photo:"https://www.atptour.com/-/media/alias/player-headshot/d875", points:"" },
  { rank:94, name:"Alexandre Muller",             country: FLAGS.fra, atpCode:"mp20", photo:"https://www.atptour.com/-/media/alias/player-headshot/mp20", points:"" },
  { rank:95, name:"James Duckworth",              country: FLAGS.aus, atpCode:"d994", photo:"https://www.atptour.com/-/media/alias/player-headshot/d994", points:"" },
  { rank:96, name:"Patrick Kypson",               country: FLAGS.usa, atpCode:"k0a3", photo:"https://www.atptour.com/-/media/alias/player-headshot/k0a3", points:"" },
  { rank:97, name:"Jacob Fearnley",               country: FLAGS.gbr, atpCode:"f0by", photo:"https://www.atptour.com/-/media/alias/player-headshot/f0by", points:"" },
  { rank:98, name:"Stan Wawrinka",                country: FLAGS.sui, atpCode:"w367", photo:"https://www.atptour.com/-/media/alias/player-headshot/w367", points:"" },
  { rank:99, name:"Jesper de Jong",               country: FLAGS.ned, atpCode:"d0c1", photo:"https://www.atptour.com/-/media/alias/player-headshot/d0c1", points:"" },
  { rank:100,name:"Cristian Garin",               country: FLAGS.chi, atpCode:"gd64", photo:"https://www.atptour.com/-/media/alias/player-headshot/gd64", points:"" },
];

import { runMigrations } from "../../../lib/db/schema";
import { getDb } from "../../../lib/db/client";

// Caché en memoria — 1 hora
let cache: { players: ATPPlayer[]; ts: number; source: string } | null = null;
const CACHE_MS = 60 * 60 * 1000;
// Rankings en DB considerados válidos si tienen < 8 días
const DB_MAX_AGE_S = 8 * 24 * 60 * 60;

function lastMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function parseRankings(html: string): ATPPlayer[] {
  const tokens = [...html.matchAll(/flag-([a-z]+)|\/en\/players\/[^/]+\/([a-z0-9]+)\/overview/g)];
  const players: ATPPlayer[] = [];
  let pendingFlag = "";

  for (const t of tokens) {
    if (t[1]) {
      pendingFlag = t[1];
    } else if (t[2]) {
      const atpCode = t[2];
      if (players.some((p) => p.atpCode === atpCode)) continue;
      const idx = t.index ?? 0;
      const before = html.slice(Math.max(0, idx - 300), idx + 300);
      const nameMatch = before.match(/class="lastName">([^<]+)<\/span>/);
      const nameMatch2 = before.match(/<span>([A-Z][a-z]+(?: [A-Z][a-z-]+)+)<\/span>/);
      const name = nameMatch?.[1]?.trim() ?? nameMatch2?.[1]?.trim() ?? atpCode;
      const rank = players.length + 1;
      if (rank > 100) break;
      players.push({
        rank,
        name,
        country: FLAGS[pendingFlag] ?? "🎾",
        atpCode,
        photo: `https://www.atptour.com/-/media/alias/player-headshot/${atpCode}`,
        points: "",
      });
      pendingFlag = "";
    }
  }
  return players;
}

/** Guarda rankings en DB (reemplaza todos los del timestamp actual) */
export function saveRankingsToDB(players: ATPPlayer[]): void {
  try {
    runMigrations();
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    // Borrar rankings con el mismo segundo (por si se llama dos veces) y los de hace > 30 días
    db.exec(`DELETE FROM atp_rankings WHERE updated_at <= ${now - 30 * 24 * 3600}`);
    const insert = db.prepare(
      `INSERT OR REPLACE INTO atp_rankings (rank, atp_code, name, country, points, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insertMany = db.transaction((rows: ATPPlayer[]) => {
      for (const p of rows) insert.run(p.rank, p.atpCode, p.name, p.country, p.points, now);
    });
    insertMany(players);
    console.log(`[rankings] ${players.length} rankings guardados en DB (ts=${now})`);
  } catch (e) {
    console.warn("[rankings] Error guardando en DB:", (e as Error).message);
  }
}

/** Lee los rankings más recientes de la DB */
export function loadRankingsFromDB(): { players: ATPPlayer[]; updatedAt: number } | null {
  try {
    runMigrations();
    const db = getDb();
    const latest = db.prepare(
      `SELECT MAX(updated_at) as ts FROM atp_rankings`
    ).get() as { ts: number | null };
    if (!latest?.ts) return null;

    const rows = db.prepare(
      `SELECT rank, atp_code, name, country, points FROM atp_rankings
       WHERE updated_at = ? ORDER BY rank ASC`
    ).all(latest.ts) as Array<{ rank: number; atp_code: string; name: string; country: string; points: string }>;

    if (rows.length < 20) return null;
    const players: ATPPlayer[] = rows.map((r) => ({
      rank: r.rank,
      name: r.name,
      country: r.country,
      atpCode: r.atp_code,
      photo: `https://www.atptour.com/-/media/alias/player-headshot/${r.atp_code}`,
      points: r.points ?? "",
    }));
    return { players, updatedAt: latest.ts };
  } catch {
    return null;
  }
}

export async function scrapeRankings(): Promise<ATPPlayer[] | null> {
  const rankDate = lastMonday();
  const url = `https://www.atptour.com/en/rankings/singles?rankDate=${rankDate}&rankRange=1-100`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.google.com/",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`ATP HTTP ${res.status}`);
  const html = await res.text();
  const players = parseRankings(html);
  if (players.length < 20) throw new Error(`Solo ${players.length} jugadores parseados`);
  return players;
}

export async function GET() {
  // 1. Caché en memoria
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return Response.json({ players: cache.players, source: cache.source, updatedAt: Math.floor(cache.ts / 1000) });
  }

  // 2. Intentar scraping en vivo
  try {
    const players = await scrapeRankings();
    if (players) {
      saveRankingsToDB(players);
      cache = { players, ts: Date.now(), source: "live" };
      return Response.json({ players, source: "live", updatedAt: Math.floor(Date.now() / 1000) });
    }
  } catch (err) {
    console.warn("[rankings] Scraping fallido:", (err as Error).message);
  }

  // 3. Rankings persistidos en DB
  const dbData = loadRankingsFromDB();
  if (dbData) {
    const ageS = Math.floor(Date.now() / 1000) - dbData.updatedAt;
    if (ageS < DB_MAX_AGE_S) {
      cache = { players: dbData.players, ts: Date.now(), source: "db" };
      return Response.json({ players: dbData.players, source: "db", updatedAt: dbData.updatedAt });
    }
  }

  // 4. Fallback estático
  console.warn("[rankings] Usando datos estáticos");
  cache = { players: STATIC_TOP100, ts: Date.now(), source: "static" };
  return Response.json({ players: STATIC_TOP100, source: "static", updatedAt: 0 });
}
