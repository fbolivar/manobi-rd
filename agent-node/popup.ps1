Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Manobi-RD - Mesa de Servicios'
$form.Size = New-Object System.Drawing.Size(520, 320)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(26, 26, 46)
$form.ForeColor = [System.Drawing.Color]::White

$logo = New-Object System.Windows.Forms.Label
$logo.Text = 'Manobi-RD'
$logo.Font = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
$logo.ForeColor = [System.Drawing.Color]::FromArgb(51, 141, 255)
$logo.AutoSize = $true
$logo.Location = New-Object System.Drawing.Point(30, 20)
$form.Controls.Add($logo)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = 'Mesa de Servicios - Parques Nacionales Naturales de Colombia'
$subtitle.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(150, 150, 150)
$subtitle.AutoSize = $true
$subtitle.Location = New-Object System.Drawing.Point(30, 55)
$form.Controls.Add($subtitle)

$msg = New-Object System.Windows.Forms.Label
$msg.Text = "Bienvenido a la Mesa de Servicios de Parques Nacionales`nNaturales de Colombia.`n`nVamos a tomar control remoto de su maquina`npara ayudarle en lo que necesite.`n`nUsted autoriza esta conexion?"
$msg.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$msg.ForeColor = [System.Drawing.Color]::FromArgb(220, 220, 220)
$msg.Size = New-Object System.Drawing.Size(450, 120)
$msg.Location = New-Object System.Drawing.Point(30, 85)
$form.Controls.Add($msg)

$btnSi = New-Object System.Windows.Forms.Button
$btnSi.Text = 'Si, Autorizo'
$btnSi.Size = New-Object System.Drawing.Size(150, 40)
$btnSi.Location = New-Object System.Drawing.Point(160, 225)
$btnSi.BackColor = [System.Drawing.Color]::FromArgb(20, 87, 225)
$btnSi.ForeColor = [System.Drawing.Color]::White
$btnSi.FlatStyle = 'Flat'
$btnSi.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$btnSi.DialogResult = [System.Windows.Forms.DialogResult]::Yes
$form.Controls.Add($btnSi)

$btnNo = New-Object System.Windows.Forms.Button
$btnNo.Text = 'No, Rechazar'
$btnNo.Size = New-Object System.Drawing.Size(150, 40)
$btnNo.Location = New-Object System.Drawing.Point(320, 225)
$btnNo.BackColor = [System.Drawing.Color]::FromArgb(80, 80, 80)
$btnNo.ForeColor = [System.Drawing.Color]::White
$btnNo.FlatStyle = 'Flat'
$btnNo.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$btnNo.DialogResult = [System.Windows.Forms.DialogResult]::No
$form.Controls.Add($btnNo)

$form.AcceptButton = $btnSi
$form.CancelButton = $btnNo

$result = $form.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::Yes) {
    Write-Output 'AUTORIZADO'
} else {
    Write-Output 'RECHAZADO'
}
