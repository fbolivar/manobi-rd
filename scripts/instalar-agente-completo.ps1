# ============================================
# Manobi-RD - Instalacion Completa del Agente
# Ejecutar como Administrador en PowerShell
# ============================================

param(
    [string]$Server = "http://192.168.50.5:3001"
)

$ErrorActionPreference = 'SilentlyContinue'
$InstallDir = "C:\ManobiRD"
$RepoBase = "https://raw.githubusercontent.com/fbolivar/manobi-rd/main/agent-node"

Write-Host ""
Write-Host "  Manobi-RD - Instalador de Agente" -ForegroundColor Cyan
Write-Host "  Parques Nacionales Naturales de Colombia" -ForegroundColor Cyan
Write-Host ""

# Verificar admin
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "  ERROR: Ejecutar como Administrador" -ForegroundColor Red
    exit 1
}

# Verificar Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  [0/5] Instalando Node.js..." -ForegroundColor Yellow
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi" -OutFile "$env:TEMP\node.msi" -UseBasicParsing
    Start-Process msiexec.exe -Wait -ArgumentList "/i $env:TEMP\node.msi /quiet"
    $env:PATH += ";C:\Program Files\nodejs"
    Write-Host "  Node.js instalado" -ForegroundColor Green
}

Write-Host "  [1/5] Creando directorio..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host "  [2/5] Descargando agente..." -ForegroundColor Yellow
$files = @("agent.js", "package.json", "popup.ps1")
foreach ($f in $files) {
    Invoke-WebRequest -Uri "$RepoBase/$f" -OutFile "$InstallDir\$f" -UseBasicParsing
}

Write-Host "  [3/5] Instalando dependencias..." -ForegroundColor Yellow
Push-Location $InstallDir
& npm install --production 2>$null
Pop-Location

Write-Host "  [4/5] Configurando autoarranque..." -ForegroundColor Yellow
# Matar procesos anteriores
taskkill /f /im wscript.exe /fi "WINDOWTITLE eq *" 2>$null | Out-Null
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*ManobiRD*" } | Stop-Process -Force 2>$null

# Crear VBS para ejecucion oculta
$vbsContent = "CreateObject(""WScript.Shell"").Run ""node $InstallDir\agent.js $Server"", 0, False"
Set-Content -Path "$InstallDir\start.vbs" -Value $vbsContent

# Registrar en Run del registro (arranca con cada inicio de sesion)
New-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" -Name "ManobiRD" -Value "wscript.exe $InstallDir\start.vbs" -PropertyType String -Force | Out-Null

Write-Host "  [5/5] Iniciando agente..." -ForegroundColor Yellow
Start-Process wscript.exe -ArgumentList "$InstallDir\start.vbs"

# Esperar y verificar
Start-Sleep -Seconds 5
$running = Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*ManobiRD*" -or $_.CommandLine -like "*agent.js*" }

Write-Host ""
if ($running) {
    Write-Host "  Agente instalado y ejecutandose!" -ForegroundColor Green
} else {
    Write-Host "  Agente instalado (verificar manualmente)" -ForegroundColor Yellow
}
Write-Host "  Servidor: $Server" -ForegroundColor White
Write-Host "  Directorio: $InstallDir" -ForegroundColor White
Write-Host "  Autoarranque: Registro de Windows (HKLM\Run)" -ForegroundColor White
Write-Host ""
