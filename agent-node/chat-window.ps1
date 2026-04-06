param([string]$PipeName = "ManobiChat")

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Crear formulario
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Mesa de Servicios - Parques Nacionales'
$form.Size = New-Object System.Drawing.Size(400, 500)
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point(([System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Width - 400), ([System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Height - 500))
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 50)
$form.ForeColor = [System.Drawing.Color]::White
$form.ShowInTaskbar = $true

# Header
$header = New-Object System.Windows.Forms.Panel
$header.Size = New-Object System.Drawing.Size(400, 60)
$header.Location = New-Object System.Drawing.Point(0, 0)
$header.BackColor = [System.Drawing.Color]::FromArgb(20, 87, 225)

$headerTitle = New-Object System.Windows.Forms.Label
$headerTitle.Text = 'Mesa de Servicios'
$headerTitle.Font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
$headerTitle.ForeColor = [System.Drawing.Color]::White
$headerTitle.AutoSize = $true
$headerTitle.Location = New-Object System.Drawing.Point(15, 8)
$header.Controls.Add($headerTitle)

$headerSub = New-Object System.Windows.Forms.Label
$headerSub.Text = 'Parques Nacionales Naturales de Colombia'
$headerSub.Font = New-Object System.Drawing.Font('Segoe UI', 8)
$headerSub.ForeColor = [System.Drawing.Color]::FromArgb(200, 220, 255)
$headerSub.AutoSize = $true
$headerSub.Location = New-Object System.Drawing.Point(15, 32)
$header.Controls.Add($headerSub)
$form.Controls.Add($header)

# Area de mensajes
$chatBox = New-Object System.Windows.Forms.RichTextBox
$chatBox.Size = New-Object System.Drawing.Size(380, 330)
$chatBox.Location = New-Object System.Drawing.Point(10, 70)
$chatBox.BackColor = [System.Drawing.Color]::FromArgb(22, 22, 38)
$chatBox.ForeColor = [System.Drawing.Color]::White
$chatBox.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$chatBox.ReadOnly = $true
$chatBox.BorderStyle = 'None'
$chatBox.ScrollBars = 'Vertical'
$form.Controls.Add($chatBox)

# Input area
$inputBox = New-Object System.Windows.Forms.TextBox
$inputBox.Size = New-Object System.Drawing.Size(300, 30)
$inputBox.Location = New-Object System.Drawing.Point(10, 415)
$inputBox.BackColor = [System.Drawing.Color]::FromArgb(40, 40, 60)
$inputBox.ForeColor = [System.Drawing.Color]::White
$inputBox.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$inputBox.BorderStyle = 'FixedSingle'
$form.Controls.Add($inputBox)

$btnSend = New-Object System.Windows.Forms.Button
$btnSend.Text = 'Enviar'
$btnSend.Size = New-Object System.Drawing.Size(70, 30)
$btnSend.Location = New-Object System.Drawing.Point(315, 415)
$btnSend.BackColor = [System.Drawing.Color]::FromArgb(20, 87, 225)
$btnSend.ForeColor = [System.Drawing.Color]::White
$btnSend.FlatStyle = 'Flat'
$btnSend.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($btnSend)

# Funciones de chat
function Add-Message {
    param([string]$Sender, [string]$Message)
    $time = Get-Date -Format "HH:mm"
    if ($Sender -eq "soporte") {
        $chatBox.SelectionColor = [System.Drawing.Color]::FromArgb(51, 141, 255)
        $chatBox.AppendText("Soporte [$time]:`n")
        $chatBox.SelectionColor = [System.Drawing.Color]::FromArgb(220, 220, 220)
        $chatBox.AppendText("$Message`n`n")
    } else {
        $chatBox.SelectionColor = [System.Drawing.Color]::FromArgb(80, 200, 120)
        $chatBox.AppendText("Usted [$time]:`n")
        $chatBox.SelectionColor = [System.Drawing.Color]::FromArgb(220, 220, 220)
        $chatBox.AppendText("$Message`n`n")
    }
    $chatBox.ScrollToCaret()
}

# Mensaje de bienvenida
Add-Message "soporte" "Bienvenido a la Mesa de Servicios de Parques Nacionales Naturales de Colombia. Estamos tomando control remoto de su equipo para asistirle."

# Enviar mensaje
$sendAction = {
    $msg = $inputBox.Text.Trim()
    if ($msg -ne "") {
        Add-Message "usuario" $msg
        # Escribir al pipe para que el agente Node lo reciba
        Write-Host "CHAT:$msg"
        $inputBox.Text = ""
    }
}

$btnSend.Add_Click($sendAction)
$inputBox.Add_KeyDown({
    if ($_.KeyCode -eq 'Return') {
        $sendAction.Invoke()
        $_.SuppressKeyPress = $true
    }
})

# Timer para leer mensajes entrantes via stdin
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200

$reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput())

$timer.Add_Tick({
    while ($reader.Peek() -ge 0) {
        $line = $reader.ReadLine()
        if ($line -and $line.StartsWith("MSG:")) {
            $msgText = $line.Substring(4)
            Add-Message "soporte" $msgText
            # Traer ventana al frente
            $form.TopMost = $true
            $form.Activate()
        }
        if ($line -eq "CLOSE") {
            Add-Message "soporte" "La sesion de soporte ha finalizado. Gracias."
            Start-Sleep -Seconds 3
            $form.Close()
        }
    }
})
$timer.Start()

$form.Add_FormClosing({
    $timer.Stop()
    Write-Host "CHAT_CLOSED"
})

[System.Windows.Forms.Application]::Run($form)
