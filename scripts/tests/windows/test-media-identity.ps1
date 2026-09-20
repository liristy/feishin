# Run with Windows PowerShell: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tests/windows/test-media-identity.ps1
# Requires the bundled x64 mpv. Uses silent audio and closes only its own process.
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path "$PSScriptRoot/../../..").Path
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
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
$title = 'Feishin-identity-test-' + [guid]::NewGuid()
$testProcess = Start-Process -FilePath "$repoRoot/assets/mpv/x64/mpv.exe" -WindowStyle Hidden -PassThru -ArgumentList @(
    '--no-config', '--load-scripts=no', '--ao=null', '--vo=null', '--pause', '--idle=yes',
    "`"--script=$repoRoot/assets/mpv/windows-app-id.lua`"", "--force-media-title=$title",
    'av://lavfi:anullsrc'
)
try {
    $matched = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        foreach ($session in $manager.GetSessions()) {
            $metadata = Await-Result ($session.TryGetMediaPropertiesAsync()) $propertiesType
            if ($metadata.Title -eq $title) {
                if ($session.SourceAppUserModelId -ne 'org.jeffvli.feishin') {
                    throw "Wrong media identity: $($session.SourceAppUserModelId)"
                }
                $matched = $true
                break
            }
        }
        if ($matched) { break }
        if ($testProcess.HasExited) { throw 'Test mpv exited before publishing a media session' }
        Start-Sleep -Milliseconds 200
    }
    if (!$matched) { throw 'Test media session did not appear' }
    Write-Output 'PASS: native MPV session uses org.jeffvli.feishin'
} finally {
    if (!$testProcess.HasExited) { $testProcess.Kill(); $testProcess.WaitForExit() }
    $testProcess.Dispose()
}
