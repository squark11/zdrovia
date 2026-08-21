# Restart backendu Zdrovia po odnowieniu certyfikatu.
#
# Node wczytuje certyfikat RAZ, przy starcie — po odnowieniu przez win-acme
# serwer nadal trzymalby stary, az do wygasniecia. Ten skrypt podnosi go
# ponownie, zeby podjal swiezy material TLS.
#
# Podpiecie do win-acme (jako skrypt instalacyjny reguly odnawiania):
#   Script:           powershell.exe
#   ScriptParameters: -NoProfile -ExecutionPolicy Bypass -File "C:\Sklep\zdrovia\backend\tools\restart-after-renewal.ps1"

$ErrorActionPreference = 'Stop'
$taskName = 'Zdrovia Backend'

Write-Host "[$(Get-Date -Format o)] Restart zadania '$taskName' po odnowieniu certyfikatu."

Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# Stop-ScheduledTask nie zawsze ubija proces potomny node.exe — domykamy go
# po porcie, zeby ponowny start nie trafil na zajete gniazdo.
$port = 45003
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $procId = $conn.OwningProcess | Select-Object -First 1
    Write-Host "Domykam proces PID $procId trzymajacy port $port."
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 6

$check = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($check) {
    Write-Host "OK - backend nasluchuje na porcie $port."
    exit 0
}
Write-Error "Backend nie wstal na porcie $port. Sprawdz backend\logs\."
exit 1
