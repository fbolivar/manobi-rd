# ============================================
# Manobi-RD - Despliegue Masivo del Agente
# Instala el agente en multiples equipos via red
# Ejecutar desde un equipo con acceso a la red
# ============================================

param(
    [string]$Server = "http://192.168.50.5:3001",
    [string]$EquiposFile = "",
    [string[]]$Equipos = @()
)

Write-Host ""
Write-Host "  Manobi-RD - Despliegue Masivo" -ForegroundColor Cyan
Write-Host "  BC Fabric SAS" -ForegroundColor Cyan
Write-Host ""

# Cargar lista de equipos desde archivo si se proporciona
if ($EquiposFile -and (Test-Path $EquiposFile)) {
    $Equipos = Get-Content $EquiposFile | Where-Object { $_ -and $_ -notmatch '^\s*#' }
}

if ($Equipos.Count -eq 0) {
    Write-Host "Uso:" -ForegroundColor Yellow
    Write-Host "  .\despliegue-masivo.ps1 -Equipos 'PC01','PC02','PC03'" -ForegroundColor White
    Write-Host "  .\despliegue-masivo.ps1 -EquiposFile 'equipos.txt'" -ForegroundColor White
    Write-Host ""
    Write-Host "El archivo equipos.txt debe tener un equipo por linea:" -ForegroundColor Yellow
    Write-Host "  PC-CONTABILIDAD" -ForegroundColor White
    Write-Host "  PC-RRHH" -ForegroundColor White
    Write-Host "  192.168.50.100" -ForegroundColor White
    Write-Host ""
    exit 0
}

$repoUrl = "https://raw.githubusercontent.com/fbolivar/manobi-rd/main/agent-node"
$installScript = @"
`$ErrorActionPreference = 'SilentlyContinue'
mkdir C:\ManobiRD -Force | Out-Null
Set-Location C:\ManobiRD
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri '$repoUrl/agent.js' -OutFile agent.js -UseBasicParsing
Invoke-WebRequest -Uri '$repoUrl/package.json' -OutFile package.json -UseBasicParsing
npm install --production 2>`$null
`$action = New-ScheduledTaskAction -Execute 'node.exe' -Argument 'C:\ManobiRD\agent.js $Server' -WorkingDirectory 'C:\ManobiRD'
`$trigger = New-ScheduledTaskTrigger -AtStartup
`$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
`$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Unregister-ScheduledTask -TaskName 'ManobiRDAgent' -Confirm:`$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName 'ManobiRDAgent' -Action `$action -Trigger `$trigger -Principal `$principal -Settings `$settings -Description 'Manobi-RD Agent' | Out-Null
Start-ScheduledTask -TaskName 'ManobiRDAgent'
"@

$total = $Equipos.Count
$exitoso = 0
$fallido = 0

foreach ($equipo in $Equipos) {
    $equipo = $equipo.Trim()
    if (-not $equipo) { continue }

    Write-Host "[$($exitoso + $fallido + 1)/$total] Instalando en $equipo..." -ForegroundColor Yellow -NoNewline

    try {
        Invoke-Command -ComputerName $equipo -ScriptBlock ([ScriptBlock]::Create($installScript)) -ErrorAction Stop
        Write-Host " OK" -ForegroundColor Green
        $exitoso++
    } catch {
        Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $fallido++
    }
}

Write-Host ""
Write-Host "  Resultado:" -ForegroundColor Cyan
Write-Host "    Exitosos: $exitoso" -ForegroundColor Green
Write-Host "    Fallidos: $fallido" -ForegroundColor $(if ($fallido -gt 0) { 'Red' } else { 'Green' })
Write-Host "    Total: $total" -ForegroundColor White
Write-Host ""
