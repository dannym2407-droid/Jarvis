"""Jarvis TTS worker: edge-tts + MCI (rápido) con modo daemon."""
from __future__ import annotations

import asyncio
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import edge_tts

CACHE = Path.home() / ".jarvis-tts-cache"
CACHE.mkdir(parents=True, exist_ok=True)


def cache_path(text: str, voice: str) -> Path:
    key = hashlib.sha1(f"{voice}|{text}".encode("utf-8")).hexdigest()
    return CACHE / f"{key}.mp3"


async def synthesize(text: str, voice: str, out: Path) -> None:
    tmp = out.with_suffix(".tmp.mp3")
    await edge_tts.Communicate(text, voice).save(str(tmp))
    tmp.replace(out)


def play_mp3(path: Path) -> None:
    # MCI wait = más liviano que levantar WPF MediaPlayer cada vez
    p = str(path).replace("'", "''")
    ps = rf"""
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class JarvisMci {{
  [DllImport("winmm.dll", CharSet=CharSet.Unicode)]
  public static extern int mciSendString(string command, StringBuilder buffer, int bufferSize, IntPtr hwndCallback);
}}
"@
$alias = 'jarvisvoice'
[void][JarvisMci]::mciSendString("close $alias", $null, 0, [IntPtr]::Zero)
$code = [JarvisMci]::mciSendString("open '{p}' type mpegvideo alias $alias", $null, 0, [IntPtr]::Zero)
if ($code -ne 0) {{
  $code = [JarvisMci]::mciSendString("open '{p}' alias $alias", $null, 0, [IntPtr]::Zero)
}}
if ($code -ne 0) {{ throw "MCI open failed: $code" }}
[void][JarvisMci]::mciSendString("play $alias wait", $null, 0, [IntPtr]::Zero)
[void][JarvisMci]::mciSendString("close $alias", $null, 0, [IntPtr]::Zero)
"""
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            ps,
        ],
        check=True,
        creationflags=flags,
    )


async def speak(text: str, voice: str) -> None:
    text = (text or "").strip()
    if not text:
        return
    out = cache_path(text, voice)
    if not out.exists() or out.stat().st_size < 100:
        await synthesize(text, voice, out)
    play_mp3(out)


async def warm(phrases: list[str], voice: str) -> None:
    for phrase in phrases:
        phrase = phrase.strip()
        if not phrase:
            continue
        out = cache_path(phrase, voice)
        if not out.exists() or out.stat().st_size < 100:
            await synthesize(phrase, voice, out)


async def daemon(voice: str) -> None:
    print("READY", flush=True)
    loop = asyncio.get_event_loop()
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
            cmd = payload.get("cmd")
            if cmd == "speak":
                await speak(payload.get("text") or "", payload.get("voice") or voice)
                print("OK", flush=True)
            elif cmd == "warm":
                await warm(payload.get("phrases") or [], payload.get("voice") or voice)
                print("OK", flush=True)
            elif cmd == "ping":
                print("PONG", flush=True)
            elif cmd == "quit":
                print("BYE", flush=True)
                break
            else:
                print("ERR unknown", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"ERR {exc}", flush=True)


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: speak.py <text>|--warm|--daemon ...", file=sys.stderr)
        return 2

    if sys.argv[1] == "--daemon":
        voice = sys.argv[2] if len(sys.argv) > 2 else "es-MX-JorgeNeural"
        asyncio.run(daemon(voice))
        return 0

    if sys.argv[1] == "--warm":
        voice = sys.argv[2] if len(sys.argv) > 2 else "es-MX-JorgeNeural"
        phrases = sys.argv[3:]
        asyncio.run(warm(phrases, voice))
        print("warmed", len(phrases))
        return 0

    text = sys.argv[1]
    voice = sys.argv[2] if len(sys.argv) > 2 else "es-MX-JorgeNeural"
    asyncio.run(speak(text, voice))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
