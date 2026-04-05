"use client";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type { ATPPlayer } from "./api/rankings/route";
import type { ATPMatch } from "./api/matches/route";
import type { PredictionResult, FactorResult } from "../lib/prediction/engine";

// Torneos ATP principales (excluir challengers, UTR, futures)
function isMainATP(tournament: string) {
  const lower = tournament.toLowerCase();
  return !lower.includes("challenger") && !lower.includes("chall.") && !lower.includes("chall ")
    && !lower.includes("utr") && !lower.includes("itf") && !lower.includes("futures")
    && !lower.includes("miyazaki") && !lower.includes("barletta") && !lower.includes("menorca")
    && !lower.includes("sao leopoldo") && !lower.includes("san luis") && !lower.includes("pro tennis series");
}

const SURFACE_ES: Record<string, string> = {
  clay: "Tierra", hard: "Pista dura", grass: "Hierba",
  "indoor hard": "Indoor", carpet: "Moqueta", "": "—",
};
const SURFACE_COLOR: Record<string, string> = {
  clay: "#c97d47", hard: "#4a90d9", grass: "#5cb85c",
  "indoor hard": "#8e44ad", carpet: "#7f8c8d",
};

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='170' viewBox='0 0 140 170'%3E%3Crect width='140' height='170' fill='%230d1318'/%3E%3Ccircle cx='70' cy='60' r='28' fill='%23131a22'/%3E%3Cellipse cx='70' cy='130' rx='40' ry='25' fill='%23131a22'/%3E%3C/svg%3E";

// Genera SVG con iniciales como placeholder
function initialsPlaceholder(name: string): string {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='52' height='52' viewBox='0 0 52 52'><rect width='52' height='52' rx='26' fill='%23131a22'/><text x='26' y='33' text-anchor='middle' font-family='sans-serif' font-size='16' font-weight='600' fill='%23c8f135'>${initials}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

// Extrae apellido de "Alcaraz C." o "Carlos Alcaraz"
/** Calcula el resultado de la predicción para un partido finalizado */
function predictionOutcome(
  m: ATPMatch,
  pred: PredictionResult,
): "correct" | "wrong" | "close" | null {
  if (!m.winner || m.status !== "finished") return null;
  const p1Pct = pred.player1.winPct;
  const p2Pct = pred.player2.winPct;
  const maxPct = Math.max(p1Pct, p2Pct);
  // Margen ≤54%: demasiado igualado para juzgar
  if (maxPct <= 54) return "close";
  const predictedWinner = p1Pct >= p2Pct ? "player1" : "player2";
  return predictedWinner === m.winner ? "correct" : "wrong";
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  // Si el último token es una inicial (1-2 chars con punto), el apellido es el primero
  const last = parts[parts.length - 1];
  if (/^[A-Z]\.?$/.test(last)) return parts[0].toLowerCase();
  return last.toLowerCase();
}

// Componente que resuelve y muestra la foto de un jugador
function PlayerPhoto({
  name, slug, rankingMap, size = 52, style,
}: {
  name: string;
  slug: string;
  rankingMap: Map<string, string>; // lastName → photo URL
  size?: number;
  style?: React.CSSProperties;
}) {
  const [src, setSrc] = useState<string>(() => {
    const photo = rankingMap.get(lastName(name));
    return photo ?? "";
  });
  const [tried, setTried] = useState(false);

  // Si no está en rankings, pedir al API
  useEffect(() => {
    if (src || tried) return;
    setTried(true);
    fetch(`/api/player-photo/${encodeURIComponent(slug)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.photo) setSrc(d.photo); })
      .catch(() => {});
  }, [src, tried, slug]);

  const fallback = initialsPlaceholder(name);
  const imgSrc = src || fallback;

  return (
    <img
      src={imgSrc}
      alt={name}
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      style={{ borderRadius: "50%", objectFit: "cover", objectPosition: "top", background: "#131a22", flexShrink: 0, ...style }}
      onError={(e) => { (e.target as HTMLImageElement).src = fallback; }}
    />
  );
}

// Infiere nivel del torneo a partir del nombre
function inferTourneyLevel(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("australian open") || lower.includes("roland garros") || lower.includes("wimbledon") || lower.includes("us open")) return "grand-slam";
  if (lower.includes("masters 1000") || lower.includes("indian wells") || lower.includes("miami") || lower.includes("monte carlo") || lower.includes("madrid") || lower.includes("rome") || lower.includes("canada") || lower.includes("cincinnati") || lower.includes("shanghai") || lower.includes("paris masters")) return "masters-1000";
  if (lower.includes("500") || lower.includes("dubai") || lower.includes("acapulco") || lower.includes("rotterdam") || lower.includes("barcelona") || lower.includes("hamburg") || lower.includes("washington") || lower.includes("vienna") || lower.includes("beijing") || lower.includes("tokyo")) return "atp-500";
  if (lower.includes("finals") || lower.includes("nitto")) return "atp-finals";
  return "atp-250";
}

export default function Home() {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [players, setPlayers] = useState<ATPPlayer[]>([]);
  const [rankSource, setRankSource] = useState<"live" | "static" | "">("");
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<ATPMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  // Map: lastName(lower) → photo URL — construido desde el ranking top 100
  const [rankingMap, setRankingMap] = useState<Map<string, string>>(new Map());
  // Map: lastName(lower) → rank number
  const [rankNumMap, setRankNumMap] = useState<Map<string, number>>(new Map());

  // Calendario de días
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
  }, []);

  // Predicción
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<Record<string, PredictionResult>>({});
  const [loadingPred, setLoadingPred] = useState<Record<string, boolean>>({});

  const fetchPrediction = useCallback(async (m: ATPMatch) => {
    if (predictions[m.id] || loadingPred[m.id]) return;
    setLoadingPred((prev) => ({ ...prev, [m.id]: true }));
    try {
      const res = await fetch("/api/prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: m.id,
          player1: m.player1Slug,
          player2: m.player2Slug,
          player1Name: m.player1,
          player2Name: m.player2,
          tournament: m.tournament,
          tourneyLevel: inferTourneyLevel(m.tournament),
          surface: m.surface ?? "hard",
          round: m.round || undefined,
          timeOfDay: undefined,
          date: selectedDate,
        }),
      });
      if (res.ok) {
        const data = await res.json() as PredictionResult;
        setPredictions((prev) => ({ ...prev, [m.id]: data }));
      } else {
        const errData = await res.json().catch(() => ({})) as { detail?: string };
        console.error("[prediction] API error:", res.status, errData.detail ?? "");
      }
    } catch (e) {
      console.error("[prediction] fetch error:", e);
    } finally {
      setLoadingPred((prev) => ({ ...prev, [m.id]: false }));
    }
  }, [predictions, loadingPred, selectedDate]);

  const handleMatchClick = useCallback((m: ATPMatch) => {
    const isExpanding = expandedMatch !== m.id;
    setExpandedMatch(isExpanding ? m.id : null);
    if (isExpanding) fetchPrediction(m);
  }, [expandedMatch, fetchPrediction]);

  const buildRankingMap = useCallback((ps: ATPPlayer[]) => {
    const m = new Map<string, string>();
    const rn = new Map<string, number>();
    // Count players per last name to detect siblings (e.g. Cerundolo × 2)
    const lastCount = new Map<string, number>();
    for (const p of ps) {
      const last = p.name.trim().split(/\s+/).pop()!.toLowerCase();
      lastCount.set(last, (lastCount.get(last) ?? 0) + 1);
    }
    for (const p of ps) {
      const parts = p.name.trim().split(/\s+/);
      const last = parts[parts.length - 1].toLowerCase();
      // Skip ambiguous last names — slug-based API handles them correctly
      if ((lastCount.get(last) ?? 0) > 1) continue;
      m.set(last, p.photo);
      rn.set(last, p.rank);
    }
    setRankingMap(m);
    setRankNumMap(rn);
  }, []);

  // Cargar rankings una sola vez
  useEffect(() => {
    fetch("/api/rankings")
      .then((r) => r.json())
      .then((data) => {
        const ps: ATPPlayer[] = data.players ?? [];
        setPlayers(ps);
        setRankSource(data.source ?? "static");
        buildRankingMap(ps);
      })
      .catch(() => setPlayers([]))
      .finally(() => setLoading(false));
  }, [buildRankingMap]);

  // Recargar partidos cuando cambia la fecha seleccionada
  useEffect(() => {
    setMatchesLoading(true);
    setMatches([]);
    setPredictions({});
    setExpandedMatch(null);
    const dateQ = selectedDate !== todayStr ? `?date=${selectedDate}` : "";
    fetch(`/api/matches${dateQ}`)
      .then((r) => r.json())
      .then((data) => {
        const all: ATPMatch[] = data.matches ?? [];
        setMatches(all.filter((m) => isMainATP(m.tournament)));
      })
      .catch(() => setMatches([]))
      .finally(() => setMatchesLoading(false));
  }, [selectedDate, todayStr]);

  // Auto-fetch predicciones para partidos terminados (para mostrar acierto/fallo sin expandir)
  useEffect(() => {
    const finished = matches.filter((m) => m.status === "finished" && m.winner);
    if (finished.length === 0) return;
    // Fetch secuencial con pequeño delay para no saturar el servidor
    let cancelled = false;
    (async () => {
      for (const m of finished) {
        if (cancelled) break;
        if (predictions[m.id] || loadingPred[m.id]) continue;
        await fetchPrediction(m);
        await new Promise((r) => setTimeout(r, 150));
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  const scroll = (dir: "left" | "right") => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollBy({ left: dir === "left" ? -400 : 400, behavior: "smooth" });
  };

  const tickerItems = matches.length > 0
    ? matches.map((m) => `${m.tournament}: ${m.player1} vs ${m.player2}`)
    : ["Cargando partidos ATP..."];

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

        .match-card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;transition:all 0.3s;overflow:hidden;cursor:pointer;position:relative;}
        .match-card:hover{border-color:rgba(200,241,53,0.25);box-shadow:0 8px 40px rgba(0,0,0,0.5);}
        .match-card.expanded{border-color:rgba(200,241,53,0.4);}
        .match-card.outcome-correct{border-color:rgba(72,199,116,0.45);background:linear-gradient(135deg,rgba(72,199,116,0.06) 0%,var(--bg2) 60%);}
        .match-card.outcome-correct:hover{border-color:rgba(72,199,116,0.7);}
        .match-card.outcome-wrong{border-color:rgba(255,96,96,0.4);background:linear-gradient(135deg,rgba(255,96,96,0.05) 0%,var(--bg2) 60%);}
        .match-card.outcome-wrong:hover{border-color:rgba(255,96,96,0.65);}
        .match-card.outcome-close{border-color:rgba(255,255,255,0.12);}
        .outcome-dot{position:absolute;top:12px;right:12px;width:8px;height:8px;border-radius:50%;flex-shrink:0;}
        .outcome-dot.correct{background:#48c774;box-shadow:0 0 8px rgba(72,199,116,0.6);}
        .outcome-dot.wrong{background:#ff6060;box-shadow:0 0 8px rgba(255,96,96,0.5);}
        .outcome-dot.close{background:rgba(255,255,255,0.2);}
        .pred-panel{background:var(--bg3);border-top:1px solid var(--border);padding:20px 24px;}
        .prob-bar-wrap{display:flex;align-items:center;gap:0;border-radius:8px;overflow:hidden;height:36px;}
        .prob-bar-p1{background:linear-gradient(90deg,var(--acid),#9ab82a);display:flex;align-items:center;justify-content:flex-start;padding:0 12px;transition:width 0.6s ease;}
        .prob-bar-p2{background:rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:flex-end;padding:0 12px;transition:width 0.6s ease;}
        .factor-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);}
        .factor-row:last-child{border-bottom:none;}
        .adv-badge{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;padding:2px 7px;border-radius:4px;white-space:nowrap;flex-shrink:0;}
        .adv-p1{background:rgba(200,241,53,0.15);color:var(--acid);border:1px solid rgba(200,241,53,0.25);}
        .adv-p2{background:rgba(255,100,100,0.12);color:#ff8080;border:1px solid rgba(255,100,100,0.2);}
        .adv-n{background:rgba(255,255,255,0.05);color:var(--muted);border:1px solid rgba(255,255,255,0.08);}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        .pred-panel{animation:fadeIn 0.25s ease;}
        .avatar{width:52px;height:52px;border-radius:50%;object-fit:cover;object-position:top;background:var(--bg3);border:2px solid var(--border);flex-shrink:0;}
        .bar-track{background:rgba(255,255,255,0.08);border-radius:999px;height:5px;overflow:hidden;}
        .bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--acid),#9ab82a);}
        .bar-dim{height:100%;border-radius:999px;background:rgba(255,255,255,0.18);}
        .tag{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;padding:3px 8px;border-radius:5px;background:var(--acid-dim);color:var(--acid);border:1px solid rgba(200,241,53,0.18);white-space:nowrap;}
        .tag-g{background:rgba(255,255,255,0.05);color:var(--muted);border-color:rgba(255,255,255,0.07);}
        .pct{font-family:'Bebas Neue',cursive;font-size:40px;line-height:1;}
        .insight-dot{width:5px;height:5px;border-radius:50%;background:var(--acid);flex-shrink:0;margin-top:5px;}
        .noise{background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");pointer-events:none;position:fixed;inset:0;z-index:999;}
        .day-btn{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 10px;border-radius:10px;background:var(--bg2);border:1px solid var(--border);cursor:pointer;transition:all 0.2s;min-width:48px;}
        .day-btn:hover{border-color:rgba(200,241,53,0.3);}
        .day-btn.active{background:var(--acid);border-color:var(--acid);}
        .day-btn.active .day-name{color:#080c10;}
        .day-btn.active .day-num{color:#080c10;}
        .day-name{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);}
        .day-num{font-family:'Bebas Neue',cursive;font-size:22px;line-height:1;color:white;}
        .score-str{font-family:'Space Mono',monospace;font-size:11px;color:var(--acid);letter-spacing:0.05em;}
        .pred-result-ok{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;padding:2px 7px;border-radius:4px;background:rgba(200,241,53,0.12);color:var(--acid);border:1px solid rgba(200,241,53,0.25);}
        .pred-result-ko{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;padding:2px 7px;border-radius:4px;background:rgba(255,100,100,0.1);color:#ff8080;border:1px solid rgba(255,100,100,0.2);}
        .narrative-block{padding:16px 18px;border-radius:12px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);margin-bottom:20px;}
        .narrative-para{font-family:'DM Sans',sans-serif;font-size:13px;line-height:1.7;color:rgba(255,255,255,0.75);}
        .narrative-para+.narrative-para{margin-top:10px;}
        .narrative-label{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:var(--acid);margin-bottom:8px;}
        .weapon-tag{display:inline-block;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.08em;padding:2px 7px;border-radius:4px;background:rgba(200,241,53,0.1);color:var(--acid);border:1px solid rgba(200,241,53,0.2);margin-right:6px;margin-bottom:4px;}
        .conf-tag{display:inline-block;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.08em;padding:2px 7px;border-radius:4px;margin-right:6px;}
        .conf-alta{background:rgba(200,241,53,0.1);color:var(--acid);border:1px solid rgba(200,241,53,0.2);}
        .conf-moderada{background:rgba(255,180,0,0.08);color:#f5a623;border:1px solid rgba(255,180,0,0.2);}
        .conf-baja{background:rgba(255,100,100,0.08);color:#ff8080;border:1px solid rgba(255,100,100,0.18);}
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
            <a href="/historico" className="nav-link">Histórico</a>
          </div>
          <div className="flex items-center gap-4">
            <a href="/historico" className="md:hidden nav-link" style={{ fontSize: "10px", letterSpacing: "0.1em" }}>HISTÓRICO</a>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--acid)" }} />
              <span className="fm text-xs" style={{ color: "var(--acid)" }}>LIVE</span>
            </div>
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
                  <a key={p.rank} href={`/player/${lastName(p.name)}`} className="p-card" style={{ textDecoration: "none", color: "inherit" }}>
                    <img
                      src={p.photo}
                      alt={p.name}
                      referrerPolicy="no-referrer"
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
                  </a>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Partidos */}
      <section className="px-6 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Selector de día */}
          <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {weekDays.map((day) => {
              const d = new Date(day + "T12:00:00");
              const isSelected = day === selectedDate;
              const isToday2 = day === todayStr;
              const dayName = d.toLocaleDateString("es-ES", { weekday: "short" });
              return (
                <button
                  key={day}
                  className={`day-btn${isSelected ? " active" : ""}`}
                  onClick={() => setSelectedDate(day)}
                >
                  <span className="day-name">{isToday2 ? "Hoy" : dayName}</span>
                  <span className="day-num">{d.getDate()}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="slabel mb-1.5">
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </div>
              <h2 className="fd text-4xl tracking-wide">
                {selectedDate === todayStr ? "PARTIDOS ATP HOY" : "RESULTADOS ATP"}
              </h2>
            </div>
            <div className="flex items-center gap-2 fm text-xs" style={{ color: "var(--muted)" }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--acid)" }} />
              {matchesLoading ? "Cargando..." : `${matches.length} partidos · ATP singles`}
            </div>
          </div>

          {matchesLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl h-24 p-card-skeleton" />
              ))}
            </div>
          ) : matches.length === 0 ? (
            <div className="fm text-sm" style={{ color: "var(--muted)" }}>No hay partidos ATP programados hoy.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {matches.map((m) => {
                const surfColor = SURFACE_COLOR[m.surface] ?? "rgba(255,255,255,0.2)";
                const surfLabel = SURFACE_ES[m.surface] ?? m.surface;
                const isFinished = m.status === "finished";
                const isLive = m.status === "live";
                const isExpanded = expandedMatch === m.id;
                const pred = predictions[m.id];
                const isLoadingPred = loadingPred[m.id];
                const outcome = isFinished && pred ? predictionOutcome(m, pred) : null;
                const outcomeClass = outcome ? ` outcome-${outcome}` : "";

                return (
                  <div
                    key={m.id}
                    className={`match-card${isExpanded ? " expanded" : ""}${outcomeClass}`}
                    style={{ opacity: isFinished && !outcome ? 0.75 : isFinished ? 0.88 : 1 }}
                  >
                    {/* Indicador de acierto/fallo */}
                    {outcome && (
                      <div
                        className={`outcome-dot ${outcome}`}
                        title={outcome === "correct" ? "Predicción correcta" : outcome === "wrong" ? "Predicción fallida" : "Muy igualado"}
                      />
                    )}

                    {/* Fila principal — clickable */}
                    <div
                      className="p-5 flex flex-wrap items-center gap-4"
                      onClick={() => handleMatchClick(m)}
                    >
                      {/* Hora + estado */}
                      <div className="flex flex-col items-center" style={{ minWidth: 48 }}>
                        <span className="fd text-2xl" style={{ color: isLive ? "#c8f135" : isFinished ? "var(--muted)" : "white", lineHeight: 1 }}>
                          {m.time || "—"}
                        </span>
                        {isLive && <span className="fm text-[9px] tracking-widest" style={{ color: "#c8f135" }}>LIVE</span>}
                        {isFinished && <span className="fm text-[9px] tracking-widest" style={{ color: "var(--muted)" }}>FIN</span>}
                        {isFinished && m.score && (
                          <span className="score-str mt-0.5">{m.score}</span>
                        )}
                      </div>

                      {/* Jugadores */}
                      <a href={`/player/${m.player1Slug}`} onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", minWidth: 0 }}>
                        <PlayerPhoto name={m.player1} slug={m.player1Slug} rankingMap={rankingMap} size={52}
                          style={{ opacity: isFinished && m.winner === "player2" ? 0.45 : 1 }} />
                        <div style={{ minWidth: 0 }}>
                          <div className={`fb text-base leading-tight ${isFinished && m.winner === "player2" ? "font-normal" : "font-semibold"}`}
                            style={{ color: isFinished && m.winner === "player1" ? "var(--acid)" : isFinished && m.winner === "player2" ? "rgba(255,255,255,0.35)" : "white" }}>
                            {m.player1}
                            {isFinished && m.winner === "player1" && <span className="fm text-[9px] ml-1.5" style={{ color: "var(--acid)" }}>✓</span>}
                          </div>
                          {rankNumMap.get(lastName(m.player1)) && (
                            <div className="fm text-[10px]" style={{ color: "var(--muted)", marginTop: 1 }}>
                              ATP <span style={{ color: "rgba(255,255,255,0.45)" }}>#{rankNumMap.get(lastName(m.player1))}</span>
                            </div>
                          )}
                        </div>
                      </a>
                      <div className="fm text-[10px]" style={{ color: "var(--muted)", flexShrink: 0 }}>VS</div>
                      <a href={`/player/${m.player2Slug}`} onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", minWidth: 0 }}>
                        <PlayerPhoto name={m.player2} slug={m.player2Slug} rankingMap={rankingMap} size={52}
                          style={{ opacity: isFinished && m.winner === "player1" ? 0.45 : 1 }} />
                        <div style={{ minWidth: 0 }}>
                          <div className={`fb text-base leading-tight ${isFinished && m.winner === "player1" ? "font-normal" : "font-semibold"}`}
                            style={{ color: isFinished && m.winner === "player2" ? "var(--acid)" : isFinished && m.winner === "player1" ? "rgba(255,255,255,0.35)" : "white" }}>
                            {m.player2}
                            {isFinished && m.winner === "player2" && <span className="fm text-[9px] ml-1.5" style={{ color: "var(--acid)" }}>✓</span>}
                          </div>
                          {rankNumMap.get(lastName(m.player2)) && (
                            <div className="fm text-[10px]" style={{ color: "var(--muted)", marginTop: 1 }}>
                              ATP <span style={{ color: "rgba(255,255,255,0.45)" }}>#{rankNumMap.get(lastName(m.player2))}</span>
                            </div>
                          )}
                        </div>
                      </a>

                      {/* Torneo + ronda + superficie */}
                      <div className="flex flex-wrap gap-2 items-center ml-auto">
                        <span className="tag tag-g">{m.tournament}</span>
                        {m.round && (() => {
                          const isQual = /^Q\d?$/i.test(m.round);
                          return (
                            <span className="tag" style={isQual
                              ? { background: "rgba(255,180,0,0.08)", color: "#f5a623", borderColor: "rgba(255,180,0,0.2)" }
                              : { background: "rgba(255,255,255,0.05)", color: "var(--muted)", borderColor: "rgba(255,255,255,0.07)" }
                            }>
                              {isQual ? "Q" : m.round}
                            </span>
                          );
                        })()}
                        <span className="tag" style={{ background: `${surfColor}22`, color: surfColor, borderColor: `${surfColor}44` }}>{surfLabel}</span>
                        <span className="fm text-[9px]" style={{ color: "var(--muted)" }}>{isExpanded ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {/* Panel de predicción (expandible) */}
                    {isExpanded && (
                      <div className="pred-panel">
                        {isLoadingPred && (
                          <div className="fm text-xs text-center py-4" style={{ color: "var(--muted)" }}>Calculando predicción...</div>
                        )}
                        {!isLoadingPred && !pred && (
                          <div className="fm text-xs text-center py-4" style={{ color: "var(--muted)" }}>No hay datos suficientes para este partido.</div>
                        )}
                        {pred && (
                          <div>
                            {/* Barra de probabilidad */}
                            <div className="mb-5">
                              <div className="flex justify-between mb-2">
                                <span className="fb font-semibold text-sm">{pred.player1.name}</span>
                                <span className="fb font-semibold text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>{pred.player2.name}</span>
                              </div>
                              <div className="prob-bar-wrap">
                                <div className="prob-bar-p1 fd text-xl" style={{ width: `${pred.player1.winPct}%`, color: "#080c10" }}>
                                  {pred.player1.winPct}%
                                </div>
                                <div className="prob-bar-p2 fd text-xl" style={{ width: `${pred.player2.winPct}%`, color: "rgba(255,255,255,0.5)" }}>
                                  {pred.player2.winPct}%
                                </div>
                              </div>
                            </div>

                            {/* Análisis táctico experto */}
                            {pred.tacticalAnalysis && (
                              <div className="narrative-block">
                                <div className="narrative-label">Análisis del partido</div>
                                <div className="mb-2 flex flex-wrap gap-1">
                                  {pred.tacticalAnalysis.keyWeapon && (
                                    <span className="weapon-tag">⚡ {pred.tacticalAnalysis.keyWeapon.split(" — ")[0].split("(")[0].trim().slice(0, 60)}</span>
                                  )}
                                  <span className={`conf-tag conf-${pred.tacticalAnalysis.confidence}`}>
                                    Análisis {pred.tacticalAnalysis.confidence} confianza
                                  </span>
                                </div>
                                {pred.tacticalAnalysis.narrative.split("\n\n").map((para, i) => (
                                  <p key={i} className="narrative-para">{para}</p>
                                ))}
                                {pred.tacticalAnalysis.riskFactor && (
                                  <div className="mt-3 flex gap-2 items-start px-2 py-2 rounded-lg" style={{ background: "rgba(255,180,0,0.05)", border: "1px solid rgba(255,180,0,0.12)" }}>
                                    <span className="fm text-[9px]" style={{ color: "#f5a623", marginTop: 2 }}>RIESGO</span>
                                    <span className="fb text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.5)" }}>{pred.tacticalAnalysis.riskFactor}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Resultado real vs predicción */}
                            {isFinished && m.winner && (
                              (() => {
                                const predWinner = pred.player1.winPct > pred.player2.winPct ? "player1" : "player2";
                                const correct = predWinner === m.winner;
                                const winnerName = m.winner === "player1" ? pred.player1.name : pred.player2.name;
                                return (
                                  <div className="flex items-center gap-2 mb-4">
                                    <span className={correct ? "pred-result-ok" : "pred-result-ko"}>
                                      {correct ? "✓ Predicción correcta" : "✗ Predicción incorrecta"}
                                    </span>
                                    <span className="fm text-[10px]" style={{ color: "var(--muted)" }}>
                                      Ganó {winnerName.split(" ").pop()} · {m.score}
                                    </span>
                                  </div>
                                );
                              })()
                            )}

                            {/* Meta badges */}
                            <div className="flex flex-wrap gap-2 mb-5">
                              {pred.courtModel && (
                                <span className="tag">CSI {pred.courtModel.speed} · {pred.courtModel.profile}</span>
                              )}
                              {pred.h2h.total > 0 && (
                                <span className="tag tag-g">H2H {pred.h2h.p1Wins}–{pred.h2h.p2Wins}</span>
                              )}
                              {pred.weather && (
                                <span className="tag tag-g" title={pred.weather.effect}>
                                  🌡 {pred.weather.temp.toFixed(0)}°C · 💨 {pred.weather.windSpeed.toFixed(0)} km/h · 💧 {pred.weather.humidity}%
                                  {pred.weather.source === "static" && <span style={{ color: "var(--muted)" }}> ·est.</span>}
                                </span>
                              )}
                              <span className="tag tag-g">Confianza {pred.confidence}%</span>
                            </div>

                            {/* Razón principal */}
                            {pred.mainReason && (
                              <div className="mb-5 flex gap-2 items-start px-3 py-2.5 rounded-lg" style={{ background: "rgba(200,241,53,0.06)", border: "1px solid rgba(200,241,53,0.15)" }}>
                                <div className="insight-dot mt-0.5" />
                                <span className="fb text-sm leading-snug" style={{ color: "rgba(255,255,255,0.85)" }}>{pred.mainReason}</span>
                              </div>
                            )}

                            {/* Alertas de confianza por jugador */}
                            {pred.playerConfidence && (
                              <>
                                {pred.playerConfidence.p1.tier !== "high" && (
                                  <div className="mb-2 flex gap-2 items-start px-3 py-2 rounded-lg" style={{ background: "rgba(255,180,0,0.06)", border: "1px solid rgba(255,180,0,0.18)" }}>
                                    <span style={{ color: "#f5a623", fontSize: 13, lineHeight: 1.4 }}>⚠</span>
                                    <span className="fm text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.65)" }}>
                                      <span style={{ color: "#f5a623", fontWeight: 600 }}>{pred.player1.name.split(" ").pop()}: </span>
                                      {pred.playerConfidence.p1.label}
                                    </span>
                                  </div>
                                )}
                                {pred.playerConfidence.p2.tier !== "high" && (
                                  <div className="mb-2 flex gap-2 items-start px-3 py-2 rounded-lg" style={{ background: "rgba(255,180,0,0.06)", border: "1px solid rgba(255,180,0,0.18)" }}>
                                    <span style={{ color: "#f5a623", fontSize: 13, lineHeight: 1.4 }}>⚠</span>
                                    <span className="fm text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.65)" }}>
                                      <span style={{ color: "#f5a623", fontWeight: 600 }}>{pred.player2.name.split(" ").pop()}: </span>
                                      {pred.playerConfidence.p2.label}
                                    </span>
                                  </div>
                                )}
                                {pred.playerConfidence.adjustmentNote && (
                                  <div className="mb-4 px-3 py-2 rounded-lg fm text-[11px]" style={{ background: "rgba(255,255,255,0.03)", color: "var(--muted)" }}>
                                    {pred.playerConfidence.adjustmentNote}
                                  </div>
                                )}
                              </>
                            )}

                            {/* 3 patrones clave */}
                            <div className="slabel mb-3">Factores determinantes</div>
                            <div>
                              {pred.keyPatterns.map((f: FactorResult) => (
                                <div key={f.id} className="factor-row">
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <div className="fb text-sm font-medium">{f.label}</div>
                                      <span className="fm text-[9px]" style={{ color: "var(--muted)" }}>
                                        {Math.round((f.effectiveWeight ?? f.baseWeight ?? 0) * 100)}%
                                      </span>
                                    </div>
                                    <div className="flex gap-3 flex-wrap">
                                      <span className="fm text-[11px]" style={{ color: "var(--acid)" }}>{pred.player1.name.split(" ").pop()}: {f.p1Label}</span>
                                      <span className="fm text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>{pred.player2.name.split(" ").pop()}: {f.p2Label}</span>
                                    </div>
                                  </div>
                                  <span className={`adv-badge ${f.winner === "p1" ? "adv-p1" : f.winner === "p2" ? "adv-p2" : "adv-n"}`}>
                                    {f.winner === "p1" ? `↑ ${pred.player1.name.split(" ").pop()}` : f.winner === "p2" ? `↑ ${pred.player2.name.split(" ").pop()}` : "Par"}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* Todos los factores (desplegable) */}
                            {pred.allFactors && pred.allFactors.length > 3 && (
                              <details className="mt-3">
                                <summary className="fm text-[10px] cursor-pointer" style={{ color: "var(--muted)", letterSpacing: "0.1em", userSelect: "none" }}>
                                  VER LOS {pred.allFactors.length} FACTORES
                                </summary>
                                <div className="mt-2">
                                  {pred.allFactors.filter((f: FactorResult) => !pred.keyPatterns.find((k: FactorResult) => k.id === f.id)).map((f: FactorResult) => (
                                    <div key={f.id} className="factor-row" style={{ opacity: f.hasData ? 0.8 : 0.35 }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="flex items-center gap-2 mb-1">
                                          <div className="fb text-xs font-medium">{f.label}</div>
                                          <span className="fm text-[9px]" style={{ color: "var(--muted)" }}>
                                            {Math.round((f.effectiveWeight ?? f.baseWeight ?? 0) * 100)}%
                                            {!f.hasData && " · sin datos"}
                                          </span>
                                        </div>
                                        <div className="flex gap-3 flex-wrap">
                                          <span className="fm text-[10px]" style={{ color: "rgba(200,241,53,0.7)" }}>{pred.player1.name.split(" ").pop()}: {f.p1Label}</span>
                                          <span className="fm text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{pred.player2.name.split(" ").pop()}: {f.p2Label}</span>
                                        </div>
                                      </div>
                                      <span className={`adv-badge ${f.winner === "p1" ? "adv-p1" : f.winner === "p2" ? "adv-p2" : "adv-n"}`} style={{ fontSize: "8px" }}>
                                        {f.winner === "p1" ? `↑ ${pred.player1.name.split(" ").pop()}` : f.winner === "p2" ? `↑ ${pred.player2.name.split(" ").pop()}` : "Par"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}

                            {/* Efecto clima si hay */}
                            {pred.weather && pred.weather.effect !== "condiciones normales" && (
                              <div className="mt-4 fm text-[11px] px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", color: "var(--muted)" }}>
                                ☁ {pred.weather.effect}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
