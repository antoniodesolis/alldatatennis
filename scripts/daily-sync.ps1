# daily-sync.ps1
# Ejecuta el pipeline diario de AllDataTennis y guarda el resultado en log.
# Configurado para correr a las 06:00 AM via Windows Task Scheduler.

$LogFile     = "$PSScriptRoot\daily-sync.log"
$Endpoint    = "http://localhost:3000/api/admin/daily-sync"
$Stamp       = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
# Leer ADMIN_SECRET desde .env.local del proyecto
$EnvFile     = Join-Path $PSScriptRoot "..\\.env.local"
$AdminSecret = ""
if (Test-Path $EnvFile) {
    $AdminSecret = (Get-Content $EnvFile | Where-Object { $_ -match "^ADMIN_SECRET=" }) -replace "^ADMIN_SECRET=", ""
}

function Write-Log {
    param([string]$Message)
    $line = "[$Stamp] $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

Write-Log "--- INICIO daily-sync ---"

# Comprobar que el servidor esta levantado
try {
    $ping = Invoke-WebRequest -Uri "http://localhost:3000" -Method Head -TimeoutSec 5 -ErrorAction Stop
} catch {
    Write-Log "ERROR: El servidor Next.js no responde en localhost:3000. Abortando."
    Write-Log "--- FIN daily-sync (FALLO) ---"
    exit 1
}

# Llamar al endpoint con timeout de 5 minutos (el sync puede tardar)
try {
    $headers = @{ "Content-Type" = "application/json" }
    if ($AdminSecret) { $headers["Authorization"] = "Bearer $AdminSecret" }

    $response = Invoke-RestMethod `
        -Uri $Endpoint `
        -Method POST `
        -Headers $headers `
        -TimeoutSec 300 `
        -ErrorAction Stop

    # Extraer campos clave de la respuesta
    $date          = $response.date
    $ingestMatches = $response.ingest.matches
    $ingestInserted= $response.ingest.inserted
    $resolved      = $response.resolvedPredictions.count
    $calibKeys     = if ($response.calibration) { ($response.calibration | Get-Member -MemberType NoteProperty).Count } else { 0 }
    $patternsPlayers = $response.patternsRecomputed.players
    $accuracy      = $response.learningStats.accuracy

    Write-Log "OK | fecha=$date | partidos=$ingestMatches nuevos=$ingestInserted | predicciones_resueltas=$resolved | factores_calibrados=$calibKeys | jugadores_actualizados=$patternsPlayers | accuracy=$accuracy"

} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errMsg     = $_.Exception.Message
    Write-Log "ERROR HTTP $statusCode | $errMsg"
    Write-Log "--- FIN daily-sync (FALLO) ---"
    exit 1
}

Write-Log "--- FIN daily-sync (OK) ---"

# Rotar log: mantener solo las ultimas 500 lineas
if (Test-Path $LogFile) {
    $lines = Get-Content $LogFile -Encoding UTF8
    if ($lines.Count -gt 500) {
        $lines | Select-Object -Last 500 | Set-Content $LogFile -Encoding UTF8
    }
}
