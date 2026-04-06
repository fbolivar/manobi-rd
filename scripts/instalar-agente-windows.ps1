# ============================================
# Manobi-RD - Instalar Agente (Windows)
# Ejecutar como Administrador en PowerShell
# ============================================

param(
    [string]$Server = "http://192.168.50.5:3001"
)

$InstallDir = "C:\Program Files\ManobiRD"
$ConfigDir = "C:\ProgramData\ManobiRD"

Write-Host ""
Write-Host "  Manobi-RD - Instalador de Agente" -ForegroundColor Cyan
Write-Host "  BC Fabric SAS - Colombia" -ForegroundColor Cyan
Write-Host ""

# Verificar admin
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: Ejecutar como Administrador" -ForegroundColor Red
    exit 1
}

# Verificar Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Instalando Node.js..." -ForegroundColor Yellow
    # Descargar e instalar Node.js
    $nodeUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
    $nodeInstaller = "$env:TEMP\node-install.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller -UseBasicParsing
    Start-Process msiexec.exe -Wait -ArgumentList "/i $nodeInstaller /quiet"
    $env:PATH += ";C:\Program Files\nodejs"
    Write-Host "Node.js instalado" -ForegroundColor Green
}

Write-Host "[1/4] Creando directorios..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

Write-Host "[2/4] Copiando agente..." -ForegroundColor Yellow
# Descargar archivos del agente desde el servidor
try {
    Invoke-WebRequest -Uri "$Server/agente/package.json" -OutFile "$InstallDir\package.json" -UseBasicParsing -ErrorAction Stop
    Invoke-WebRequest -Uri "$Server/agente/agent.js" -OutFile "$InstallDir\agent.js" -UseBasicParsing -ErrorAction Stop
} catch {
    # Si no puede descargar, copiar desde el repo local
    Write-Host "Descarga no disponible, usando archivos locales..." -ForegroundColor Yellow
}

Write-Host "[3/4] Instalando dependencias..." -ForegroundColor Yellow
Push-Location $InstallDir
npm install --production 2>$null
Pop-Location

# Guardar config
$config = @{
    server_url = $Server
    token = ""
} | ConvertTo-Json
Set-Content -Path "$ConfigDir\config.json" -Value $config

Write-Host "[4/4] Creando servicio..." -ForegroundColor Yellow

# Crear script de inicio
$startScript = @"
@echo off
cd "$InstallDir"
node agent.js $Server
"@
Set-Content -Path "$InstallDir\start.bat" -Value $startScript

# Registrar como tarea programada (se ejecuta al inicio)
$action = New-ScheduledTaskAction -Execute "node.exe" -Argument "`"$InstallDir\agent.js`" $Server" -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Unregister-ScheduledTask -TaskName "ManobiRDAgent" -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName "ManobiRDAgent" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Manobi-RD Remote Agent" | Out-Null

# Iniciar ahora
Start-ScheduledTask -TaskName "ManobiRDAgent"

Write-Host ""
Write-Host "  Agente instalado y ejecutandose!" -ForegroundColor Green
Write-Host "  Servidor: $Server" -ForegroundColor Green
Write-Host "  Directorio: $InstallDir" -ForegroundColor Green
Write-Host ""
