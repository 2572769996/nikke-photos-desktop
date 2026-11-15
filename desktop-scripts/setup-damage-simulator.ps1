$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$engineRoot = Join-Path $projectRoot 'tools/damage-simulator'
$downloadRoot = Join-Path $projectRoot '.cache/damage-simulator'
$engineCommit = '67835ca3033a95482749ea2db35a8ee2a0856a92'
$engineUrl = "https://codeload.github.com/Jgaram/nikke-calc/zip/$engineCommit"
$pythonUrl = 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip'
New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
New-Item -ItemType Directory -Path $engineRoot -Force | Out-Null
$sources = @(
    @{ Name = 'engine'; Url = $engineUrl; Zip = 'engine-67835ca.zip'; ExpectedSha256 = 'd9664625efec9cb3991b9ea918185c27fe8f1f0c9a9a87a86bc756d5be8271f6' },
    @{ Name = 'python'; Url = $pythonUrl; Zip = 'python-3.12.10-embed-amd64.zip'; ExpectedSha256 = '4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3' }
)
foreach ($source in $sources) {
    $downloadPath = Join-Path $downloadRoot $source.Zip
    if (!(Test-Path -LiteralPath $downloadPath)) {
        Invoke-WebRequest -Uri $source.Url -OutFile $downloadPath -TimeoutSec 180
    }
    $source.Sha256 = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($source.Sha256 -ne $source.ExpectedSha256) { throw ('下载文件校验失败：' + $source.Name) }
}
$vendorPath = Join-Path $engineRoot 'vendor'
if (!(Test-Path -LiteralPath $vendorPath)) {
    $extractPath = Join-Path $downloadRoot 'upstream-67835ca'
    Expand-Archive -LiteralPath (Join-Path $downloadRoot $sources[0].Zip) -DestinationPath $extractPath -Force
    $sourceRoot = Join-Path $extractPath "nikke-calc-$engineCommit"
    Copy-Item -LiteralPath $sourceRoot -Destination $vendorPath -Recurse
}
$pythonPath = Join-Path $engineRoot 'python'
if (!(Test-Path -LiteralPath (Join-Path $pythonPath 'python.exe'))) {
    Expand-Archive -LiteralPath (Join-Path $downloadRoot $sources[1].Zip) -DestinationPath $pythonPath -Force
}
$pythonPathFile = Join-Path $pythonPath 'python312._pth'
$pythonPaths = Get-Content -LiteralPath $pythonPathFile
if ($pythonPaths -notcontains '../vendor') { Add-Content -LiteralPath $pythonPathFile -Value '../vendor' -Encoding ascii }
[ordered]@{
    repo = 'Jgaram/nikke-calc'; commit = $engineCommit; schemaVersion = 2
    pythonVersion = '3.12.10'; sources = $sources
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $engineRoot 'provenance.json') -Encoding utf8
Write-Output '固定版本引擎与独立 Python 已就绪。'
& node (Join-Path $PSScriptRoot 'prepare-damage-catalog.mjs')
if ($LASTEXITCODE -ne 0) { throw '角色目录准备失败' }
