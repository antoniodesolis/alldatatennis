"use client";
import { useRef, useEffect, useState } from "react";
import type { ATPPlayer } from "./api/rankings/route";

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='170' viewBox='0 0 140 170'%3E%3Crect width='140' height='170' fill='%230d1318'/%3E%3Ccircle cx='70' cy='60' r='28' fill='%23131a22'/%3E%3Cellipse cx='70' cy='130' rx='40' ry='25' fill='%23131a22'/%3E%3C/svg%3E";

// Datos para las tarjetas de partido (código de jugador → atpCode)
// Códigos ATP reales (obtenidos de atptour.com/en/rankings/singles 31-03-2026)
const ATP_CODES: Record<string, string> = {
  "carlos-alcaraz":    "a0e2",
  "novak-djokovic":    "d643",
  "stefanos-tsitsipas":"te51",
  "hubert-hurkacz":    "hb71",
  "andrey-rublev":     "re44",
  "tommy-paul":        "pl56",
  "ben-shelton":       "s0s1",
};
function getPlayerImg(code: string) {
  const c = ATP_CODES[code];
  return c ? `/api/photo/${c}` : PLACEHOLDER;
}

export default function Home() {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [players, setPlayers] = useState<ATPPlayer[]>([]);
  const [rankSource, setRankSource] = useState<"live" | "static" | "">("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rankings")
      .then((r) => r.json())
      .then((data) => {
        setPlayers(data.players ?? []);
        setRankSource(data.source ?? "static");
      })
      .catch(() => setPlayers([]))
      .finally(() => setLoading(false));
  }, []);

  const scroll = (dir: "left" | "right") => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollBy({ left: dir === "left" ? -400 : 400, behavior: "smooth" });
  };

  const matches = [
    {
      player1: "C. Alcaraz", player2: "J. Lehecka",
      tournament: "Mutua Madrid Open", round: "Cuartos de final",
      surface: "Arcilla", time: "21:00", court: "Pista Central",
      temp: "18°C", wind: "12 km/h", turn: "Noche",
      pct1: 68, pct2: 32, flag1: "🇪🇸", flag2: "🇨🇿",
      img1: getPlayerImg("carlos-alcaraz"),
      img2: PLACEHOLDER,
      insights: ["Alcaraz +14% en arcilla nocturna", "Viento favorece al servidor más fuerte", "Lehecka pierde nivel en 3er set"],
      edge: "alta",
    },
    {
      player1: "N. Djokovic", player2: "S. Tsitsipas",
      tournament: "Mutua Madrid Open", round: "Cuartos de final",
      surface: "Arcilla", time: "19:00", court: "Manolo Santana",
      temp: "21°C", wind: "8 km/h", turn: "Tarde",
      pct1: 58, pct2: 42, flag1: "🇷🇸", flag2: "🇬🇷",
      img1: getPlayerImg("novak-djokovic"),
      img2: getPlayerImg("stefanos-tsitsipas"),
      insights: ["H2H 7-2 Djokovic en arcilla", "Tsitsipas sube nivel con público a favor", "Djokovic mejor en sesión tarde"],
      edge: "media",
    },
    {
      player1: "H. Hurkacz", player2: "A. Rublev",
      tournament: "Tiriac Open", round: "Semifinal",
      surface: "Arcilla", time: "17:00", court: "Central",
      temp: "16°C", wind: "20 km/h", turn: "Tarde",
      pct1: 52, pct2: 48, flag1: "🇵🇱", flag2: "🇷🇺",
      img1: getPlayerImg("hubert-hurkacz"),
      img2: getPlayerImg("andrey-rublev"),
      insights: ["Viento alto penaliza a ambos jugadores", "Rublev rinde mejor en frío", "Partido sin edge claro — datos igualados"],
      edge: "baja",
    },
    {
      player1: "T. Paul", player2: "B. Shelton",
      tournament: "Houston Clay Court", round: "Semifinal",
      surface: "Har-Tru", time: "22:00", court: "Center Court",
      temp: "24°C", wind: "6 km/h", turn: "Noche",
      pct1: 54, pct2: 46, flag1: "🇺🇸", flag2: "🇺🇸",
      img1: getPlayerImg("tommy-paul"),
      img2: getPlayerImg("ben-shelton"),
      insights: ["Shelton +18% con público americano", "Paul más consistente en Har-Tru", "Noche favorece el saque de Shelton"],
      edge: "media",
    },
  ];

  const edgeColor: Record<string, string> = { alta: "#c8f135", media: "#f1a535", baja: "rgba(255,255,255,0.3)" };
  const edgeLabel: Record<string, string> = { alta: "Edge alto", media: "Edge medio", baja: "Sin edge claro" };

  const tickerItems = [
    "Mutua Madrid Open: Alcaraz vs Lehecka",
    "Mutua Madrid Open: Djokovic vs Tsitsipas",
    "Tiriac Open: Hurkacz vs Rublev",
    "Houston Clay Court: Paul vs Shelton",
    "Mutua Madrid Open: Zverev vs Fritz",
    "Tiriac Open: Baez vs Borges",
  ];

  return (
    <main className="min-h-screen bg-[#080c10] text-white overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');
        :root {
          --acid: #c8f135; --acid-dim: rgba(200,241,53,0.11);
          --bg: #080c10; --bg2: #0d1318; --bg3: #131a22;
          --border: rgba(255,255,255,0.07); --muted: rgba(255,255,255,0.38);
        }
        .fd{font-family:'Bebas Neue',cursive;} .fm{font-family:'Space Mono',monospace;} .fb{font-family:'DM Sans',sans-serif;}
        .glow{text-shadow:0 0 60px rgba(200,241,53,0.45);}
        .slabel{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;color:var(--acid);}
        .ticker-wrap{background:var(--acid);overflow:hidden;white-space:nowrap;}
        .ticker{display:inline-block;animation:tick 55s linear infinite;font-family:'Space Mono',monospace;font-size:11px;font-weight:700;letter-spacing:0.12em;color:#080c10;}
        @keyframes tick{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        nav{border-bottom:1px solid var(--border);background:rgba(8,12,16,0.95);backdrop-filter:blur(16px);position:sticky;top:0;z-index:50;}
        .nav-link{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);transition:color 0.2s;}
        .nav-link:hover{color:white;}

        /* Carousel */
        .carousel{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding-bottom:8px;cursor:grab;}
        .carousel:active{cursor:grabbing;}
        .carousel::-webkit-scrollbar{display:none;}
        .p-card{flex-shrink:0;width:140px;scroll-snap-align:start;background:var(--bg2);border:1px solid var(--border);border-radius:14px;overflow:hidden;transition:all 0.3s;cursor:pointer;}
        .p-card:hover{border-color:rgba(200,241,53,0.3);transform:translateY(-3px);}
        .p-card img{width:100%;height:170px;object-fit:cover;object-position:top center;display:block;background:var(--bg3);}
        .p-card-skeleton{flex-shrink:0;width:140px;height:250px;border-radius:14px;background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .scroll-btn{width:36px;height:36px;border-radius:50%;background:var(--bg2);border:1px solid var(--border);color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;flex-shrink:0;}
        .scroll-btn:hover{border-color:var(--acid);color:var(--acid);}

        .match-card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;transition:all 0.3s;overflow:hidden;cursor:pointer;}
        .match-card:hover{border-color:rgba(200,241,53,0.25);transform:translateY(-2px);box-shadow:0 8px 40px rgba(0,0,0,0.5);}
        .avatar{width:52px;height:52px;border-radius:50%;object-fit:cover;object-position:top;background:var(--bg3);border:2px solid var(--border);flex-shrink:0;}
        .bar-track{background:rgba(255,255,255,0.08);border-radius:999px;height:5px;overflow:hidden;}
        .bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--acid),#9ab82a);}
        .bar-dim{height:100%;border-radius:999px;background:rgba(255,255,255,0.18);}
        .tag{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;padding:3px 8px;border-radius:5px;background:var(--acid-dim);color:var(--acid);border:1px solid rgba(200,241,53,0.18);white-space:nowrap;}
        .tag-g{background:rgba(255,255,255,0.05);color:var(--muted);border-color:rgba(255,255,255,0.07);}
        .pct{font-family:'Bebas Neue',cursive;font-size:40px;line-height:1;}
        .insight-dot{width:5px;height:5px;border-radius:50%;background:var(--acid);flex-shrink:0;margin-top:5px;}
        .noise{background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");pointer-events:none;position:fixed;inset:0;z-index:999;}
      `}</style>

      <div className="noise" />

      {/* Ticker */}
      <div className="ticker-wrap py-1.5">
        <span className="ticker">
          {Array(3).fill(tickerItems.map((t) => `· ${t}`).join("    ") + "    ").join("")}
        </span>
      </div>

      {/* Nav */}
      <nav>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="fd text-2xl tracking-wider glow" style={{ color: "var(--acid)" }}>ALLDATA</span>
            <span className="fd text-2xl tracking-wider">TENNIS</span>
          </div>
          <div className="hidden md:flex gap-8">
            {["Partidos", "Jugadores", "Torneos", "Análisis"].map((l) => (
              <a key={l} href="#" className="nav-link">{l}</a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--acid)" }} />
            <span className="fm text-xs" style={{ color: "var(--acid)" }}>LIVE</span>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-14 pb-10" style={{ background: "linear-gradient(180deg,#0a0f14 0%,#080c10 100%)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="slabel mb-4">Análisis automático · ATP Tour</div>
          <h1 className="fd leading-[0.92] mb-4 text-white" style={{ fontSize: "clamp(52px,7vw,88px)" }}>
            TODOS LOS PARTIDOS ATP.<br />
            <span style={{ color: "var(--acid)" }} className="glow">ANALIZADOS.</span>
          </h1>
          <p className="fb text-base leading-relaxed mb-10" style={{ color: "var(--muted)", maxWidth: "500px" }}>
            Patrones de jugadores, condiciones climáticas, superficie, turno y psicología — cruzados automáticamente para cada partido del día.
          </p>

          {/* Ranking carousel */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="slabel">Ranking ATP</div>
                {!loading && (
                  <span className="fm" style={{ fontSize: "9px", color: "var(--muted)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                    {rankSource === "live" ? (
                      <><span style={{ color: "var(--acid)" }}>●</span> En vivo · {players.length} jugadores</>
                    ) : (
                      <>● Top {players.length} · datos oficiales</>
                    )}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button className="scroll-btn" onClick={() => scroll("left")}>←</button>
                <button className="scroll-btn" onClick={() => scroll("right")}>→</button>
              </div>
            </div>

            <div className="carousel" ref={carouselRef}>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="p-card-skeleton" />
                ))
              ) : players.length === 0 ? (
                <div className="fm text-xs" style={{ color: "var(--muted)" }}>No se pudieron cargar los rankings.</div>
              ) : (
                players.map((p) => (
                  <div key={p.rank} className="p-card">
                    <img
                      src={p.photo}
                      alt={p.name}
                      onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
                    />
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="fd text-2xl" style={{ color: "var(--acid)" }}>#{p.rank}</span>
                        <span className="text-base">{p.country}</span>
                      </div>
                      <div className="fb font-semibold text-sm leading-tight mb-1">{p.name}</div>
                      {p.points && (
                        <div className="fm text-[10px]" style={{ color: "var(--muted)" }}>{p.points} pts</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Partidos */}
      <section className="px-6 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="slabel mb-1.5">
                {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </div>
              <h2 className="fd text-4xl tracking-wide">ANÁLISIS DE HOY</h2>
            </div>
            <div className="flex items-center gap-2 fm text-xs" style={{ color: "var(--muted)" }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--acid)" }} />
              Actualizado automáticamente
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {matches.map((m, i) => (
              <div key={i} className="match-card">
                <div className="flex flex-wrap">
                  <div className="flex-1 p-6 min-w-[280px]">
                    <div className="flex items-center gap-2 mb-5">
                      <span className="tag">{m.surface}</span>
                      <span className="tag tag-g">{m.tournament}</span>
                      <span className="tag tag-g">{m.round}</span>
                      <span className="ml-auto fm text-xs" style={{ color: "var(--muted)" }}>{m.time} · {m.turn}</span>
                    </div>
                    <div className="flex items-center gap-4 mb-3">
                      <img src={m.img1} alt={m.player1} className="avatar"
                        onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span>{m.flag1}</span>
                          <span className="fb font-semibold text-lg">{m.player1}</span>
                        </div>
                        <div className="bar-track"><div className="bar-fill" style={{ width: `${m.pct1}%` }} /></div>
                      </div>
                      <span className="pct" style={{ color: "var(--acid)" }}>{m.pct1}%</span>
                    </div>
                    <div className="flex items-center gap-3 mb-3 pl-[68px]">
                      <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                      <span className="fm text-xs" style={{ color: "var(--muted)" }}>VS</span>
                      <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                    </div>
                    <div className="flex items-center gap-4">
                      <img src={m.img2} alt={m.player2} className="avatar" style={{ opacity: 0.6 }}
                        onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span>{m.flag2}</span>
                          <span className="fb text-lg" style={{ color: "rgba(255,255,255,0.55)" }}>{m.player2}</span>
                        </div>
                        <div className="bar-track"><div className="bar-dim" style={{ width: `${m.pct2}%` }} /></div>
                      </div>
                      <span className="pct" style={{ color: "rgba(255,255,255,0.28)" }}>{m.pct2}%</span>
                    </div>
                  </div>
                  <div className="p-6 flex flex-col gap-4 border-l min-w-[230px]"
                    style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.015)" }}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: edgeColor[m.edge] }} />
                      <span className="fm text-xs uppercase tracking-widest" style={{ color: edgeColor[m.edge] }}>{edgeLabel[m.edge]}</span>
                    </div>
                    <div>
                      <div className="slabel mb-2">Condiciones</div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="tag tag-g">{m.temp}</span>
                        <span className="tag tag-g">💨 {m.wind}</span>
                        <span className="tag tag-g">{m.court}</span>
                      </div>
                    </div>
                    <div>
                      <div className="slabel mb-2">Patrones detectados</div>
                      <div className="flex flex-col gap-2">
                        {m.insights.map((ins, j) => (
                          <div key={j} className="flex items-start gap-2">
                            <div className="insight-dot" />
                            <span className="fb text-xs leading-snug" style={{ color: "rgba(255,255,255,0.6)" }}>{ins}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button className="fm text-xs uppercase tracking-widest w-full py-2.5 rounded-lg text-center transition-all hover:opacity-80 mt-auto"
                      style={{ background: "var(--acid-dim)", color: "var(--acid)", border: "1px solid rgba(200,241,53,0.2)" }}>
                      Análisis completo →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="px-6 pb-16 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto pt-12">
          <div className="slabel mb-2">Metodología</div>
          <h2 className="fd text-4xl tracking-wide mb-8">CÓMO FUNCIONA</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { n: "01", title: "Detección automática", desc: "Cada mañana el sistema detecta todos los partidos ATP programados del día en cualquier torneo activo." },
              { n: "02", title: "Cruce de patrones", desc: "Cruza los patrones de cada jugador — superficie, turno, clima, H2H, forma reciente y psicología — con las condiciones reales del partido." },
              { n: "03", title: "Porcentaje de victoria", desc: "Genera un porcentaje de victoria basado en datos objetivos. Se actualiza si cambian las condiciones antes del partido." },
            ].map((s, i) => (
              <div key={i} className="rounded-xl p-6" style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}>
                <div className="fd text-5xl mb-3" style={{ color: "var(--acid)", opacity: 0.25 }}>{s.n}</div>
                <div className="fb font-semibold text-base mb-2">{s.title}</div>
                <div className="fb text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-8" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="fd text-xl" style={{ color: "var(--acid)" }}>ALLDATA</span>
            <span className="fd text-xl">TENNIS</span>
          </div>
          <div className="fm text-xs" style={{ color: "var(--muted)" }}>© 2026 · AI-powered tennis analytics</div>
        </div>
      </footer>
    </main>
  );
}
