Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.GetInstalledVoices() | ForEach-Object {
  $v = $_.VoiceInfo
  "{0} | {1} | {2}" -f $v.Name, $v.Culture.Name, $v.Gender
}
