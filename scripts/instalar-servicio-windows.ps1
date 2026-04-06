# ============================================
# Manobi-RD - Registrar como Servicio Windows
# Ejecutar como Administrador
# ============================================

param(
    [string]$Server = "http://192.168.50.5:3001",
    [string]$InstallDir = "C:\ManobiRD"
)

Write-Host ""
Write-Host "  Manobi-RD - Configurar Autoarranque" -ForegroundColor Cyan
Write-Host ""

# Verificar admin
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: Ejecutar como Administrador" -ForegroundColor Red
    exit 1
}

# Eliminar tarea anterior si existe
Unregister-ScheduledTask -TaskName "ManobiRDAgent" -Confirm:$false -ErrorAction SilentlyContinue

# Crear tarea programada que corre al inicio del sistema
$action = New-ScheduledTaskAction `
    -Execute "node.exe" `
    -Argument "`"$InstallDir\agent.js`" $Server" `
    -WorkingDirectory $InstallDir

$trigger = New-ScheduledTaskTrigger -AtStartup
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn

$principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 365) `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName "ManobiRDAgent" `
    -Action $action `
    -Trigger $trigger,$triggerLogon `
    -Principal $principal `
    -Settings $settings `
    -Description "Manobi-RD - Agente de Soporte Remoto (BC Fabric SAS)" | Out-Null

# Iniciar ahora
Start-ScheduledTask -TaskName "ManobiRDAgent"

Write-Host "  Servicio registrado exitosamente!" -ForegroundColor Green
Write-Host "  El agente arrancara automaticamente con Windows" -ForegroundColor Green
Write-Host "  Tarea: ManobiRDAgent" -ForegroundColor Green
Write-Host ""

# Verificar estado
$task = Get-ScheduledTask -TaskName "ManobiRDAgent"
Write-Host "  Estado: $($task.State)" -ForegroundColor Yellow
Write-Host ""
