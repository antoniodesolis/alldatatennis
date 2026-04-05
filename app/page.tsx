"use client";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type { ATPPlayer } from "./api/rankings/route";
import type { ATPMatch } from "./api/matches/route";
import type { PredictionResult, FactorResult } from "../lib/prediction/engine";

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
const SURFACE_ICON: Record<string, string> = {
  clay: "🟤", hard: "🔵", grass: "🟢", "indoor hard": "🟣", carpet: "⬜",
};
const LEVEL_BORDER: Record<string, string> = {
  "grand-slam": "rgba(255,215,0,0.5)",
  "masters-1000": "rgba(200,241,53,0.45)",
  "atp-finals": "rgba(255,215,0,0.4)",
  "atp-500": "rgba(200,241,53,0.2)",
};
const LEVEL_GLOW: Record<string, string> = {
  "grand-slam": "0 0 0 1px rgba(255,215,0,0.15), 0 4px 24px rgba(255,215,0,0.08)",
  "masters-1000": "0 0 0 1px rgba(200,241,53,0.1), 0 4px 20px rgba(200,241,53,0.05)",
  "atp-finals": "0 0 0 1px rgba(255,215,0,0.12), 0 4px 20px rgba(255,215,0,0.06)",
};

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='170' viewBox='0 0 140 170'%3E%3Crect width='140' height='170' fill='%230d1318'/%3E%3Ccircle cx='70' cy='60' r='28' fill='%23131a22'/%3E%3Cellipse cx='70' cy='130' rx='40' ry='25' fill='%23131a22'/%3E%3C/svg%3E";

function initialsPlaceholder(name: string): string {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='52' height='52' viewBox='0 0 52 52'><rect width='52' height='52' rx='26' fill='%23131a22'/><text x='26' y='33' text-anchor='middle' font-family='sans-serif' font-size='16' font-weight='600' fill='%23c8f135'>${initials}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

function predictionOutcome(m: ATPMatch, pred: PredictionResult): "correct" | "wrong" | "close" | null {
  if (!m.winner || m.status !== "finished") return null;
  const maxPct = Math.max(pred.player1.winPct, pred.player2.winPct);
  if (maxPct <= 54) return "close";
  const predictedWinner = pred.player1.winPct >= pred.player2.winPct ? "player1" : "player2";
  return predictedWinner === m.winner ? "correct" : "wrong";
}

const SIBLING_SLUG: Record<string, string> = {
  "cerundolo/j": "juan-cerundolo", "cerundolo/j.m": "juan-cerundolo",
  "cerundolo/juan": "juan-cerundolo", "cerundolo/jm": "juan-cerundolo",
  "cerundolo/f": "cerundolo", "cerundolo/francisco": "cerundolo",
};
const ATP_EMBEDDED: Record<string, string> = {
  "cerundolo-c0c8": "juan-cerundolo", "cerundolo-c0au": "cerundolo",
};

function resolveSlug(rawSlug: string, playerName: string): string {
  const slugLower = rawSlug.toLowerCase();
  if (ATP_EMBEDDED[slugLower]) return ATP_EMBEDDED[slugLower];
  if (slugLower.startsWith("juan") && slugLower.includes("cerundolo")) return "juan-cerundolo";
  if (slugLower.startsWith("francisco") && slugLower.includes("cerundolo")) return "cerundolo";
  const lastPart = slugLower.split("-").pop() ?? slugLower;
  const nameParts = playerName.trim().toLowerCase().split(/\s+/);
  const firstToken = nameParts[0].replace(/\./g, "").replace(/\s/g, "");
  const key = `${lastPart}/${firstToken}`;
  if (SIBLING_SLUG[key]) return SIBLING_SLUG[key];
  if (nameParts.length > 1) {
    const key2 = `${lastPart}/${nameParts[1].replace(/\./g, "")}`;
    if (SIBLING_SLUG[key2]) return SIBLING_SLUG[key2];
  }
  return rawSlug;
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  if (/^[A-Z]\.?$/.test(last)) return parts[0].toLowerCase();
  return last.toLowerCase();
}

function inferTourneyLevel(name: string): string {
  const lower = name.toLowerCase();
  if (/australian open|roland garros|wimbledon|us open/.test(lower)) return "grand-slam";
  if (/masters 1000|indian wells|miami|monte.carlo|madrid|rome|canada|cincinnati|shanghai|paris masters/.test(lower)) return "masters-1000";
  if (/\b500\b|dubai|acapulco|rotterdam|barcelona|hamburg|washington|vienna|beijing|tokyo/.test(lower)) return "atp-500";
  if (/finals|nitto/.test(lower)) return "atp-finals";
  return "atp-250";
}

/** Resalta nombres de jugadores y porcentajes en el texto narrativo */
function highlightNarrative(text: string, p1: string, p2: string): string {
  const last1 = p1.split(" ").pop() ?? p1;
  const last2 = p2.split(" ").pop() ?? p2;
  return text
    .replace(new RegExp(`\\b(${last1})\\b`, "g"), `<strong style="color:rgba(255,255,255,0.92);font-weight:600">$1</strong>`)
    .replace(new RegExp(`\\b(${last2})\\b`, "g"), `<strong style="color:rgba(255,255,255,0.92);font-weight:600">$1</strong>`)
    .replace(/(\d+(?:[,.]\d+)?%)/g, `<strong style="color:var(--acid);font-weight:600">$1</strong>`);
}

function PlayerPhoto({ name, slug, rankingMap, size = 52, style }: {
  name: string; slug: string; rankingMap: Map<string, string>;
  size?: number; style?: React.CSSProperties;
}) {
  const [src, setSrc] = useState<string>(() => rankingMap.get(lastName(name)) ?? "");
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (src || tried) return;
    setTried(true);
    fetch(`/api/player-photo/${encodeURIComponent(slug)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.photo) setSrc(d.photo); })
      .catch(() => {});
  }, [src, tried, slug]);
  const fallback = initialsPlaceholder(name);
  return (
    <img src={src || fallback} alt={name} width={size} height={size}
      referrerPolicy="no-referrer"
      style={{ borderRadius: "50%", objectFit: "cover", objectPosition: "top", background: "#131a22", flexShrink: 0, ...style }}
      onError={(e) => { (e.target as HTMLImageElement).src = fallback; }} />
  );
}

export default function Home() {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [players, setPlayers] = useState<ATPPlayer[]>([]);
  const [rankSource, setRankSource] = useState<"live" | "static" | "">("");
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<ATPMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [rankingMap, setRankingMap] = useState<Map<string, string>>(new Map());
  const [rankNumMap, setRankNumMap] = useState<Map<string, number>>(new Map());

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  }), []);

  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<Record<string, PredictionResult>>({});
  const [loadingPred, setLoadingPred] = useState<Record<string, boolean>>({});

  const fetchPrediction = useCallback(async (m: ATPMatch) => {
    if (predictions[m.id] || loadingPred[m.id]) return;
    setLoadingPred((prev) => ({ ...prev, [m.id]: true }));
    try {
      const res = await fetch("/api/prediction", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: m.id, player1: m.player1Slug, player2: m.player2Slug,
          player1Name: m.player1, player2Name: m.player2,
          tournament: m.tournament, tourneyLevel: inferTourneyLevel(m.tournament),
          surface: m.surface ?? "hard", round: m.round || undefined,
          timeOfDay: undefined, date: selectedDate,
        }),
      });
      if (res.ok) {
        const data = await res.json() as PredictionResult;
        setPredictions((prev) => ({ ...prev, [m.id]: data }));
      }
    } catch (e) { console.error("[prediction] fetch error:", e); }
    finally { setLoadingPred((prev) => ({ ...prev, [m.id]: false })); }
  }, [predictions, loadingPred, selectedDate]);

  const handleMatchClick = useCallback((m: ATPMatch) => {
    const isExpanding = expandedMatch !== m.id;
    setExpandedMatch(isExpanding ? m.id : null);
    if (isExpanding) fetchPrediction(m);
  }, [expandedMatch, fetchPrediction]);

  const buildRankingMap = useCallback((ps: ATPPlayer[]) => {
    const m = new Map<string, string>(); const rn = new Map<string, number>();
    const lastCount = new Map<string, number>();
    for (const p of ps) { const last = p.name.trim().split(/\s+/).pop()!.toLowerCase(); lastCount.set(last, (lastCount.get(last) ?? 0) + 1); }
    for (const p of ps) {
      const last = p.name.trim().split(/\s+/).pop()!.toLowerCase();
      if ((lastCount.get(last) ?? 0) > 1) continue;
      m.set(last, p.photo); rn.set(last, p.rank);
    }
    setRankingMap(m); setRankNumMap(rn);
  }, []);

  useEffect(() => {
    fetch("/api/rankings").then((r) => r.json()).then((data) => {
      const ps: ATPPlayer[] = data.players ?? [];
      setPlayers(ps); setRankSource(data.source ?? "static"); buildRankingMap(ps);
    }).catch(() => setPlayers([])).finally(() => setLoading(false));
  }, [buildRankingMap]);

  useEffect(() => {
    setMatchesLoading(true); setMatches([]); setPredictions({}); setExpandedMatch(null);
    const dateQ = selectedDate !== todayStr ? `?date=${selectedDate}` : "";
    fetch(`/api/matches${dateQ}`).then((r) => r.json()).then((data) => {
      setMatches((data.matches ?? []).filter((m: ATPMatch) => isMainATP(m.tournament)));
    }).catch(() => setMatches([])).finally(() => setMatchesLoading(false));
  }, [selectedDate, todayStr]);

  useEffect(() => {
    const finished = matches.filter((m) => m.status === "finished" && m.winner);
    if (finished.length === 0) return;
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
    carouselRef.current?.scrollBy({ left: dir === "left" ? -400 : 400, behavior: "smooth" });
  };

  const tickerItems = matches.length > 0
    ? matches.map((m) => `${m.tournament}: ${m.player1} vs ${m.player2}`)
    : ["Cargando partidos ATP..."];

  return (
    <main className="min-h-screen bg-[#080c10] text-white overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Space+Mono:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&display=swap');
        :root {
          --acid:#c8f135; --acid-dim:rgba(200,241,53,0.11); --acid-glow:rgba(200,241,53,0.35);
          --bg:#080c10; --bg2:#0d1318; --bg3:#131a22;
          --border:rgba(255,255,255,0.07); --muted:rgba(255,255,255,0.38);
          font-size:15px;
        }
        *{box-sizing:border-box;}
        body{line-height:1.7;}
        .fd{font-family:'Bebas Neue',cursive;}
        .fm{font-family:'Space Mono',monospace;}
        .fb{font-family:'DM Sans',sans-serif;}
        .fp{font-family:'Playfair Display',serif;}
        .glow{text-shadow:0 0 80px rgba(200,241,53,0.5),0 0 30px rgba(200,241,53,0.3);}
        .slabel{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;color:var(--acid);}

        /* ── Ticker ── */
        .ticker-wrap{background:var(--acid);overflow:hidden;white-space:nowrap;}
        .ticker{display:inline-block;animation:tick 55s linear infinite;font-family:'Space Mono',monospace;font-size:11px;font-weight:700;letter-spacing:0.12em;color:#080c10;}
        @keyframes tick{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}

        /* ── Nav ── */
        nav{border-bottom:1px solid var(--border);background:rgba(8,12,16,0.97);backdrop-filter:blur(20px);position:sticky;top:0;z-index:50;}
        .nav-link{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted);transition:color 0.2s;}
        .nav-link:hover{color:white;}

        /* ── Hero grid ── */
        .hero-grid{
          background-image:
            linear-gradient(180deg,#0a0f14 0%,rgba(8,12,16,0.0) 100%),
            repeating-linear-gradient(0deg,transparent,transparent 59px,rgba(200,241,53,0.025) 59px,rgba(200,241,53,0.025) 60px),
            repeating-linear-gradient(90deg,transparent,transparent 59px,rgba(200,241,53,0.025) 59px,rgba(200,241,53,0.025) 60px);
        }

        /* ── Carousel ── */
        .carousel{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding-bottom:8px;cursor:grab;}
        .carousel:active{cursor:grabbing;}
        .carousel::-webkit-scrollbar{display:none;}
        .p-card{flex-shrink:0;width:140px;scroll-snap-align:start;background:var(--bg2);border:1px solid var(--border);border-radius:14px;overflow:hidden;transition:all 0.35s cubic-bezier(.25,.8,.25,1);cursor:pointer;}
        .p-card:hover{border-color:rgba(200,241,53,0.35);transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,0.6),0 0 0 1px rgba(200,241,53,0.1);}
        .p-card img{width:100%;height:170px;object-fit:cover;object-position:top center;display:block;background:var(--bg3);}
        .p-card-skeleton{flex-shrink:0;width:140px;height:250px;border-radius:14px;background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .scroll-btn{width:36px;height:36px;border-radius:50%;background:var(--bg2);border:1px solid var(--border);color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;flex-shrink:0;}
        .scroll-btn:hover{border-color:var(--acid);color:var(--acid);box-shadow:0 0 12px rgba(200,241,53,0.15);}

        /* ── Day picker ── */
        .day-btn{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 14px;border-radius:999px;background:var(--bg2);border:1px solid var(--border);cursor:pointer;transition:all 0.2s;min-width:52px;}
        .day-btn:hover{border-color:rgba(200,241,53,0.35);background:rgba(200,241,53,0.05);}
        .day-btn.active{background:var(--acid);border-color:var(--acid);box-shadow:0 0 20px rgba(200,241,53,0.25);}
        .day-btn.active .day-name,.day-btn.active .day-num{color:#080c10;}
        .day-name{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);}
        .day-num{font-family:'Bebas Neue',cursive;font-size:22px;line-height:1;color:white;}

        /* ── Match cards ── */
        .match-card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;transition:border-color 0.3s,box-shadow 0.3s,background 0.3s;overflow:hidden;cursor:pointer;position:relative;}
        .match-card:hover{border-color:rgba(200,241,53,0.3);box-shadow:0 8px 40px rgba(0,0,0,0.5),0 0 0 1px rgba(200,241,53,0.08);}
        .match-card.expanded{border-color:rgba(200,241,53,0.45);box-shadow:0 0 40px rgba(200,241,53,0.07);}
        .match-card.outcome-correct{border-color:rgba(72,199,116,0.45);background:linear-gradient(135deg,rgba(72,199,116,0.06) 0%,var(--bg2) 60%);}
        .match-card.outcome-correct:hover{border-color:rgba(72,199,116,0.65);}
        .match-card.outcome-wrong{border-color:rgba(255,96,96,0.4);background:linear-gradient(135deg,rgba(255,96,96,0.05) 0%,var(--bg2) 60%);}
        .match-card.outcome-wrong:hover{border-color:rgba(255,96,96,0.6);}
        .match-card.outcome-close{border-color:rgba(255,255,255,0.1);}
        .match-card.level-gs{border-color:rgba(255,215,0,0.35)!important;box-shadow:0 0 30px rgba(255,215,0,0.06);}
        .match-card.level-m1k{border-color:rgba(200,241,53,0.3)!important;}
        @keyframes cardIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .card-anim{animation:cardIn 0.35s ease both;}

        /* ── LIVE badge ── */
        .live-dot{width:8px;height:8px;border-radius:50%;background:#c8f135;flex-shrink:0;}
        @keyframes livePulse{0%,100%{box-shadow:0 0 0 0 rgba(200,241,53,0.7)}50%{box-shadow:0 0 0 6px rgba(200,241,53,0)}}
        .live-dot{animation:livePulse 1.5s ease-in-out infinite;}
        .live-badge{display:flex;align-items:center;gap:5px;background:rgba(200,241,53,0.12);border:1px solid rgba(200,241,53,0.3);border-radius:999px;padding:3px 9px;}

        /* ── Outcome dot ── */
        .outcome-dot{position:absolute;top:12px;right:12px;width:8px;height:8px;border-radius:50%;flex-shrink:0;}
        .outcome-dot.correct{background:#48c774;box-shadow:0 0 10px rgba(72,199,116,0.7);}
        .outcome-dot.wrong{background:#ff6060;box-shadow:0 0 10px rgba(255,96,96,0.6);}
        .outcome-dot.close{background:rgba(255,255,255,0.18);}

        /* ── Prediction panel ── */
        .pred-panel{background:var(--bg3);border-top:1px solid var(--border);}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        .pred-panel{animation:fadeIn 0.28s ease;}

        /* ── Probability bar ── */
        .prob-bar-track{height:4px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden;position:relative;}
        .prob-bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#c8f135,#9fd420);transition:width 0.7s cubic-bezier(.25,.8,.25,1);}
        .prob-bar-fill2{height:100%;border-radius:999px;background:rgba(255,255,255,0.15);transition:width 0.7s cubic-bezier(.25,.8,.25,1);}
        .pct-num{font-family:'Bebas Neue',cursive;font-size:48px;line-height:1;letter-spacing:0.02em;}

        /* ── Tags ── */
        .tag{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;padding:3px 9px;border-radius:6px;background:var(--acid-dim);color:var(--acid);border:1px solid rgba(200,241,53,0.18);white-space:nowrap;}
        .tag-g{background:rgba(255,255,255,0.04);color:var(--muted);border-color:rgba(255,255,255,0.07);}

        /* ── Factor cards ── */
        .factor-card{border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;background:rgba(255,255,255,0.02);transition:border-color 0.2s;}
        .factor-card:hover{border-color:rgba(255,255,255,0.1);}
        .factor-pct{font-family:'Bebas Neue',cursive;font-size:28px;line-height:1;color:var(--acid);}
        .adv-badge{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.08em;text-transform:uppercase;padding:3px 8px;border-radius:6px;white-space:nowrap;flex-shrink:0;}
        .adv-p1{background:rgba(200,241,53,0.15);color:var(--acid);border:1px solid rgba(200,241,53,0.3);}
        .adv-p2{background:rgba(255,80,80,0.12);color:#ff8080;border:1px solid rgba(255,80,80,0.25);}
        .adv-n{background:rgba(255,255,255,0.05);color:var(--muted);border:1px solid rgba(255,255,255,0.08);}

        /* ── Risk badge ── */
        .risk-badge{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:10px;background:rgba(180,20,20,0.12);border:1px solid rgba(220,50,50,0.3);}
        .risk-label{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#ff6060;flex-shrink:0;margin-top:1px;}

        /* ── Narrative ── */
        .narrative-block{padding:20px 22px;border-radius:14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);}
        .narrative-label{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:var(--acid);margin-bottom:12px;}
        .narrative-sep{height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent);margin:14px 0;}
        .narrative-para{font-family:'Playfair Display',serif;font-size:14.5px;line-height:1.85;color:rgba(255,255,255,0.72);}
        .narrative-para.last-para{font-style:italic;color:rgba(255,255,255,0.65);}
        .drop-cap::first-letter{font-family:'Playfair Display',serif;font-size:3.2em;font-weight:700;color:var(--acid);float:left;line-height:0.78;margin-right:6px;margin-top:6px;}
        .weapon-tag{display:inline-block;font-family:'DM Sans',sans-serif;font-size:11px;letter-spacing:0.02em;padding:3px 10px;border-radius:6px;background:rgba(200,241,53,0.1);color:var(--acid);border:1px solid rgba(200,241,53,0.2);margin-right:6px;margin-bottom:4px;}
        .conf-tag{display:inline-block;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.08em;padding:3px 9px;border-radius:6px;margin-right:6px;}
        .conf-alta{background:rgba(200,241,53,0.1);color:var(--acid);border:1px solid rgba(200,241,53,0.2);}
        .conf-moderada{background:rgba(255,180,0,0.08);color:#f5a623;border:1px solid rgba(255,180,0,0.2);}
        .conf-baja{background:rgba(255,100,100,0.08);color:#ff8080;border:1px solid rgba(255,100,100,0.18);}

        /* ── Misc ── */
        .avatar{border-radius:50%;object-fit:cover;object-position:top;background:var(--bg3);flex-shrink:0;}
        .score-str{font-family:'Space Mono',monospace;font-size:11px;color:var(--acid);letter-spacing:0.05em;}
        .pred-result-ok{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;padding:3px 8px;border-radius:5px;background:rgba(200,241,53,0.12);color:var(--acid);border:1px solid rgba(200,241,53,0.25);}
        .pred-result-ko{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;padding:3px 8px;border-radius:5px;background:rgba(255,100,100,0.1);color:#ff8080;border:1px solid rgba(255,100,100,0.2);}
        .insight-dot{width:5px;height:5px;border-radius:50%;background:var(--acid);flex-shrink:0;margin-top:5px;}
        .noise{background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.02'/%3E%3C/svg%3E");pointer-events:none;position:fixed;inset:0;z-index:999;}
        .section-sep{height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.07) 20%,rgba(255,255,255,0.07) 80%,transparent);}

        /* ── Weather section ── */
        .weather-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 16px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:12px;min-width:72px;}
        .weather-icon{font-size:24px;line-height:1;}
        .weather-val{font-family:'Bebas Neue',cursive;font-size:22px;line-height:1;color:white;}
        .weather-lbl{font-family:'Space Mono',monospace;font-size:8px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);}

        /* ── Responsive ── */
        @media(max-width:640px){
          .match-card .p-5{padding:14px;}
          .match-card .flex-wrap{flex-wrap:wrap;}
          .pred-panel{padding:16px;}
          .narrative-para{font-size:13.5px;}
          .pct-num{font-size:38px;}
        }
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
            <a href="/historico" className="md:hidden nav-link" style={{ fontSize: "10px" }}>HISTÓRICO</a>
            <div className="live-badge">
              <div className="live-dot" />
              <span className="fm" style={{ fontSize: "10px", color: "var(--acid)", letterSpacing: "0.1em" }}>LIVE</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-grid px-6 pt-16 pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="slabel mb-5">Análisis automático · ATP Tour</div>
          <h1 className="fd leading-[0.88] mb-5 text-white" style={{ fontSize: "clamp(60px,8.5vw,108px)" }}>
            TODOS LOS PARTIDOS ATP.
          </h1>
          <h1 className="fd leading-[0.88] mb-6 glow" style={{ fontSize: "clamp(70px,10vw,130px)", color: "var(--acid)" }}>
            ANALIZADOS.
          </h1>
          <p className="fb mb-10" style={{ color: "var(--muted)", maxWidth: "480px", fontSize: "13px", letterSpacing: "0.025em", lineHeight: 1.8 }}>
            Patrones de jugadores, condiciones climáticas, superficie, turno y psicología —<br />
            cruzados automáticamente para cada partido del día.
          </p>

          {/* Ranking carousel */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="slabel">Ranking ATP</div>
                {!loading && (
                  <span className="fm" style={{ fontSize: "9px", color: "var(--muted)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                    {rankSource === "live" ? <><span style={{ color: "var(--acid)" }}>●</span> En vivo · {players.length} jugadores</> : <>Top {players.length} · datos oficiales</>}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button className="scroll-btn" onClick={() => scroll("left")}>←</button>
                <button className="scroll-btn" onClick={() => scroll("right")}>→</button>
              </div>
            </div>
            <div className="carousel" ref={carouselRef}>
              {loading ? Array.from({ length: 10 }).map((_, i) => <div key={i} className="p-card-skeleton" />) :
                players.length === 0 ? <div className="fm text-xs" style={{ color: "var(--muted)" }}>No se pudieron cargar los rankings.</div> :
                players.map((p) => (
                  <a key={p.rank} href={`/player/${lastName(p.name)}`} className="p-card" style={{ textDecoration: "none", color: "inherit" }}>
                    <img src={p.photo} alt={p.name} referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="fd text-2xl" style={{ color: "var(--acid)" }}>#{p.rank}</span>
                        <span className="text-base">{p.country}</span>
                      </div>
                      <div className="fb font-semibold text-sm leading-tight mb-1">{p.name}</div>
                      {p.points && <div className="fm text-[10px]" style={{ color: "var(--muted)" }}>{p.points} pts</div>}
                    </div>
                  </a>
                ))
              }
            </div>
          </div>
        </div>
      </section>

      {/* Separador */}
      <div className="section-sep" />

      {/* Partidos */}
      <section className="px-6 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Selector de día */}
          <div className="flex gap-2 mb-8 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {weekDays.map((day) => {
              const d = new Date(day + "T12:00:00");
              const isSelected = day === selectedDate;
              const isToday2 = day === todayStr;
              return (
                <button key={day} className={`day-btn${isSelected ? " active" : ""}`} onClick={() => setSelectedDate(day)}>
                  <span className="day-name">{isToday2 ? "Hoy" : d.toLocaleDateString("es-ES", { weekday: "short" })}</span>
                  <span className="day-num">{d.getDate()}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="slabel mb-2">
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </div>
              <h2 className="fd tracking-wide" style={{ fontSize: "clamp(32px,5vw,48px)" }}>
                {selectedDate === todayStr ? "PARTIDOS ATP HOY" : "RESULTADOS ATP"}
              </h2>
            </div>
            <div className="flex items-center gap-2 fm" style={{ color: "var(--muted)", fontSize: "10px" }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--acid)" }} />
              {matchesLoading ? "Cargando..." : `${matches.length} partidos · ATP singles`}
            </div>
          </div>

          {matchesLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="rounded-2xl h-24 p-card-skeleton" />)}
            </div>
          ) : matches.length === 0 ? (
            <div className="fm text-sm" style={{ color: "var(--muted)" }}>No hay partidos ATP programados.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {matches.map((m, idx) => {
                const surfColor = SURFACE_COLOR[m.surface] ?? "rgba(255,255,255,0.2)";
                const surfLabel = SURFACE_ES[m.surface] ?? m.surface;
                const surfIcon = SURFACE_ICON[m.surface] ?? "";
                const isFinished = m.status === "finished";
                const isLive = m.status === "live";
                const isExpanded = expandedMatch === m.id;
                const pred = predictions[m.id];
                const isLoadingPred = loadingPred[m.id];
                const outcome = isFinished && pred ? predictionOutcome(m, pred) : null;
                const tourneyLevel = inferTourneyLevel(m.tournament);
                const levelCls = tourneyLevel === "grand-slam" ? " level-gs" : tourneyLevel === "masters-1000" ? " level-m1k" : "";
                const outcomeClass = outcome ? ` outcome-${outcome}` : "";
                const levelBorder = LEVEL_BORDER[tourneyLevel];
                const levelGlow = LEVEL_GLOW[tourneyLevel];

                const p1Slug = resolveSlug(m.player1Slug, m.player1);
                const p2Slug = resolveSlug(m.player2Slug, m.player2);

                return (
                  <div
                    key={m.id}
                    className={`match-card card-anim${isExpanded ? " expanded" : ""}${outcomeClass}${levelCls}`}
                    style={{
                      animationDelay: `${idx * 45}ms`,
                      opacity: isFinished && !outcome ? 0.78 : 1,
                      ...(levelBorder && !outcome ? { borderColor: levelBorder } : {}),
                      ...(levelGlow && !isExpanded && !outcome ? { boxShadow: levelGlow } : {}),
                    }}
                  >
                    {outcome && <div className={`outcome-dot ${outcome}`} title={outcome === "correct" ? "Predicción correcta" : outcome === "wrong" ? "Predicción fallida" : "Muy igualado"} />}

                    {/* GS / M1000 label */}
                    {(tourneyLevel === "grand-slam" || tourneyLevel === "masters-1000") && !outcome && (
                      <div className="absolute top-0 left-0 px-3 py-0.5 rounded-br-lg" style={{
                        background: tourneyLevel === "grand-slam" ? "rgba(255,215,0,0.12)" : "rgba(200,241,53,0.08)",
                        borderBottom: `1px solid ${levelBorder}`, borderRight: `1px solid ${levelBorder}`,
                        fontSize: "9px", fontFamily: "'Space Mono',monospace", letterSpacing: "0.12em",
                        color: tourneyLevel === "grand-slam" ? "#ffd700" : "var(--acid)", textTransform: "uppercase",
                      }}>
                        {tourneyLevel === "grand-slam" ? "Grand Slam" : "Masters 1000"}
                      </div>
                    )}

                    {/* Fila principal */}
                    <div
                      className="p-5 flex flex-wrap items-center gap-4"
                      style={{ paddingTop: (tourneyLevel === "grand-slam" || tourneyLevel === "masters-1000") && !outcome ? "26px" : undefined }}
                      onClick={() => handleMatchClick(m)}
                    >
                      {/* Hora + estado */}
                      <div className="flex flex-col items-center" style={{ minWidth: 52, flexShrink: 0 }}>
                        <span className="fd text-2xl" style={{ color: isLive ? "#c8f135" : isFinished ? "var(--muted)" : "white", lineHeight: 1 }}>
                          {m.time || "—"}
                        </span>
                        {isLive && (
                          <div className="live-badge mt-1" style={{ padding: "2px 7px" }}>
                            <div className="live-dot" style={{ width: 6, height: 6 }} />
                            <span className="fm" style={{ fontSize: "8px", color: "var(--acid)", letterSpacing: "0.1em" }}>LIVE</span>
                          </div>
                        )}
                        {isFinished && <span className="fm text-[9px] tracking-widest" style={{ color: "var(--muted)" }}>FIN</span>}
                        {isFinished && m.score && <span className="score-str mt-0.5">{m.score}</span>}
                      </div>

                      {/* Jugador 1 */}
                      <a href={`/player/${p1Slug}`} onClick={(e) => e.stopPropagation()}
                        style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", minWidth: 0 }}>
                        <PlayerPhoto name={m.player1} slug={p1Slug} rankingMap={rankingMap} size={52}
                          style={{ border: `2px solid ${isFinished && m.winner === "player1" ? "var(--acid)" : "rgba(255,255,255,0.08)"}`, opacity: isFinished && m.winner === "player2" ? 0.4 : 1 }} />
                        <div style={{ minWidth: 0 }}>
                          <div className={`fb text-base leading-tight ${isFinished && m.winner === "player2" ? "font-normal" : "font-semibold"}`}
                            style={{ color: isFinished && m.winner === "player1" ? "var(--acid)" : isFinished && m.winner === "player2" ? "rgba(255,255,255,0.3)" : "white" }}>
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

                      {/* Jugador 2 */}
                      <a href={`/player/${p2Slug}`} onClick={(e) => e.stopPropagation()}
                        style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", minWidth: 0 }}>
                        <PlayerPhoto name={m.player2} slug={p2Slug} rankingMap={rankingMap} size={52}
                          style={{ border: `2px solid ${isFinished && m.winner === "player2" ? "var(--acid)" : "rgba(255,255,255,0.08)"}`, opacity: isFinished && m.winner === "player1" ? 0.4 : 1 }} />
                        <div style={{ minWidth: 0 }}>
                          <div className={`fb text-base leading-tight ${isFinished && m.winner === "player1" ? "font-normal" : "font-semibold"}`}
                            style={{ color: isFinished && m.winner === "player2" ? "var(--acid)" : isFinished && m.winner === "player1" ? "rgba(255,255,255,0.3)" : "white" }}>
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

                      {/* Torneo + badges */}
                      <div className="flex flex-wrap gap-2 items-center ml-auto">
                        <span className="tag tag-g">{m.tournament}</span>
                        {m.round && (
                          <span className="tag" style={/^Q\d?$/i.test(m.round)
                            ? { background: "rgba(255,180,0,0.08)", color: "#f5a623", borderColor: "rgba(255,180,0,0.2)" }
                            : { background: "rgba(255,255,255,0.04)", color: "var(--muted)", borderColor: "rgba(255,255,255,0.06)" }}>
                            {/^Q\d?$/i.test(m.round) ? "Q" : m.round}
                          </span>
                        )}
                        <span className="tag" style={{ background: `${surfColor}18`, color: surfColor, borderColor: `${surfColor}40` }}>
                          {surfIcon} {surfLabel}
                        </span>
                        <span className="fm text-[9px]" style={{ color: "var(--muted)" }}>{isExpanded ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {/* Panel de predicción expandido */}
                    {isExpanded && (
                      <div className="pred-panel">
                        {isLoadingPred && (
                          <div className="fm text-xs text-center py-6" style={{ color: "var(--muted)" }}>Calculando predicción…</div>
                        )}
                        {!isLoadingPred && !pred && (
                          <div className="fm text-xs text-center py-6" style={{ color: "var(--muted)" }}>No hay datos suficientes para este partido.</div>
                        )}
                        {pred && (
                          <div style={{ padding: "24px" }}>
                            {/* Header: fotos grandes + porcentajes */}
                            <div className="flex items-center gap-6 mb-6">
                              {/* Jugador 1 */}
                              <div className="flex flex-col items-center gap-2" style={{ minWidth: 72 }}>
                                <PlayerPhoto name={m.player1} slug={p1Slug} rankingMap={rankingMap} size={72}
                                  style={{ border: "2px solid rgba(200,241,53,0.3)" }} />
                                <div className="pct-num" style={{ color: "var(--acid)" }}>{pred.player1.winPct}%</div>
                                <div className="fb text-xs font-semibold text-center leading-tight" style={{ color: "rgba(255,255,255,0.8)", maxWidth: 80 }}>
                                  {pred.player1.name.split(" ").pop()}
                                </div>
                              </div>

                              {/* Barra central */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ position: "relative", marginBottom: 8 }}>
                                  <div className="prob-bar-track" style={{ height: 6 }}>
                                    <div className="prob-bar-fill" style={{ width: `${pred.player1.winPct}%` }} />
                                  </div>
                                </div>
                                <div className="prob-bar-track" style={{ height: 6, transform: "scaleX(-1)" }}>
                                  <div className="prob-bar-fill" style={{ width: `${pred.player2.winPct}%`, background: "rgba(255,255,255,0.2)" }} />
                                </div>
                                {/* Resultado real */}
                                {isFinished && m.winner && (() => {
                                  const predWinner = pred.player1.winPct > pred.player2.winPct ? "player1" : "player2";
                                  const correct = predWinner === m.winner;
                                  const winnerName = m.winner === "player1" ? pred.player1.name : pred.player2.name;
                                  return (
                                    <div className="flex items-center gap-2 mt-3 justify-center">
                                      <span className={correct ? "pred-result-ok" : "pred-result-ko"}>
                                        {correct ? "✓ Predicción correcta" : "✗ Predicción incorrecta"}
                                      </span>
                                      <span className="fm text-[10px]" style={{ color: "var(--muted)" }}>
                                        Ganó {winnerName.split(" ").pop()} · {m.score}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Jugador 2 */}
                              <div className="flex flex-col items-center gap-2" style={{ minWidth: 72 }}>
                                <PlayerPhoto name={m.player2} slug={p2Slug} rankingMap={rankingMap} size={72}
                                  style={{ border: "2px solid rgba(255,255,255,0.1)" }} />
                                <div className="pct-num" style={{ color: "rgba(255,255,255,0.5)" }}>{pred.player2.winPct}%</div>
                                <div className="fb text-xs font-semibold text-center leading-tight" style={{ color: "rgba(255,255,255,0.5)", maxWidth: 80 }}>
                                  {pred.player2.name.split(" ").pop()}
                                </div>
                              </div>
                            </div>

                            {/* Condiciones del partido */}
                            {pred.weather && (
                              <div className="mb-6">
                                <div className="slabel mb-3">Condiciones</div>
                                <div className="flex gap-3 flex-wrap">
                                  <div className="weather-card">
                                    <span className="weather-icon">🌡</span>
                                    <span className="weather-val">{pred.weather.temp.toFixed(0)}°</span>
                                    <span className="weather-lbl">Temp.</span>
                                  </div>
                                  <div className="weather-card">
                                    <span className="weather-icon">💨</span>
                                    <span className="weather-val">{pred.weather.windSpeed.toFixed(0)}</span>
                                    <span className="weather-lbl">km/h</span>
                                  </div>
                                  <div className="weather-card">
                                    <span className="weather-icon">💧</span>
                                    <span className="weather-val">{pred.weather.humidity}%</span>
                                    <span className="weather-lbl">Humedad</span>
                                  </div>
                                  {pred.courtModel && (
                                    <div className="weather-card">
                                      <span className="weather-icon">🎾</span>
                                      <span className="weather-val">{pred.courtModel.speed}</span>
                                      <span className="weather-lbl">CSI</span>
                                    </div>
                                  )}
                                  {pred.h2h.total > 0 && (
                                    <div className="weather-card">
                                      <span className="weather-icon">⚔️</span>
                                      <span className="weather-val">{pred.h2h.p1Wins}–{pred.h2h.p2Wins}</span>
                                      <span className="weather-lbl">H2H</span>
                                    </div>
                                  )}
                                </div>
                                {pred.weather.effect !== "condiciones normales" && (
                                  <div className="mt-2 fm text-[10px] px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", color: "var(--muted)" }}>
                                    ☁ {pred.weather.effect}{pred.weather.source === "static" ? " (estimado)" : ""}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Análisis narrativo */}
                            {pred.tacticalAnalysis && (
                              <div className="narrative-block mb-6">
                                <div className="narrative-label">Análisis del partido</div>
                                <div className="mb-3 flex flex-wrap gap-1">
                                  {pred.tacticalAnalysis.keyWeapon && (
                                    <span className="weapon-tag">⚡ {pred.tacticalAnalysis.keyWeapon.split(" — ")[0].split("(")[0].trim().slice(0, 60)}</span>
                                  )}
                                  <span className={`conf-tag conf-${pred.tacticalAnalysis.confidence}`}>
                                    Confianza {pred.tacticalAnalysis.confidence}
                                  </span>
                                  <span className="tag tag-g">Conf. {pred.confidence}%</span>
                                </div>
                                {(() => {
                                  const paras = pred.tacticalAnalysis.narrative.split("\n\n").filter(Boolean);
                                  return paras.map((para, i) => {
                                    const isLast = i === paras.length - 1;
                                    const highlighted = highlightNarrative(para, pred.player1.name, pred.player2.name);
                                    return (
                                      <div key={i}>
                                        {i > 0 && <div className="narrative-sep" />}
                                        <p
                                          className={`narrative-para${i === 0 ? " drop-cap" : ""}${isLast ? " last-para" : ""}`}
                                          dangerouslySetInnerHTML={{ __html: highlighted }}
                                        />
                                      </div>
                                    );
                                  });
                                })()}
                                {pred.tacticalAnalysis.riskFactor && (
                                  <div className="risk-badge mt-4">
                                    <span className="risk-label">⚠ Riesgo</span>
                                    <span className="fb leading-snug" style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)" }}>
                                      {pred.tacticalAnalysis.riskFactor}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Razón principal */}
                            {pred.mainReason && (
                              <div className="mb-5 flex gap-2 items-start px-3 py-2.5 rounded-xl" style={{ background: "rgba(200,241,53,0.06)", border: "1px solid rgba(200,241,53,0.15)" }}>
                                <div className="insight-dot mt-1" />
                                <span className="fb leading-snug" style={{ fontSize: "13px", color: "rgba(255,255,255,0.85)" }}>{pred.mainReason}</span>
                              </div>
                            )}

                            {/* Alertas de confianza por jugador */}
                            {pred.playerConfidence && (
                              <>
                                {pred.playerConfidence.p1.tier !== "high" && (
                                  <div className="mb-2 flex gap-2 items-start px-3 py-2 rounded-lg" style={{ background: "rgba(255,180,0,0.06)", border: "1px solid rgba(255,180,0,0.18)" }}>
                                    <span style={{ color: "#f5a623", fontSize: 13, lineHeight: 1.4 }}>⚠</span>
                                    <span className="fm leading-snug" style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)" }}>
                                      <span style={{ color: "#f5a623", fontWeight: 600 }}>{pred.player1.name.split(" ").pop()}: </span>
                                      {pred.playerConfidence.p1.label}
                                    </span>
                                  </div>
                                )}
                                {pred.playerConfidence.p2.tier !== "high" && (
                                  <div className="mb-2 flex gap-2 items-start px-3 py-2 rounded-lg" style={{ background: "rgba(255,180,0,0.06)", border: "1px solid rgba(255,180,0,0.18)" }}>
                                    <span style={{ color: "#f5a623", fontSize: 13, lineHeight: 1.4 }}>⚠</span>
                                    <span className="fm leading-snug" style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)" }}>
                                      <span style={{ color: "#f5a623", fontWeight: 600 }}>{pred.player2.name.split(" ").pop()}: </span>
                                      {pred.playerConfidence.p2.label}
                                    </span>
                                  </div>
                                )}
                                {pred.playerConfidence.adjustmentNote && (
                                  <div className="mb-4 px-3 py-2 rounded-lg fm" style={{ fontSize: "11px", background: "rgba(255,255,255,0.03)", color: "var(--muted)" }}>
                                    {pred.playerConfidence.adjustmentNote}
                                  </div>
                                )}
                              </>
                            )}

                            {/* Factores determinantes — tarjetas */}
                            <div className="slabel mb-3">Factores determinantes</div>
                            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
                              {pred.keyPatterns.map((f: FactorResult) => (
                                <div key={f.id} className="factor-card">
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div>
                                      <div className="factor-pct">{Math.round((f.effectiveWeight ?? f.baseWeight ?? 0) * 100)}%</div>
                                      <div className="fb font-medium leading-tight" style={{ fontSize: "12px", color: "rgba(255,255,255,0.85)", marginTop: 2 }}>{f.label}</div>
                                    </div>
                                    <span className={`adv-badge ${f.winner === "p1" ? "adv-p1" : f.winner === "p2" ? "adv-p2" : "adv-n"}`}>
                                      {f.winner === "p1" ? `↑ ${pred.player1.name.split(" ").pop()}` : f.winner === "p2" ? `↑ ${pred.player2.name.split(" ").pop()}` : "Par"}
                                    </span>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <div className="flex justify-between">
                                      <span className="fm" style={{ fontSize: "10px", color: "var(--acid)" }}>{pred.player1.name.split(" ").pop()}</span>
                                      <span className="fm" style={{ fontSize: "10px", color: "var(--acid)" }}>{f.p1Label}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="fm" style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>{pred.player2.name.split(" ").pop()}</span>
                                      <span className="fm" style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>{f.p2Label}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Todos los factores desplegable */}
                            {pred.allFactors && pred.allFactors.length > 3 && (
                              <details className="mt-3">
                                <summary className="fm cursor-pointer" style={{ fontSize: "10px", color: "var(--muted)", letterSpacing: "0.1em", userSelect: "none" }}>
                                  VER LOS {pred.allFactors.length} FACTORES
                                </summary>
                                <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))" }}>
                                  {pred.allFactors.filter((f: FactorResult) => !pred.keyPatterns.find((k: FactorResult) => k.id === f.id)).map((f: FactorResult) => (
                                    <div key={f.id} className="factor-card" style={{ opacity: f.hasData ? 0.75 : 0.35 }}>
                                      <div className="flex items-start justify-between gap-2 mb-2">
                                        <div>
                                          <div className="factor-pct" style={{ fontSize: "22px" }}>{Math.round((f.effectiveWeight ?? f.baseWeight ?? 0) * 100)}%</div>
                                          <div className="fb" style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{f.label}</div>
                                        </div>
                                        <span className={`adv-badge ${f.winner === "p1" ? "adv-p1" : f.winner === "p2" ? "adv-p2" : "adv-n"}`} style={{ fontSize: "8px" }}>
                                          {f.winner === "p1" ? `↑ ${pred.player1.name.split(" ").pop()}` : f.winner === "p2" ? `↑ ${pred.player2.name.split(" ").pop()}` : "Par"}
                                        </span>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <div className="flex justify-between">
                                          <span className="fm" style={{ fontSize: "9px", color: "rgba(200,241,53,0.7)" }}>{pred.player1.name.split(" ").pop()}</span>
                                          <span className="fm" style={{ fontSize: "9px", color: "rgba(200,241,53,0.7)" }}>{f.p1Label}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="fm" style={{ fontSize: "9px", color: "rgba(255,255,255,0.28)" }}>{pred.player2.name.split(" ").pop()}</span>
                                          <span className="fm" style={{ fontSize: "9px", color: "rgba(255,255,255,0.28)" }}>{f.p2Label}</span>
                                        </div>
                                        {!f.hasData && <span className="fm" style={{ fontSize: "9px", color: "var(--muted)" }}>sin datos</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </details>
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

      {/* Separador */}
      <div className="section-sep" />

      {/* Cómo funciona */}
      <section className="px-6 pb-16 pt-12">
        <div className="max-w-6xl mx-auto">
          <div className="slabel mb-2">Metodología</div>
          <h2 className="fd tracking-wide mb-8" style={{ fontSize: "clamp(32px,5vw,48px)" }}>CÓMO FUNCIONA</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { n: "01", title: "Detección automática", desc: "Cada mañana el sistema detecta todos los partidos ATP programados del día en cualquier torneo activo." },
              { n: "02", title: "Cruce de patrones", desc: "Cruza los patrones de cada jugador — superficie, turno, clima, H2H, forma reciente y psicología — con las condiciones reales del partido." },
              { n: "03", title: "Porcentaje de victoria", desc: "Genera un porcentaje de victoria basado en datos objetivos. Se actualiza si cambian las condiciones antes del partido." },
            ].map((s, i) => (
              <div key={i} className="rounded-xl p-6" style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}>
                <div className="fd text-5xl mb-3" style={{ color: "var(--acid)", opacity: 0.22 }}>{s.n}</div>
                <div className="fb font-semibold text-base mb-2">{s.title}</div>
                <div className="fb leading-relaxed" style={{ fontSize: "14px", color: "var(--muted)" }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="section-sep" />
      <footer className="px-6 py-8">
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
