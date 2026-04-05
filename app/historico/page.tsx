"use client";
import { useEffect, useState } from "react";
import type { MonthHistory, HistoryMatch } from "../api/history/route";

const SURFACE_COLOR: Record<string, string> = {
  hard: "#4a90e2",
  clay: "#c8693a",
  grass: "#5aa85a",
  carpet: "#9b7bb5",
};

const OUTCOME_COLOR = {
  correct: "#c8f135",
  wrong: "#ff6060",
  close: "#6a8080",
  pending: "#4a5060",
};

const OUTCOME_BG = {
  correct: "rgba(200,241,53,0.06)",
  wrong: "rgba(255,96,96,0.06)",
  close: "rgba(106,128,128,0.06)",
  pending: "rgba(74,80,96,0.06)",
};

const OUTCOME_BORDER = {
  correct: "rgba(200,241,53,0.2)",
  wrong: "rgba(255,96,96,0.2)",
  close: "rgba(106,128,128,0.15)",
  pending: "rgba(74,80,96,0.15)",
};

const OUTCOME_LABEL = {
  correct: "✓",
  wrong: "✗",
  close: "≈",
  pending: "·",
};

function SurfaceDot({ surface }: { surface: string }) {
  const color = SURFACE_COLOR[surface?.toLowerCase()] ?? "#4a6080";
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        marginRight: 5,
        flexShrink: 0,
      }}
    />
  );
}

function MatchRow({ m }: { m: HistoryMatch }) {
  const color = OUTCOME_COLOR[m.outcome];
  const bg = OUTCOME_BG[m.outcome];
  const border = OUTCOME_BORDER[m.outcome];
  const label = OUTCOME_LABEL[m.outcome];

  const maxPct = Math.max(m.predictedPct, 100 - m.predictedPct);
  const favPct = Math.round(maxPct);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 8,
        background: bg,
        border: `1px solid ${border}`,
        marginBottom: 6,
        minHeight: 36,
      }}
    >
      {/* Outcome indicator */}
      <span
        style={{
          fontWeight: 700,
          fontSize: 13,
          color,
          width: 16,
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        {label}
      </span>

      {/* Surface dot */}
      <SurfaceDot surface={m.surface} />

      {/* Players */}
      <span style={{ fontSize: 12, flex: 1, minWidth: 0 }}>
        <span style={{ color: m.predictedPct >= 50 ? color : "#8a9aaa" }}>
          {m.player1}
        </span>
        <span style={{ color: "#3a5060", margin: "0 5px" }}>vs</span>
        <span style={{ color: m.predictedPct < 50 ? color : "#8a9aaa" }}>
          {m.player2}
        </span>
      </span>

      {/* Tournament */}
      <span
        style={{
          fontSize: 10,
          color: "#4a6080",
          maxWidth: 120,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {m.tournament}
      </span>

      {/* Predicted % */}
      <span
        style={{
          fontSize: 10,
          color: m.outcome === "pending" ? "#4a6080" : color,
          fontWeight: 700,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {favPct}%
      </span>
    </div>
  );
}

function MonthCard({ data }: { data: MonthHistory }) {
  const [expanded, setExpanded] = useState(true);
  const resolved = data.correct + data.wrong + data.close;
  const accPct =
    resolved > 0 ? Math.round((data.correct / resolved) * 100) : null;

  return (
    <div
      style={{
        background: "#0d1318",
        border: "1px solid #1a2332",
        borderRadius: 16,
        marginBottom: 20,
        overflow: "hidden",
      }}
    >
      {/* Month header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "18px 24px",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#c8f135",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {data.label}
          </span>
          {accPct !== null && (
            <span
              style={{
                fontSize: 11,
                color: accPct >= 60 ? "#c8f135" : accPct >= 50 ? "#f5a623" : "#ff6060",
                fontWeight: 700,
              }}
            >
              {accPct}% acierto
            </span>
          )}
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <StatBadge value={data.total} label="analizados" color="#8a9aaa" />
          <StatBadge value={data.correct} label="acertados" color="#c8f135" />
          <StatBadge value={data.wrong} label="fallados" color="#ff6060" />
          <StatBadge value={data.close} label="igualados" color="#6a8080" />
          {data.pending > 0 && (
            <StatBadge value={data.pending} label="pendientes" color="#4a5060" />
          )}
          <span style={{ color: "#3a5060", fontSize: 14, marginLeft: 4 }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {/* Match list */}
      {expanded && (
        <div style={{ padding: "0 24px 20px" }}>
          {/* Legend */}
          <div
            style={{
              display: "flex",
              gap: 16,
              marginBottom: 12,
              paddingBottom: 10,
              borderBottom: "1px solid #1a2332",
            }}
          >
            {(["correct", "wrong", "close", "pending"] as const).map((o) => (
              <span
                key={o}
                style={{ fontSize: 10, color: OUTCOME_COLOR[o], display: "flex", alignItems: "center", gap: 4 }}
              >
                <span style={{ fontWeight: 700 }}>{OUTCOME_LABEL[o]}</span>
                {o === "correct" ? "Acertado" : o === "wrong" ? "Fallado" : o === "close" ? "Igualado" : "Pendiente"}
              </span>
            ))}
            <span style={{ fontSize: 10, color: "#4a6080", marginLeft: "auto" }}>
              Jugador favorito en el color del resultado
            </span>
          </div>

          {data.matches.map((m) => (
            <MatchRow key={`${m.matchId}-${m.p1Slug}`} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatBadge({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: "#4a6080", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

export default function HistoricoPage() {
  const [data, setData] = useState<{ months: MonthHistory[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError("Error al cargar el historial"); setLoading(false); });
  }, []);

  const totals = data?.months.reduce(
    (acc, m) => ({
      total: acc.total + m.total,
      correct: acc.correct + m.correct,
      wrong: acc.wrong + m.wrong,
      close: acc.close + m.close,
      pending: acc.pending + m.pending,
    }),
    { total: 0, correct: 0, wrong: 0, close: 0, pending: 0 }
  );

  const resolved = (totals?.correct ?? 0) + (totals?.wrong ?? 0) + (totals?.close ?? 0);
  const globalAcc =
    resolved > 0 ? Math.round(((totals?.correct ?? 0) / resolved) * 100) : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080c10",
        color: "white",
        fontFamily: "monospace",
      }}
    >
      {/* Nav */}
      <nav
        style={{
          borderBottom: "1px solid #1a2332",
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <a
          href="/"
          style={{
            textDecoration: "none",
            color: "inherit",
            display: "flex",
            gap: 8,
          }}
        >
          <span
            style={{
              color: "#c8f135",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            ALLDATA
          </span>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>
            TENNIS
          </span>
        </a>
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "#4a6080",
            textTransform: "uppercase",
          }}
        >
          Histórico
        </span>
      </nav>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        {/* Header */}
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            marginBottom: 8,
            color: "#c8f135",
            letterSpacing: 2,
          }}
        >
          HISTÓRICO DE PRONÓSTICOS
        </h1>
        <p
          style={{
            color: "#4a6080",
            fontSize: 12,
            marginBottom: 32,
            letterSpacing: "0.1em",
          }}
        >
          Registro mensual de partidos analizados y resultados de pronósticos desde abril 2026
        </p>

        {/* Global summary */}
        {totals && totals.total > 0 && (
          <div
            style={{
              background: "#0d1318",
              border: "1px solid #1a2332",
              borderRadius: 16,
              padding: "20px 24px",
              marginBottom: 32,
              display: "flex",
              gap: 32,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "#4a6080",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Resumen global
              </div>
              <div style={{ fontSize: 12, color: "#8a9aaa" }}>
                {totals.total} partidos analizados
                {globalAcc !== null && (
                  <span
                    style={{
                      marginLeft: 10,
                      color:
                        globalAcc >= 60
                          ? "#c8f135"
                          : globalAcc >= 50
                          ? "#f5a623"
                          : "#ff6060",
                      fontWeight: 700,
                    }}
                  >
                    {globalAcc}% de acierto
                  </span>
                )}
              </div>
            </div>
            <StatBadge value={totals.correct} label="acertados" color="#c8f135" />
            <StatBadge value={totals.wrong} label="fallados" color="#ff6060" />
            <StatBadge value={totals.close} label="igualados" color="#6a8080" />
            {totals.pending > 0 && (
              <StatBadge value={totals.pending} label="pendientes" color="#4a5060" />
            )}
            <div style={{ marginLeft: "auto", fontSize: 10, color: "#4a6080", lineHeight: 1.8 }}>
              <div>✓ Acertado → favorito ganó</div>
              <div>✗ Fallado → favorito perdió</div>
              <div>≈ Igualado → pronóstico ≤54% (demasiado parejo)</div>
            </div>
          </div>
        )}

        {/* Content */}
        {loading && (
          <div style={{ color: "#4a6080", textAlign: "center", padding: 60 }}>
            Cargando historial...
          </div>
        )}
        {error && (
          <div style={{ color: "#ff6060", textAlign: "center", padding: 60 }}>
            {error}
          </div>
        )}
        {data && data.months.length === 0 && (
          <div
            style={{
              color: "#4a6080",
              textAlign: "center",
              padding: 60,
              background: "#0d1318",
              borderRadius: 16,
              border: "1px solid #1a2332",
            }}
          >
            No hay pronósticos registrados aún.
            <br />
            <span style={{ fontSize: 11, marginTop: 8, display: "block" }}>
              Los pronósticos se registran automáticamente al analizar un partido.
            </span>
          </div>
        )}
        {data?.months.map((month) => (
          <MonthCard key={month.month} data={month} />
        ))}
      </div>
    </div>
  );
}
