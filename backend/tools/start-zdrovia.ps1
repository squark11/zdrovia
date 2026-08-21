# Uruchamia backend Zdrovia (Node.js + Express + Socket.io).
# Konfiguracja pochodzi z backend/.env — ten skrypt nic nie nadpisuje.
#
# Ręczny start:
#   powershell -ExecutionPolicy Bypass -File "C:\Sklep\zdrovia\backend\tools\start-zdrovia.ps1"
#
# Automatycznie uruchamiany przy starcie systemu przez zadanie
# harmonogramu "Zdrovia Backend" (konto SYSTEM).

$ErrorActionPreference = 'Stop'

# tools/ leży w backend/, więc katalog aplikacji to poziom wyżej.
$backendDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $backendDir

$logDir = Join-Path $backendDir 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

# Log dzienny; przy starcie kasujemy pliki starsze niż 14 dni, żeby
# katalog nie rósł w nieskończoność na serwerze bez nadzoru.
$stamp = Get-Date -Format 'yyyy-MM-dd'
$logFile = Join-Path $logDir "backend-$stamp.log"
Get-ChildItem $logDir -Filter 'backend-*.log' -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

# Ścieżka podana wprost — zadanie startuje jako SYSTEM, który ma inne
# PATH niż Administrator.
$nodeExe = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $nodeExe)) {
    $found = Get-Command node -ErrorAction SilentlyContinue
    if ($null -eq $found) { throw 'Nie znaleziono node.exe. Zainstaluj Node.js 18+.' }
    $nodeExe = $found.Source
}

if (-not (Test-Path (Join-Path $backendDir '.env'))) {
    throw "Brak pliku .env w $backendDir. Skopiuj .env.example i uzupelnij."
}
if (-not (Test-Path (Join-Path $backendDir 'node_modules'))) {
    throw "Brak node_modules w $backendDir. Uruchom: npm install"
}

"[$(Get-Date -Format o)] Start backendu Zdrovia" | Out-File -FilePath $logFile -Encoding utf8 -Append

# Przekierowanie przez cmd, a nie operatorem PowerShella: PS 5.1 zapisuje
# strumien jako UTF-16, przez co polskie znaki w logu sa nieczytelne.
# cmd kopiuje bajty 1:1, wiec log zostaje w UTF-8 tak jak go pisze Node.
# 2>&1 laczy stderr z stdout - bez tego bledy startu ginely bez sladu.
& cmd.exe /c "`"$nodeExe`" src\server.js >> `"$logFile`" 2>&1"
