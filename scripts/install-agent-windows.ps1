# ============================================
# Manobi-RD - Instalador del Agente (Windows)
# BC Fabric SAS - Colombia
# ============================================

param(
    [string]$ServerURL = "ws://192.168.50.5:3001",
    [string]$InstallPath = "C:\Program Files\ManobiRD"
)

Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║    Manobi-RD Agente - Instalador     ║" -ForegroundColor Cyan
Write-Host "║    BC Fabric SAS - Colombia          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Verificar permisos de administrador
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: Ejecutar como Administrador" -ForegroundColor Red
    exit 1
}

Write-Host "[1/4] Creando directorio de instalacion..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
New-Item -ItemType Directory -Force -Path "C:\ProgramData\ManobiRD" | Out-Null

Write-Host "[2/4] Descargando agente..." -ForegroundColor Yellow
$agentURL = $ServerURL.Replace("ws://", "http://").Replace("wss://", "https://").Replace(":3001", ":3001/agente/download/windows")
try {
    Invoke-WebRequest -Uri $agentURL -OutFile "$InstallPath\manobi-agent.exe" -UseBasicParsing
} catch {
    Write-Host "No se pudo descargar. Copiando agente local..." -ForegroundColor Yellow
}

Write-Host "[3/4] Configurando agente..." -ForegroundColor Yellow
$config = @{
    server_url = $ServerURL
    token = ""
} | ConvertTo-Json

Set-Content -Path "C:\ProgramData\ManobiRD\config.json" -Value $config

Write-Host "[4/4] Registrando servicio de Windows..." -ForegroundColor Yellow
# Crear servicio
$serviceName = "ManobiRDAgent"
$serviceExists = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if ($serviceExists) {
    Stop-Service -Name $serviceName -Force
    sc.exe delete $serviceName
}

New-Service -Name $serviceName `
    -BinaryPathName "$InstallPath\manobi-agent.exe --server $ServerURL" `
    -DisplayName "Manobi-RD Remote Agent" `
    -Description "Agente de soporte remoto Manobi-RD - BC Fabric SAS" `
    -StartupType Automatic

Start-Service -Name $serviceName

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  Agente instalado correctamente!     ║" -ForegroundColor Green
Write-Host "║  Servicio: ManobiRDAgent (Activo)    ║" -ForegroundColor Green
Write-Host "║  Servidor: $ServerURL               ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green
