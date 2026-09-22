# Run with Windows PowerShell: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tests/windows/test-media-artwork.ps1
# Verify real Windows SMTC thumbnail bytes with audio-only MPV and video-add.
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path "$PSScriptRoot/../../..").Path
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
$streamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]
$randomAccessStreamType = [Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await-Result($operation, $resultType) {
    $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
    if (!$task.Wait(5000)) { throw 'Windows media API timed out' }
    $task.Result
}
$manager = Await-Result ($managerType::RequestAsync()) $managerType
$testId = [guid]::NewGuid().ToString()
$title = 'Feishin-artwork-test-' + $testId
$pipeName = 'feishin-artwork-test-' + $testId
$cover = Join-Path $repoRoot 'assets/icons/icon.png'
$pipe = New-Object System.IO.Pipes.NamedPipeClientStream('.', $pipeName, [System.IO.Pipes.PipeDirection]::InOut)
$testProcess = Start-Process -FilePath "$repoRoot/assets/mpv/x64/mpv.exe" -WindowStyle Hidden -PassThru -ArgumentList @(
    '--no-config', '--load-scripts=no', '--ao=null', '--no-video', '--no-audio-display', '--pause', '--idle=yes',
    "`"--script=$repoRoot/assets/mpv/windows-app-id.lua`"", "--force-media-title=$title",
    "--input-ipc-server=\\.\pipe\$pipeName", 'av://lavfi:anullsrc'
)
try {
    $pipe.Connect(5000)
    $reader = New-Object System.IO.StreamReader($pipe)
    $writer = New-Object System.IO.StreamWriter($pipe)
    $writer.AutoFlush = $true
    $matched = $null
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        foreach ($session in $manager.GetSessions()) {
            $metadata = Await-Result ($session.TryGetMediaPropertiesAsync()) $propertiesType
            if ($metadata.Title -eq $title) { $matched = $session; break }
        }
        if ($matched) { break }
        Start-Sleep -Milliseconds 200
    }
    if (!$matched) { throw 'Test media session did not appear' }
    if ($metadata.Thumbnail) { throw 'Expected no thumbnail before attaching artwork' }
    $writer.WriteLine((@{ command = @('video-add', $cover, 'auto', 'Feishin album art', '', 'yes'); request_id = 1 } | ConvertTo-Json -Compress))
    do {
        $read = $reader.ReadLineAsync()
        if (!$read.Wait(5000)) { throw 'MPV command timed out' }
        $response = $read.Result | ConvertFrom-Json
    } while ($response.request_id -ne 1)
    if ($response.error -ne 'success') { throw "MPV rejected artwork: $($response.error)" }
    $size = 0
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $metadata = Await-Result ($matched.TryGetMediaPropertiesAsync()) $propertiesType
        if ($metadata.Thumbnail) {
            $stream = Await-Result ($metadata.Thumbnail.OpenReadAsync()) $streamType
            $size = $randomAccessStreamType.GetProperty('Size').GetValue($stream, $null)
            [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($stream)
            if ($size -gt 0) { break }
        }
        Start-Sleep -Milliseconds 200
    }
    if ($size -ne (Get-Item -LiteralPath $cover).Length) { throw "Wrong thumbnail size: $size" }
    if ($matched.SourceAppUserModelId -ne 'org.jeffvli.feishin') { throw 'Wrong application identity' }
    Write-Output "PASS: Windows SMTC received all $size artwork bytes from audio-only MPV."
} finally {
    $pipe.Dispose()
    if (!$testProcess.HasExited) { $testProcess.Kill(); $testProcess.WaitForExit() }
    $testProcess.Dispose()
}
