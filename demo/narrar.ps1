# Genera la voz (Windows SAPI, Microsoft Sabina es-MX) de cada marca de demo/video/marcas.json -> demo/video/voz/NN.wav
param([string]$Dir = "$PSScriptRoot\video")
Add-Type -AssemblyName System.Speech
$d = Get-Content -Raw -Encoding UTF8 "$Dir\marcas.json" | ConvertFrom-Json
New-Item -ItemType Directory -Force "$Dir\voz" | Out-Null
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Sabina Desktop')
$s.Rate = 0
$i = 0
foreach ($m in $d.marcas) {
  $f = "$Dir\voz\{0:00}.wav" -f $i
  $s.SetOutputToWaveFile($f)
  $s.Speak($m.texto)
  $i++
}
$s.SetOutputToNull()
$s.Dispose()
"{0} audios en $Dir\voz" -f $i
