"use client";

export default function Home() {
  const matches = [
    {
      player1: "C. Alcaraz", player2: "J. Lehecka",
      tournament: "Mutua Madrid Open", round: "Cuartos de final",
      surface: "Arcilla", time: "21:00", court: "Pista Central",
      temp: "18°C", wind: "12 km/h", turn: "Noche",
      pct1: 68, pct2: 32, flag1: "🇪🇸", flag2: "🇨🇿",
      img1: "https://www.atptour.com/-/media/alias/player-headshot/A0E2",
      img2: "https://www.atptour.com/-/media/alias/player-headshot/L615",
      insights: ["Alcaraz +14% en arcilla nocturna", "Viento favorece al servidor más fuerte", "Lehecka pierde nivel en 3er set"],
      edge: "alta",
    },
    {
      player1: "N. Djokovic", player2: "S. Tsitsipas",
      tournament: "Mutua Madrid Open", round: "Cuartos de final",
      surface: "Arcilla", time: "19:00", court: "Manolo Santana",
      temp: "21°C", wind: "8 km/h", turn: "Tarde",
      pct1: 58, pct2: 42, flag1: "🇷🇸", flag2: "🇬🇷",
      img1: "https://www.atptour.com/-/media/alias/player-headshot/D643",
      img2: "https://www.atptour.com/-/media/alias/player-headshot/T989",
      insights: ["H2H 7-2 Djokovic en arcilla", "Tsitsipas sube nivel con público a favor", "Djokovic mejor en sesión tarde"],
      edge: "media",
    },
    {
      player1: "H. Hurkacz", player2: "A. Rublev",
      tournament: "Tiriac Open", round: "Semifinal",
      surface: "Arcilla", time: "17:00", court: "Central",
      temp: "16°C", wind: "20 km/h", turn: "Tarde",
      pct1: 52, pct2: 48, flag1: "🇵🇱", flag2: "🇷🇺",
      img1: "https://www.atptour.com/-/media/alias/player-headshot/H432",
      img2: "https://www.atptour.com/-/media/alias/player-headshot/R975",
      insights: ["Viento alto penaliza a ambos jugadores", "Rublev rinde mejor en frío", "Partido sin edge claro — datos igualados"],
      edge: "baja",
    },
    {
      player1: "T. Paul", player2: "B. Shelton",
      tournament: "Houston Clay Court", round: "Semifinal",
      surface: "Har-Tru", time: "22:00", court: "Center Court",
      temp: "24°C", wind: "6 km/h", turn: "Noche",
      pct1: 54, pct2: 46, flag1: "🇺🇸", flag2: "🇺🇸",
      img1: "https://www.atptour.com/-/media/alias/player-headshot/PA17",
      img2: "https://www.atptour.com/-/media/alias/player-headshot/SH32",
      insights: ["Shelton +18% con público americano", "Paul más consistente en Har-Tru", "Noche favorece el saque de Shelton"],
      edge: "media",
    },
  ];

  const heroPlayers = [
    { name: "Sinner", rank: 1, code: "S1AG", country: "🇮🇹" },
    { name: "Zverev", rank: 2, code: "Z355", country: "🇩🇪" },
    { name: "Alcaraz", rank: 3, code: "A0E2", country: "🇪🇸" },
    { name: "Fritz", rank: 4, code: "F401", country: "🇺🇸" },
    { name: "Medvedev", rank: 5, code: "MM58", country: "🇷🇺" },
  ];

  const players = [
    { name: "Jannik Sinner", rank: 1, country: "🇮🇹", surface: "Pista dura", winRate: 89, code: "S1AG" },
    { name: "Carlos Alcaraz", rank: 3, country: "🇪🇸", surface: "Arcilla", winRate: 87, code: "A0E2" },
    { name: "Alex Zverev", rank: 2, country: "🇩🇪", surface: "Arcilla", winRate: 85, code: "Z355" },
    { name: "Daniil Medvedev", rank: 5, country: "🇷🇺", surface: "Pista dura", winRate: 82, code: "MM58" },
    { name: "Taylor Fritz", rank: 4, country: "🇺🇸", surface: "Pista dura", winRate: 78, code: "F401" },
    { name: "N. Djokovic", rank: 7, country: "🇷🇸", surface: "Todas", winRate: 91, code: "D643" },
  ];

  const edgeColor: Record<string,string> = { alta:"#c8f135", media:"#f1a535", baja:"rgba(255,255,255,0.3)" };
  const edgeLabel: Record<string,string> = { alta:"Edge alto", media:"Edge medio", baja:"Sin edge claro" };

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
          --acid: #c8f135;
          --acid-dim: rgba(200,241,53,0.11);
          --bg: #080c10;
          --bg2: #0d1318;
          --bg3: #131a22;
          --border: rgba(255,255,255,0.07);
          --muted: rgba(255,255,255,0.38);
        }
        .fd { font-family:'Bebas Neue',cursive; }
        .fm { font-family:'Space Mono',monospace; }
        .fb { font-family:'DM Sans',sans-serif; }
        .glow { text-shadow:0 0 60px rgba(200,241,53,0.45); }
        .slabel { font-family:'Space Mono',monospace; font-size:10px; letter-spacing:0.25em; text-transform:uppercase; color:var(--acid); }
        .ticker-wrap { background:var(--acid); overflow:hidden; white-space:nowrap; }
        .ticker { display:inline-block; animation:tick 55s linear infinite; font-family:'Space Mono',monospace; font-size:11px; font-weight:700; letter-spacing:0.12em; color:#080c10; }
        @keyframes tick { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        nav { border-bottom:1px solid var(--border); background:rgba(8,12,16,0.95); backdrop-filter:blur(16px); position:sticky; top:0; z-index:50; }
        .nav-link { font-family:'Space Mono',monospace; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted); transition:color 0.2s; }
        .nav-link:hover { color:white; }
        .hero-player { position:relative; overflow:hidden; border-radius:12px; border:1px solid var(--border); cursor:pointer; transition:all 0.3s; flex:1; min-width:110px; max-width:175px; height:260px; }
        .hero-player:hover { border-color:rgba(200,241,53,0.4); transform:translateY(-4px); }
        .hero-player img { width:100%; height:100%; object-fit:cover; object-position:top; display:block; }
        .hero-player-overlay { position:absolute; inset:0; background:linear-gradient(to top,rgba(8,12,16,0.95) 0%,rgba(8,12,16,0.3) 50%,transparent 100%); }
        .hero-player-info { position:absolute; bottom:12px; left:12px; right:12px; }
        .match-card { background:var(--bg2); border:1px solid var(--border); border-radius:16px; transition:all 0.3s; overflow:hidden; cursor:pointer; }
        .match-card:hover { border-color:rgba(200,241,53,0.25); transform:translateY(-2px); box-shadow:0 8px 40px rgba(0,0,0,0.5); }
        .avatar { width:52px; height:52px; border-radius:50%; object-fit:cover; object-position:top; background:var(--bg3); border:2px solid var(--border); flex-shrink:0; }
        .bar-track { background:rgba(255,255,255,0.08); border-radius:999px; height:5px; overflow:hidden; }
        .bar-fill { height:100%; border-radius:999px; background:linear-gradient(90deg,var(--acid),#9ab82a); }
        .bar-dim { height:100%; border-radius:999px; background:rgba(255,255,255,0.18); }
        .tag { font-family:'Space Mono',monospace; font-size:10px; letter-spacing:0.1em; text-transform:uppercase; padding:3px 8px; border-radius:5px; background:var(--acid-dim); color:var(--acid); border:1px solid rgba(200,241,53,0.18); white-space:nowrap; }
        .tag-g { background:rgba(255,255,255,0.05); color:var(--muted); border-color:rgba(255,255,255,0.07); }
        .pct { font-family:'Bebas Neue',cursive; font-size:40px; line-height:1; }
        .insight-dot { width:5px; height:5px; border-radius:50%; background:var(--acid); flex-shrink:0; margin-top:5px; }
        .player-card { background:var(--bg2); border:1px solid var(--border); border-radius:14px; transition:all 0.3s; cursor:pointer; overflow:hidden; }
        .player-card:hover { border-color:rgba(200,241,53,0.2); background:var(--bg3); transform:translateY(-2px); }
        .noise { background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E"); pointer-events:none; position:fixed; inset:0; z-index:999; }
      `}</style>

      <div className="noise" />

      {/* Ticker */}
      <div className="ticker-wrap py-1.5">
        <span className="ticker">
          {Array(3).fill(tickerItems.map(t=>`· ${t}`).join("    ")+"    ").join("")}
        </span>
      </div>

      {/* Nav */}
      <nav>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="fd text-2xl tracking-wider glow" style={{color:"var(--acid)"}}>ALLDATA</span>
            <span className="fd text-2xl tracking-wider">TENNIS</span>
          </div>
          <div className="hidden md:flex gap-8">
            {["Partidos","Jugadores","Torneos","Análisis"].map(l=>(
              <a key={l} href="#" className="nav-link">{l}</a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{background:"var(--acid)"}} />
            <span className="fm text-xs" style={{color:"var(--acid)"}}>LIVE</span>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-14 pb-12" style={{background:"linear-gradient(180deg,#0a0f14 0%,#080c10 100%)"}}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-12 items-center">
            <div className="flex-1">
              <div className="slabel mb-5">Análisis automático · ATP Tour</div>
              <h1 className="fd leading-[0.92] mb-6 text-white" style={{fontSize:"clamp(56px,8vw,92px)"}}>
                TODOS LOS<br />
                PARTIDOS ATP.<br />
                <span style={{color:"var(--acid)"}} className="glow">ANALIZADOS.</span>
              </h1>
              <p className="fb text-base leading-relaxed" style={{color:"var(--muted)",maxWidth:"400px"}}>
                Patrones de jugadores, condiciones climáticas, superficie, turno y psicología — cruzados automáticamente para cada partido del día.
              </p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              {heroPlayers.map((p,i)=>(
                <div key={i} className="hero-player" style={{
                  opacity: i===2 ? 1 : i===1||i===3 ? 0.85 : 0.65,
                  transform: i===2 ? "scale(1.05)" : "scale(1)",
                  zIndex: i===2 ? 2 : 1,
                }}>
                  <img
                    src={`https://www.atptour.com/-/media/alias/player-headshot/${p.code}`}
                    alt={p.name}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = "https://images.unsplash.com/photo-1545809074-59472b3f5ecc?w=300&q=70";
                    }}
                  />
                  <div className="hero-player-overlay" />
                  <div className="hero-player-info">
                    <div className="fm text-xs mb-0.5" style={{color:"var(--acid)"}}>#{p.rank}</div>
                    <div className="fd text-xl tracking-wide">{p.name}</div>
                    <div className="text-sm">{p.country}</div>
                  </div>
                </div>
              ))}
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
                {new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
              </div>
              <h2 className="fd text-4xl tracking-wide">ANÁLISIS DE HOY</h2>
            </div>
            <div className="flex items-center gap-2 fm text-xs" style={{color:"var(--muted)"}}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:"var(--acid)"}} />
              Actualizado automáticamente
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {matches.map((m,i)=>(
              <div key={i} className="match-card">
                <div className="flex flex-wrap">
                  <div className="flex-1 p-6 min-w-[280px]">
                    <div className="flex items-center gap-2 mb-5">
                      <span className="tag">{m.surface}</span>
                      <span className="tag tag-g">{m.tournament}</span>
                      <span className="tag tag-g">{m.round}</span>
                      <span className="ml-auto fm text-xs" style={{color:"var(--muted)"}}>{m.time} · {m.turn}</span>
                    </div>
                    <div className="flex items-center gap-4 mb-3">
                      <img src={m.img1} alt={m.player1} className="avatar"
                        onError={(e) => { const t = e.target as HTMLImageElement; t.src="https://images.unsplash.com/photo-1545809074-59472b3f5ecc?w=100&q=60"; }} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span>{m.flag1}</span>
                          <span className="fb font-semibold text-lg">{m.player1}</span>
                        </div>
                        <div className="bar-track"><div className="bar-fill" style={{width:`${m.pct1}%`}} /></div>
                      </div>
                      <span className="pct" style={{color:"var(--acid)"}}>{m.pct1}%</span>
                    </div>
                    <div className="flex items-center gap-3 mb-3 pl-[68px]">
                      <div className="h-px flex-1" style={{background:"var(--border)"}} />
                      <span className="fm text-xs" style={{color:"var(--muted)"}}>VS</span>
                      <div className="h-px flex-1" style={{background:"var(--border)"}} />
                    </div>
                    <div className="flex items-center gap-4">
                      <img src={m.img2} alt={m.player2} className="avatar" style={{opacity:0.6}}
                        onError={(e) => { const t = e.target as HTMLImageElement; t.src="https://images.unsplash.com/photo-1545809074-59472b3f5ecc?w=100&q=60"; }} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span>{m.flag2}</span>
                          <span className="fb text-lg" style={{color:"rgba(255,255,255,0.55)"}}>{m.player2}</span>
                        </div>
                        <div className="bar-track"><div className="bar-dim" style={{width:`${m.pct2}%`}} /></div>
                      </div>
                      <span className="pct" style={{color:"rgba(255,255,255,0.28)"}}>{m.pct2}%</span>
                    </div>
                  </div>

                  <div className="p-6 flex flex-col gap-4 border-l min-w-[230px]"
                    style={{borderColor:"var(--border)",background:"rgba(255,255,255,0.015)"}}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{background:edgeColor[m.edge]}} />
                      <span className="fm text-xs uppercase tracking-widest" style={{color:edgeColor[m.edge]}}>{edgeLabel[m.edge]}</span>
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
                        {m.insights.map((ins,j)=>(
                          <div key={j} className="flex items-start gap-2">
                            <div className="insight-dot" />
                            <span className="fb text-xs leading-snug" style={{color:"rgba(255,255,255,0.6)"}}>{ins}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button className="fm text-xs uppercase tracking-widest w-full py-2.5 rounded-lg text-center transition-all hover:opacity-80 mt-auto"
                      style={{background:"var(--acid-dim)",color:"var(--acid)",border:"1px solid rgba(200,241,53,0.2)"}}>
                      Análisis completo →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Jugadores */}
      <section className="px-6 pb-16 border-t" style={{borderColor:"var(--border)"}}>
        <div className="max-w-6xl mx-auto pt-12">
          <div className="flex items-end justify-between mb-7">
            <div>
              <div className="slabel mb-1.5">Base de datos · ATP</div>
              <h2 className="fd text-4xl tracking-wide">JUGADORES</h2>
            </div>
            <a href="#" className="fm text-xs uppercase tracking-widest" style={{color:"var(--acid)"}}>Ver todos →</a>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {players.map((p,i)=>(
              <div key={i} className="player-card">
                <div className="relative">
                  <img
                    src={`https://www.atptour.com/-/media/alias/player-headshot/${p.code}`}
                    alt={p.name}
                    className="w-full h-32 object-cover object-top"
                    style={{background:"var(--bg3)"}}
                    onError={(e) => { const t = e.target as HTMLImageElement; t.src="https://images.unsplash.com/photo-1545809074-59472b3f5ecc?w=200&q=60"; }}
                  />
                  <div className="absolute top-2 right-2">
                    <span className="fm text-xs px-1.5 py-0.5 rounded font-bold"
                      style={{background:"rgba(8,12,16,0.85)",color:"var(--acid)"}}>#{p.rank}</span>
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm">{p.country}</span>
                    <span className="fb font-semibold" style={{fontSize:"0.8rem"}}>{p.name}</span>
                  </div>
                  <div className="fm text-[10px] mb-2" style={{color:"var(--muted)"}}>{p.surface}</div>
                  <div className="bar-track mb-1"><div className="bar-fill" style={{width:`${p.winRate}%`}} /></div>
                  <div className="fm text-[10px]" style={{color:"var(--acid)"}}>{p.winRate}% win rate</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="px-6 pb-16 border-t" style={{borderColor:"var(--border)"}}>
        <div className="max-w-6xl mx-auto pt-12">
          <div className="slabel mb-2">Metodología</div>
          <h2 className="fd text-4xl tracking-wide mb-8">CÓMO FUNCIONA</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { n:"01", title:"Detección automática", desc:"Cada mañana el sistema detecta todos los partidos ATP programados del día en cualquier torneo activo." },
              { n:"02", title:"Cruce de patrones", desc:"Cruza los patrones de cada jugador — superficie, turno, clima, H2H, forma reciente y psicología — con las condiciones reales del partido." },
              { n:"03", title:"Porcentaje de victoria", desc:"Genera un porcentaje de victoria basado en datos objetivos. Se actualiza si cambian las condiciones antes del partido." },
            ].map((s,i)=>(
              <div key={i} className="rounded-xl p-6" style={{background:"var(--bg2)",border:"1px solid var(--border)"}}>
                <div className="fd text-5xl mb-3" style={{color:"var(--acid)",opacity:0.25}}>{s.n}</div>
                <div className="fb font-semibold text-base mb-2">{s.title}</div>
                <div className="fb text-sm leading-relaxed" style={{color:"var(--muted)"}}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-8" style={{borderColor:"var(--border)"}}>
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="fd text-xl" style={{color:"var(--acid)"}}>ALLDATA</span>
            <span className="fd text-xl">TENNIS</span>
          </div>
          <div className="fm text-xs" style={{color:"var(--muted)"}}>© 2026 · AI-powered tennis analytics</div>
        </div>
      </footer>
    </main>
  );
}
