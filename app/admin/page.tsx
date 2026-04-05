"use client";
import { useEffect, useState } from "react";

interface RankingStatus {
  status: string;
  count?: number;
  updatedAt?: string | null;
  daysAgo?: number;
  top10?: string[];
}

interface UpdateResult {
  ok: boolean;
  source?: string;
  count?: number;
  message?: string;
  top5?: string[];
  error?: string;
  dbStatus?: string;
  updatedAt?: string;
}

export default function AdminPage() {
  const [rankStatus, setRankStatus] = useState<RankingStatus | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);

  const loadStatus = () => {
    fetch("/api/admin/update-rankings")
      .then((r) => r.json())
      .then(setRankStatus)
      .catch(() => {});
  };

  useEffect(() => { loadStatus(); }, []);

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateResult(null);
    try {
      const res = await fetch("/api/admin/update-rankings", { method: "POST" });
      const data = await res.json() as UpdateResult;
      setUpdateResult(data);
      if (data.ok) loadStatus();
    } catch {
      setUpdateResult({ ok: false, error: "Error de red" });
    } finally {
      setUpdating(false);
    }
  };

  const daysColor = rankStatus?.daysAgo == null ? "#666"
    : rankStatus.daysAgo <= 3 ? "#c8f135"
    : rankStatus.daysAgo <= 7 ? "#f5a623"
    : "#ff6060";

  return (
    <div style={{ minHeight: "100vh", background: "#080c10", color: "white", fontFamily: "monospace" }}>
      <nav style={{ borderBottom: "1px solid #1a2332", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/" style={{ textDecoration: "none", color: "inherit", display: "flex", gap: 8 }}>
          <span style={{ color: "#c8f135", fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>ALLDATA</span>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>TENNIS</span>
        </a>
        <span style={{ fontSize: 10, letterSpacing: "0.2em", color: "#4a6080", textTransform: "uppercase" }}>Admin</span>
      </nav>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: "#c8f135", letterSpacing: 2 }}>PANEL DE ADMINISTRACIÓN</h1>
        <p style={{ color: "#4a6080", fontSize: 12, marginBottom: 40, letterSpacing: "0.1em" }}>Actualización de datos del sistema</p>

        {/* Rankings */}
        <div style={{ background: "#0d1318", border: "1px solid #1a2332", borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, letterSpacing: "0.1em" }}>RANKING ATP TOP 100</div>
              <div style={{ fontSize: 11, color: "#4a6080" }}>Actualizar cada lunes tras los torneos del fin de semana</div>
            </div>
            <button
              onClick={handleUpdate}
              disabled={updating}
              style={{
                background: updating ? "#1a2332" : "#c8f135",
                color: updating ? "#4a6080" : "#080c10",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                cursor: updating ? "not-allowed" : "pointer",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {updating ? "Actualizando..." : "↻ Actualizar ahora"}
            </button>
          </div>

          {/* Estado actual */}
          {rankStatus && (
            <div style={{ background: "#080c10", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 9, color: "#4a6080", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 3 }}>Estado</div>
                  <div style={{ fontSize: 13, color: rankStatus.status === "ok" ? "#c8f135" : "#ff6060" }}>
                    {rankStatus.status === "ok" ? "✓ En DB" : rankStatus.status}
                  </div>
                </div>
                {rankStatus.count && (
                  <div>
                    <div style={{ fontSize: 9, color: "#4a6080", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 3 }}>Jugadores</div>
                    <div style={{ fontSize: 13 }}>{rankStatus.count}</div>
                  </div>
                )}
                {rankStatus.updatedAt && (
                  <div>
                    <div style={{ fontSize: 9, color: "#4a6080", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 3 }}>Última actualización</div>
                    <div style={{ fontSize: 13, color: daysColor }}>
                      {new Date(rankStatus.updatedAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                      {rankStatus.daysAgo != null && (
                        <span style={{ fontSize: 10, color: "#4a6080", marginLeft: 6 }}>
                          (hace {rankStatus.daysAgo} {rankStatus.daysAgo === 1 ? "día" : "días"})
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {rankStatus.top10 && (
                <div style={{ fontSize: 10, color: "#4a6080", lineHeight: 1.8 }}>
                  {rankStatus.top10.join(" · ")}
                </div>
              )}
            </div>
          )}

          {/* Resultado de la última actualización */}
          {updateResult && (
            <div style={{
              borderRadius: 10, padding: "14px 16px",
              background: updateResult.ok ? "rgba(200,241,53,0.05)" : "rgba(255,96,96,0.05)",
              border: `1px solid ${updateResult.ok ? "rgba(200,241,53,0.2)" : "rgba(255,96,96,0.2)"}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: updateResult.ok ? "#c8f135" : "#ff6060" }}>
                {updateResult.ok ? "✓ " + (updateResult.message ?? "Actualizado") : "✗ " + (updateResult.error ?? "Error")}
              </div>
              {updateResult.ok && updateResult.top5 && (
                <div style={{ fontSize: 10, color: "#4a6080" }}>{updateResult.top5.join(" · ")}</div>
              )}
              {!updateResult.ok && updateResult.dbStatus && (
                <div style={{ fontSize: 10, color: "#4a6080", marginTop: 4 }}>{updateResult.dbStatus}</div>
              )}
            </div>
          )}

          {/* Instrucción si scraping falla */}
          <div style={{ marginTop: 16, padding: "12px 14px", background: "#080c10", borderRadius: 8, border: "1px solid #1a2332" }}>
            <div style={{ fontSize: 9, color: "#4a6080", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>Si el scraping automático falla</div>
            <div style={{ fontSize: 10, color: "#4a6080", lineHeight: 1.7 }}>
              Copia el ranking actual de <a href="https://www.atptour.com/en/rankings/singles" target="_blank" rel="noopener noreferrer" style={{ color: "#c8f135" }}>atptour.com</a> y envíalo como JSON:
            </div>
            <pre style={{ fontSize: 10, color: "#4a6080", marginTop: 8, overflow: "auto" }}>{`curl -X POST /api/admin/update-rankings \\
  -H "Content-Type: application/json" \\
  -d '{"players":[{"rank":1,"name":"Carlos Alcaraz","atpCode":"a0e2","country":"🇪🇸","points":""},...]}'`}</pre>
          </div>
        </div>

        {/* Links a otros admin endpoints */}
        <div style={{ background: "#0d1318", border: "1px solid #1a2332", borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, letterSpacing: "0.1em" }}>OTROS ENDPOINTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Sincronización diaria de partidos", cmd: "POST /api/admin/daily-sync" },
              { label: "Ingestar CSV Sackmann", cmd: "POST /api/admin/ingest-csv" },
              { label: "Calcular court models", cmd: "POST /api/admin/compute-court-models" },
              { label: "Enriquecer rankings de rivales", cmd: "POST /api/admin/enrich-ranks" },
            ].map((item) => (
              <div key={item.cmd} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#080c10", borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: "#6a8080" }}>{item.label}</span>
                <code style={{ fontSize: 10, color: "#4a6080" }}>{item.cmd}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
