#!/usr/bin/env python3
"""Generate all spoken lines of claim with Kokoro TTS, locally.

The lines are read directly from the game's JS files, so the output stays in
sync with the game. Guard lines are rendered with several different voices;
countdown and announcer get one fixed voice each.

Setup (once):
    pip install kokoro soundfile numpy
    # Kokoro also needs espeak-ng:
    #   Windows: installer from https://github.com/espeak-ng/espeak-ng/releases
    #   macOS:   brew install espeak-ng
    #   Linux:   sudo apt install espeak-ng
    # Optional, for .mp3/.ogg output: ffmpeg in PATH

Usage (from the repo root):
    python tools/kokoro_voices.py                  # everything, WAV
    python tools/kokoro_voices.py --format ogg     # convert via ffmpeg
    python tools/kokoro_voices.py --only countdown announcer
    python tools/kokoro_voices.py --guard-voices am_adam am_onyx bf_emma

Output: audio/voice/<category>/<voice>/<slug>.<ext> plus audio/voice/manifest.json,
which maps every text to its files (for a player in the game later).
Existing files are skipped, so the script can be re-run after adding lines.
"""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS = ROOT / "js"
SAMPLE_RATE = 24000

# Voices: prefix a = American English, b = British English; f = female, m = male
DEFAULT_GUARD_VOICES = [
    "am_adam", "am_michael", "am_fenrir", "am_onyx", "am_eric", "am_liam",
    "am_puck", "bm_george", "bm_lewis", "bm_daniel", "af_bella", "af_nicole",
    "bf_emma", "bf_isabella",
]
COUNTDOWN_VOICE = "am_onyx"
ANNOUNCER_VOICE = "am_fenrir"
DOG_VOICE = "am_puck"


# --- Reading the lines from the JS files ---

STRING_RE = re.compile(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"")


def js_strings(src):
    out = []
    for m in STRING_RE.finditer(src):
        s = m.group(1) if m.group(1) is not None else m.group(2)
        out.append(re.sub(r"\\(.)", r"\1", s))
    return out


def js_array(file, name):
    src = (JS / file).read_text(encoding="utf-8")
    m = re.search(r"const\s+" + name + r"\s*=\s*\[(.*?)\];", src, re.S)
    if not m:
        print(f"Warning: array {name} not found in js/{file}, skipped (is your checkout up to date?)")
        return []
    return [s for s in js_strings(m.group(1)) if s]


def guard_lines():
    src = (JS / "gadgets.js").read_text(encoding="utf-8")
    m = re.search(r"const\s+GUARD_LINES\s*=\s*\{(.*?)\n\s*\};", src, re.S)
    if not m:
        print("Warning: GUARD_LINES not found in js/gadgets.js, skipped")
        return {}
    lines = {}
    for km in re.finditer(r"(\w+)\s*:\s*\[(.*?)\]", m.group(1), re.S):
        lines[km.group(1)] = js_strings(km.group(2))
    return lines


def collect():
    """Returns {category: (list of texts, list of voices or None for guard voices)}."""
    lines = guard_lines()
    names = js_array("gadgets.js", "GUARD_NAMES")
    react = js_array("gadgets.js", "REACT_LINES")
    cats = {}
    if not names or not react:
        react, names = [], []
    for kind, texts in lines.items():
        cats["guard_" + kind] = (texts, None)
    cats["guard_scream"] = (js_array("gadgets.js", "GUARD_SCREAMS"), None)
    cats["guard_growl"] = (js_array("gadgets.js", "GUARD_GROWLS"), None)
    cats["guard_react"] = ([r.replace("{n}", n) for r in react for n in names], None)
    cats["guard_misc"] = (["Ha! Nice try!"], None)  # gameplay.js, shot misses
    cats["dog"] = (js_array("gadgets.js", "DOG_LINES"), [DOG_VOICE])
    cats["countdown"] = (js_array("ui.js", "COUNTDOWN_WORDS"), [COUNTDOWN_VOICE])
    cats["announcer"] = (js_array("gameplay.js", "MULTIKILL_NAMES") + ["Trick shot!"], [ANNOUNCER_VOICE])
    return {k: v for k, v in cats.items() if v[0]}


# --- Rendering ---

def slug(text):
    s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:40] or "line"
    return s + "_" + hashlib.md5(text.encode("utf-8")).hexdigest()[:6]


def spoken(text, category):
    # Guards shout: end on "!" like in the browser version (not for "...", "?")
    if category.startswith("guard_") and category != "guard_scream":
        if not re.search(r"[!?]$|\.\.\.$", text):
            text = text.rstrip(".") + "!"
    if category == "announcer":
        text = text.capitalize()  # "DOUBLE KILL!" would be spelled out letter by letter
    return text


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(ROOT / "audio" / "voice"))
    ap.add_argument("--format", choices=["wav", "mp3", "ogg"], default="wav")
    ap.add_argument("--guard-voices", nargs="+", default=DEFAULT_GUARD_VOICES)
    ap.add_argument("--only", nargs="+", help="only these categories (e.g. countdown guard_spotted)")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--list", action="store_true", help="only print the lines, render nothing")
    args = ap.parse_args()

    cats = collect()
    if args.only:
        cats = {k: v for k, v in cats.items() if k in args.only or any(k.startswith(o) for o in args.only)}

    if args.list:
        for cat, (texts, _) in cats.items():
            print(f"[{cat}] {len(texts)}")
            for t in texts:
                print("   ", t)
        return

    if args.format != "wav" and not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found; use --format wav or install ffmpeg")

    try:
        from kokoro import KPipeline
        import numpy as np
        import soundfile as sf
    except ImportError:
        sys.exit("Missing packages: pip install kokoro soundfile numpy")

    pipelines = {}

    def pipeline(voice):
        lang = voice[0]  # 'a' or 'b'
        if lang not in pipelines:
            pipelines[lang] = KPipeline(lang_code=lang)
        return pipelines[lang]

    out = Path(args.out)
    manifest_path = out / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}

    total = sum(len(t) * len(v or args.guard_voices) for t, v in cats.values())
    done = 0
    for cat, (texts, voices) in cats.items():
        voices = voices or args.guard_voices
        cat_map = manifest.setdefault(cat, {})
        for voice in voices:
            folder = out / cat / voice
            folder.mkdir(parents=True, exist_ok=True)
            for text in texts:
                done += 1
                target = folder / (slug(text) + "." + args.format)
                rel = target.relative_to(ROOT).as_posix() if target.is_relative_to(ROOT) else str(target)
                files = cat_map.setdefault(text, [])
                if rel not in files:
                    files.append(rel)
                if target.exists():
                    continue
                print(f"[{done}/{total}] {cat} {voice}: {text}")
                chunks = [audio for _, _, audio in pipeline(voice)(spoken(text, cat), voice=voice, speed=args.speed)]
                if not chunks:
                    print("   (no audio, skipped)")
                    continue
                audio = np.concatenate([np.asarray(c) for c in chunks])
                wav = target.with_suffix(".wav")
                sf.write(wav, audio, SAMPLE_RATE)
                if args.format != "wav":
                    codec = ["-c:a", "libvorbis", "-q:a", "4"] if args.format == "ogg" else ["-b:a", "96k"]
                    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), *codec, str(target)], check=True)
                    wav.unlink()
            # Save after every voice, so an interrupted run keeps its progress
            manifest_path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")
            write_manifest_js(manifest, out)

    write_manifest_js(manifest, out)
    print(f"Done. Manifest: {manifest_path}")


def write_manifest_js(manifest, out):
    """manifest.js is what the game loads (a <script> also works when index.html is opened as a file).
    Only files that exist on disk are listed."""
    existing = {}
    for cat, texts in manifest.items():
        for text, files in texts.items():
            ok = [f for f in files if (ROOT / f).exists()]
            if ok:
                existing.setdefault(cat, {})[text] = ok
    (out / "manifest.js").write_text(
        "// Generated by tools/kokoro_voices.py\nwindow.CLAIM_VOICES = "
        + json.dumps(existing, indent=1, ensure_ascii=False) + ";\n",
        encoding="utf-8")


if __name__ == "__main__":
    main()
