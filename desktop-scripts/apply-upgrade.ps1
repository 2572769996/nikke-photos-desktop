param([Parameter(Mandatory=$true)][string]$TargetDir,[Parameter(Mandatory=$true)][string]$PackageRoot,[string]$BackupRoot='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$phase='preflight';$backup='';$changed=@();$created=@();$receipt=@{version='1.1.0';baseVersion='1.0.0';passed=$false;phase=$phase}
function Hash-File([string]$file){$stream=[IO.File]::OpenRead($file);$algorithm=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$algorithm.Dispose();$stream.Dispose()}}
function Safe-Child([string]$root,[string]$relative){
 if([string]::IsNullOrWhiteSpace($relative)-or [IO.Path]::IsPathRooted($relative)-or $relative.Contains(':')-or ($relative -split '[\\/]') -contains '..'){throw 'Unsafe manifest path'}
 if($relative -match '^(data|userdata|backups)([\\/]|$)'){throw 'User data cannot be updated'}
 $full=[IO.Path]::GetFullPath((Join-Path $root $relative))
 if(-not $full.StartsWith($root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Path escaped installation'}
 $cursor=$full
 while($cursor -and $cursor.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){
  if(Test-Path -LiteralPath $cursor){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked files/directories cannot be upgraded'}}
  if($cursor -eq $root){break};$cursor=[IO.Path]::GetDirectoryName($cursor)
 }
 return $full
}
function Copy-Range($source,$dest,[long]$offset,[long]$length){
 if($offset-lt 0-or $length-lt 0-or $offset+$length-gt $source.Length){throw 'Invalid archive range'}
 [void]$source.Seek($offset,[IO.SeekOrigin]::Begin)
 $buffer=New-Object byte[] 1048576
 while($length-gt 0){$n=$source.Read($buffer,0,[int][Math]::Min($buffer.Length,$length));if($n-le 0){throw 'Truncated archive range'};$dest.Write($buffer,0,$n);$length-=$n}
}
try {
 $TargetDir=[IO.Path]::GetFullPath($TargetDir).TrimEnd('\');$PackageRoot=[IO.Path]::GetFullPath($PackageRoot).TrimEnd('\')
 $manifest=Get-Content -LiteralPath (Join-Path $PackageRoot 'manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json
 if($manifest.version-ne '1.1.0'-or $manifest.baseVersion-ne '1.0.0'){throw 'Unsupported upgrade manifest'}
 $app=Safe-Child $TargetDir 'NIKKE Photos.exe';$archive=Safe-Child $TargetDir 'resources/app.asar'
 if(-not(Test-Path -LiteralPath $app)-or -not(Test-Path -LiteralPath $archive)){throw 'Select an existing v1.0 installation'}
 # Never terminate a running client; its user must close it first.
 $lock=[IO.File]::Open($app,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$lock.Dispose()
 $targets=@{};foreach($f in $manifest.targetFiles){[void](Safe-Child $TargetDir $f.path);$targets[$f.path]=$f}
 $base=@{};foreach($f in $manifest.baseFiles){$base[$f.path]=$f;$file=Safe-Child $TargetDir $f.path
  if(-not(Test-Path -LiteralPath $file)){if(-not $targets.ContainsKey($f.path)){continue};throw ('Missing v1.0 file: '+$f.path)}
  $actual=Hash-File $file
  if($actual-ne $f.sha256-and (-not $targets.ContainsKey($f.path)-or $actual-ne $targets[$f.path].sha256)){throw ('Modified v1.0 file: '+$f.path)}
 }
 foreach($f in $manifest.targetFiles){
  $file=Safe-Child $TargetDir $f.path
  if(-not $base.ContainsKey($f.path)-and (Test-Path -LiteralPath $file)-and $f.path-ne 'Uninstall NIKKE Photos.exe'-and (Hash-File $file)-ne $f.sha256){throw ('New program path already contains other content: '+$f.path)}
 }
 foreach($f in $manifest.payloadFiles){$file=Safe-Child $PackageRoot $f.path;if((Hash-File $file)-ne $f.sha256){throw ('Damaged upgrade payload: '+$f.path)}}
 if([string]::IsNullOrEmpty($BackupRoot)){$BackupRoot=Join-Path $env:LOCALAPPDATA 'NIKKE Photos Upgrade Backups'}
 $BackupRoot=[IO.Path]::GetFullPath($BackupRoot).TrimEnd('\')
 $backup=[IO.Path]::GetFullPath((Join-Path $BackupRoot ('v1.0-to-v1.1.0-'+[Guid]::NewGuid().ToString())))
 if(-not $backup.StartsWith($BackupRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid backup root'}
 [void](New-Item -ItemType Directory -Path $backup -Force);$receipt.target=$TargetDir;$receipt.backup=$backup
 $work=Join-Path $backup 'prepared';[void](New-Item -ItemType Directory -Path $work)
 $phase='prepare'
 foreach($f in $manifest.changes){
  $dest=Safe-Child $TargetDir $f.path
  if((Test-Path -LiteralPath $dest)-and (Hash-File $dest)-eq $f.sha256){continue}
  $prepared=Safe-Child $work $f.path;[void](New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($prepared)) -Force)
  if($f.path-eq 'resources/app.asar'){
   if((Hash-File $archive)-ne $manifest.asarBaseSha256){throw 'The archive is not the supported v1.0 baseline'}
   $recipe=Get-Content -LiteralPath (Join-Path $PackageRoot 'asar-recipe.json') -Raw -Encoding UTF8|ConvertFrom-Json
   $old=[IO.File]::OpenRead($archive);$pieces=[IO.File]::OpenRead((Join-Path $PackageRoot 'asar-pieces.bin'));$output=[IO.File]::Create($prepared)
   try{foreach($part in $recipe){if($part.source-eq 'base'){Copy-Range $old $output $part.offset $part.length}elseif($part.source-eq 'payload'){Copy-Range $pieces $output $part.offset $part.length}else{throw 'Unknown archive segment'}}}finally{$output.Dispose();$pieces.Dispose();$old.Dispose()}
  } else {Copy-Item -LiteralPath (Safe-Child $PackageRoot ('files/'+$f.path)) -Destination $prepared}
  if((Hash-File $prepared)-ne $f.sha256){throw ('Prepared file verification failed: '+$f.path)}
  $changed+=@{path=$f.path;existed=(Test-Path -LiteralPath $dest);sha256=$f.sha256}
 }
 foreach($f in $manifest.removed){$dest=Safe-Child $TargetDir $f.path;if(Test-Path -LiteralPath $dest){$changed+=@{path=$f.path;existed=$true;remove=$true}}}
 # Back up every overwritten/removed owned file before the first mutation.
 foreach($f in $changed){if($f.existed){$dest=Safe-Child $backup ('original/'+$f.path);[void](New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($dest)) -Force);Copy-Item -LiteralPath (Safe-Child $TargetDir $f.path) -Destination $dest;$f.originalHash=Hash-File $dest}}
 $changed|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $backup 'files.json') -Encoding UTF8
 $phase='apply'
 foreach($f in $changed){
  $dest=Safe-Child $TargetDir $f.path
  if($f.ContainsKey('remove') -and $f['remove']){Remove-Item -LiteralPath $dest -Force;continue}
  $dir=[IO.Path]::GetDirectoryName($dest)
  if(-not(Test-Path -LiteralPath $dir)){[void](New-Item -ItemType Directory -Path $dir -Force)}
  $temp=$dest+'.nikke-upgrade-'+[Guid]::NewGuid().ToString();$created+=$temp
  Copy-Item -LiteralPath (Safe-Child $work $f.path) -Destination $temp
  Move-Item -LiteralPath $temp -Destination $dest -Force
 }
 $phase='verify'
 foreach($f in $manifest.targetFiles){if((Hash-File (Safe-Child $TargetDir $f.path))-ne $f.sha256){throw ('Final file verification failed: '+$f.path)}}
 # Only update this application's existing registration if it points here.
 $keys=@('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall')
 foreach($key in $keys){foreach($entry in @(Get-ChildItem -LiteralPath $key -ErrorAction SilentlyContinue)){
  $v=Get-ItemProperty -LiteralPath $entry.PSPath -ErrorAction SilentlyContinue
  if($v.DisplayName-eq 'NIKKE Photos'-and $v.InstallLocation-and [IO.Path]::GetFullPath($v.InstallLocation).TrimEnd('\')-eq $TargetDir){try{Set-ItemProperty -LiteralPath $entry.PSPath -Name DisplayVersion -Value '1.1.0' -ErrorAction Stop}catch{}}
 }}
 $receipt.passed=$true;$receipt.phase='complete';$receipt.changed=$changed.Count
 $receipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $backup 'result.json') -Encoding UTF8
 Write-Output ('Upgrade completed; backup: '+$backup);exit 0
} catch {
 $message=$_.Exception.Message;$rollbackErrors=@()
 if($phase-in @('apply','verify')){
  foreach($f in $changed){try{
   $dest=Safe-Child $TargetDir $f.path
   if($f.existed){if(-not(Test-Path -LiteralPath $dest)-or (Hash-File $dest)-ne $f.originalHash){Copy-Item -LiteralPath (Safe-Child $backup ('original/'+$f.path)) -Destination $dest -Force}}
   elseif(Test-Path -LiteralPath $dest){Remove-Item -LiteralPath $dest -Force}
  }catch{$rollbackErrors+=$_.Exception.Message}}
 }
 foreach($file in $created){if(Test-Path -LiteralPath $file){try{Remove-Item -LiteralPath $file -Force}catch{}}}
 $receipt.phase=$phase;$receipt.error=$message;$receipt.rollbackErrors=$rollbackErrors
 if($backup){$receipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $backup 'result.json') -Encoding UTF8}
 Write-Output ('Upgrade failed: '+$message);if($backup){Write-Output ('Log: '+$backup)};exit 1
}
