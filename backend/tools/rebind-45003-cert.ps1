# Przepina certyfikat na porcie 45003 po odnowieniu przez win-acme.
#
# Po co: binding HTTP.sys wskazuje certyfikat po ODCISKU PALCA. Odnowienie
# wydaje nowy certyfikat z nowym odciskiem, a skrypt win-acme dla ELMAX-a
# aktualizuje tylko port 45002. Bez tego kroku witryna Zdrovia serwowalaby
# stary certyfikat az do jego wygasniecia.
#
# Skrypt jest idempotentny - gdy binding juz wskazuje aktualny certyfikat,
# nie robi nic. Nigdy nie dotyka portu 45002.
#
# Reczne uruchomienie:
#   powershell -ExecutionPolicy Bypass -File "C:\Sklep\zdrovia\backend\tools\rebind-45003-cert.ps1"

$ErrorActionPreference = 'Stop'

$hostName = 'oferty.elmax.net'
$port     = 45003
# Wlasny appid, rozny od tego przy 45002 - skrypt win-acme zarzadzajacy
# bindingiem ELMAX-a nigdy nie ruszy naszego wpisu.
$appId    = '{a7d3f2b1-9c4e-4f88-b6d1-3e5a8c9f2b40}'

# Najswiezszy wazny certyfikat dla tej nazwy, z kluczem prywatnym.
#
# Dwa filtry sa tu krytyczne. W magazynie lezy takze certyfikat SELF-SIGNED
# dla tej samej nazwy, z pozniejsza data waznosci niz ten od Let's Encrypt -
# samo sortowanie po NotAfter wybraloby wlasnie jego, a przegladarka odrzuca
# taki certyfikat. Dlatego odrzucamy self-signed (wystawca rowny podmiotowi)
# i dodatkowo wymagamy, zeby lancuch zaufania dal sie zbudowac (Verify()).
$cert = Get-ChildItem Cert:\LocalMachine\WebHosting, Cert:\LocalMachine\My -ErrorAction SilentlyContinue |
        Where-Object {
          $_.Subject -like "*$hostName*" -and
          $_.HasPrivateKey -and
          $_.NotAfter -gt (Get-Date) -and
          $_.Issuer -ne $_.Subject -and
          $_.Verify()
        } |
        Sort-Object NotAfter -Descending | Select-Object -First 1

if ($null -eq $cert) { throw "Nie znaleziono waznego certyfikatu dla $hostName." }

$store = if ($cert.PSParentPath -match 'WebHosting') { 'WebHosting' } else { 'MY' }
Write-Host "Aktualny certyfikat: $($cert.Thumbprint) (wazny do $($cert.NotAfter), magazyn $store)"

# Odcisk aktualnie podpiety do portu.
$current = $null
$show = netsh http show sslcert hostnameport="${hostName}:${port}" 2>$null
$m = $show | Select-String 'Certificate Hash\s*:\s*(\S+)'
if ($m) { $current = $m.Matches.Groups[1].Value }

if ($current -and $current -ieq $cert.Thumbprint) {
    Write-Host "Binding na porcie $port juz wskazuje ten certyfikat - nic do zrobienia."
    exit 0
}

if ($current) {
    Write-Host "Binding wskazuje stary certyfikat ($current) - usuwam."
    netsh http delete sslcert hostnameport="${hostName}:${port}" | Out-Null
}

netsh http add sslcert hostnameport="${hostName}:${port}" certhash=$($cert.Thumbprint) appid=$appId certstorename=$store | Out-Null

$check = (netsh http show sslcert hostnameport="${hostName}:${port}" 2>$null |
          Select-String 'Certificate Hash\s*:\s*(\S+)').Matches.Groups[1].Value
if ($check -ieq $cert.Thumbprint) {
    Write-Host "OK - port $port podpiety do certyfikatu $check."
    exit 0
}
Write-Error "Nie udalo sie przepiac certyfikatu na porcie $port."
exit 1
