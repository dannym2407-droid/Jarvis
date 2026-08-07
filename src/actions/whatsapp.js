const fs = require("node:fs");
const path = require("node:path");
const { openApp, openUrl, sleep, runShell } = require("./system");

const CONTACTS_PATH = path.join(__dirname, "..", "..", "data", "contacts.json");

function loadContacts() {
  try {
    if (!fs.existsSync(CONTACTS_PATH)) return {};
    const data = JSON.parse(fs.readFileSync(CONTACTS_PATH, "utf8"));
    const map = {};
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("_")) continue;
      const phone = String(value || "").replace(/\D/g, "");
      if (phone.length >= 8) map[key.toLowerCase()] = phone;
    }
    return map;
  } catch {
    return {};
  }
}

function resolvePhone(contact) {
  const who = String(contact || "").trim();
  const digits = who.replace(/\D/g, "");
  if (digits.length >= 8 && /^\+?[\d\s\-()]+$/.test(who)) {
    return digits.startsWith("502") || digits.length > 10 ? digits : `502${digits}`;
  }
  const contacts = loadContacts();
  const key = who.toLowerCase();
  if (contacts[key]) return contacts[key];
  // match parcial: "mamá" ≈ "mama"
  const norm = key.normalize("NFD").replace(/\p{M}/gu, "");
  for (const [name, phone] of Object.entries(contacts)) {
    const n = name.normalize("NFD").replace(/\p{M}/gu, "");
    if (n === norm || n.includes(norm) || norm.includes(n)) return phone;
  }
  return null;
}

/**
 * Envía mensaje por WhatsApp.
 * 1) Si hay número (o contacto en data/contacts.json) → wa.me (más fiable)
 * 2) Si no → WhatsApp Desktop: busca chat, pega mensaje, Enter
 */
async function whatsappMessage({ contact, message, send = true } = {}) {
  const who = String(contact || "").trim();
  const text = String(message || "").trim();
  if (!who) return { ok: false, message: "¿A quién le escribo?" };
  if (!text) return { ok: false, message: "¿Qué le digo?" };

  const phone = resolvePhone(who);
  if (phone) {
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    await openUrl(url);
    await sleep(2500);
    // Intenta enviar con Enter en la ventana abierta
    try {
      await runShell(`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class JarvisWA2 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$p = Get-Process | Where-Object {
  $_.MainWindowHandle -ne 0 -and (
    $_.MainWindowTitle -match 'WhatsApp' -or
    $_.ProcessName -match 'WhatsApp|chrome|msedge|opera|brave'
  )
} | Select-Object -First 1
if ($p) {
  [JarvisWA2]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
  [JarvisWA2]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 1200
  $w = New-Object -ComObject WScript.Shell
  if (${send ? "1" : "0"} -eq 1) { $w.SendKeys('{ENTER}') }
}
`);
    } catch {
      // igual dejamos el chat abierto
    }
    return {
      ok: true,
      message: `Listo, abrí el chat de ${who} en WhatsApp con el mensaje.`
    };
  }

  // Por nombre: automatiza WhatsApp Desktop
  await openApp("whatsapp");
  await sleep(6000);

  const whoQ = who.replace(/'/g, "''");
  const textQ = text.replace(/'/g, "''");
  const doSend = send ? "1" : "0";

  try {
    await runShell(`
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class JarvisWA {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

function Focus-WhatsApp {
  $candidates = Get-Process | Where-Object {
    $_.MainWindowHandle -ne 0 -and (
      $_.ProcessName -match 'WhatsApp' -or
      $_.MainWindowTitle -match 'WhatsApp'
    )
  }
  $p = $candidates | Select-Object -First 1
  if (-not $p) { return $false }
  [JarvisWA]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
  Start-Sleep -Milliseconds 200
  [JarvisWA]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 800
  return $true
}

function Paste-Text([string]$value) {
  [System.Windows.Forms.Clipboard]::SetText($value)
  Start-Sleep -Milliseconds 250
  $w = New-Object -ComObject WScript.Shell
  $w.SendKeys('^v')
  Start-Sleep -Milliseconds 350
}

$focused = $false
1..8 | ForEach-Object {
  if (-not $focused) {
    $focused = Focus-WhatsApp
    if (-not $focused) { Start-Sleep -Milliseconds 700 }
  }
}
if (-not $focused) { throw 'WhatsApp no enfocado' }

$w = New-Object -ComObject WScript.Shell
$w.SendKeys('{ESC}')
Start-Sleep -Milliseconds 400
$w.SendKeys('{ESC}')
Start-Sleep -Milliseconds 500

# Nuevo chat / buscar (Ctrl+N suele abrir búsqueda de contacto)
$w.SendKeys('^n')
Start-Sleep -Milliseconds 1200
Paste-Text '${whoQ}'
Start-Sleep -Milliseconds 1800
$w.SendKeys('{ENTER}')
Start-Sleep -Milliseconds 1200

# Si quedó en lista, baja al primer resultado
$w.SendKeys('{DOWN}')
Start-Sleep -Milliseconds 400
$w.SendKeys('{ENTER}')
Start-Sleep -Milliseconds 1400

Paste-Text '${textQ}'
Start-Sleep -Milliseconds 500
if (${doSend} -eq 1) {
  $w.SendKeys('{ENTER}')
  Start-Sleep -Milliseconds 300
}
`);
  } catch {
    return {
      ok: false,
      message: `No pude enviar solo por nombre. Anota el número de ${who} en data/contacts.json y te funciona seguro.`
    };
  }

  return {
    ok: true,
    message: `Listo, le mandé el mensaje a ${who} por WhatsApp.`
  };
}

module.exports = { whatsappMessage, loadContacts, resolvePhone };
