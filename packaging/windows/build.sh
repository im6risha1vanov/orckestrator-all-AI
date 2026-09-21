#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="/tmp/Artel-windows"
APP="$OUT/Artel/app"
STORE="/cursor/stores/bc-174b639d-37b5-4f65-86c8-c2e1b35680ce/media"
SELF_ART="/cursor/stores/bc-a0121d1a-dec7-523a-906c-14c3b3e12849/artifacts"

rm -rf "$OUT"
mkdir -p "$APP"

# Dereference pnpm symlinks so Windows unzip gets real folders, not Linux links.
cp -aL "$ROOT/.next/standalone/." "$APP/"
mkdir -p "$APP/.next"
cp -aL "$ROOT/.next/static" "$APP/.next/static"
cp -aL "$ROOT/public" "$APP/public"

# Baked Linux build paths would make Next look for /workspace on the PC.
python3 - <<PY
from pathlib import Path
app = Path("$APP")
for rel in ["server.js", ".next/required-server-files.json"]:
    p = app / rel
    t = p.read_text(encoding="utf-8")
    if "/workspace" in t:
        p.write_text(t.replace("/workspace", "."), encoding="utf-8")
        print("patched", rel)
PY

copy_pkg() {
  local name="$1"
  local src="$2"
  mkdir -p "$APP/node_modules/$name"
  cp -aL "$src/." "$APP/node_modules/$name/"
}

cd "$ROOT"
HELPERS_SRC="$(node -e "console.log(require('path').dirname(require.resolve('@swc/helpers/package.json')))")"
TSLIB_SRC="$(dirname "$(dirname "$HELPERS_SRC")")/tslib"
copy_pkg "@swc/helpers" "$HELPERS_SRC"
copy_pkg "tslib" "$TSLIB_SRC"

mkdir -p /tmp/win-swc
cd /tmp/win-swc
rm -rf package
curl -fsSL "https://registry.npmjs.org/@next/swc-win32-x64-msvc/-/swc-win32-x64-msvc-16.3.5.tgz" -o swc.tgz
tar -xzf swc.tgz
mkdir -p "$APP/node_modules/@next/swc-win32-x64-msvc"
cp -a package/. "$APP/node_modules/@next/swc-win32-x64-msvc/"

cp "$ROOT/packaging/windows/boot-server.js" "$APP/boot-server.js"
rm -rf "$APP/.git" "$APP/.next/cache"

cd "$APP"
python3 - <<'PY'
"""Hoist pnpm nested packages so Windows Node can resolve @next/env, styled-jsx, …"""
import shutil
from pathlib import Path

nm = Path("node_modules")
pnpm = nm / ".pnpm"
skip = {"next", "react", "react-dom", "sharp"}
copied = []
if pnpm.exists():
    for p in pnpm.glob("*/node_modules/*"):
        items = []
        if p.name.startswith("@"):
            if p.is_dir():
                for s in p.iterdir():
                    items.append((f"{p.name}/{s.name}", s))
        else:
            items.append((p.name, p))
        for name, src in items:
            if name in skip or name.startswith("@img/"):
                continue
            dest = nm / name
            if dest.exists():
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(src.resolve(), dest, symlinks=False, dirs_exist_ok=True)
            copied.append(name)
    shutil.rmtree(pnpm, ignore_errors=True)
print("hoisted", copied)
PY

# Confirm no remaining symlinks in the payload Windows will unzip.
if find node_modules -type l | grep -q .; then
  echo "warning: leftover symlinks:" >&2
  find node_modules -type l | head
  find node_modules -type l -print0 | while IFS= read -r -d '' link; do
    target="$(readlink -f "$link")"
    rm -f "$link"
    if [[ -d "$target" ]]; then
      cp -aL "$target" "$link"
    elif [[ -f "$target" ]]; then
      cp -aL "$target" "$link"
    fi
  done
fi
NODE_ENV=production node -e "require('@next/env'); require('next'); require('@swc/helpers/_/_interop_require_default'); console.log('ok: next + env')"

# Next resolves @next/env from next/node_modules when the top-level copy is missed on extract.
python3 - <<'PY'
import shutil
from pathlib import Path
nm = Path("node_modules")
nested = nm / "next" / "node_modules"
for name in ("@next/env", "styled-jsx", "client-only"):
    src = nm / name
    dest = nested / name
    if src.exists() and not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(src, dest, dirs_exist_ok=True)
        print("nested", name)
PY

cd "$ROOT/packaging/windows"
rm -f rsrc_windows_amd64.syso
"$(go env GOPATH)/bin/goversioninfo" -64 -icon icon.ico -manifest app.manifest -o rsrc_windows_amd64.syso
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w -H windowsgui" -o "$OUT/Artel/Artel.exe" .
cp README-WINDOWS.txt "$OUT/Artel/README.txt"
cp server-console.cmd "$OUT/Artel/Сервер-в-консоли.cmd"
cp icon.ico "$OUT/Artel/Artel.ico"
cp artel-icon.png "$OUT/Artel/artel-icon.png"
echo "2026-09-20e" > "$OUT/Artel/build-id.txt"
cat > "$OUT/Artel/desktop.ini" <<'INI'
[.ShellClassInfo]
IconResource=Artel.exe,0
InfoTip=Артель — оркестратор агентов
INI

# Zip contents at archive root so extract-into C:\Artel does not nest Artel\Artel\.
cd "$OUT/Artel"
rm -f /tmp/Artel-windows.zip
zip -r -X /tmp/Artel-windows.zip . -q

mkdir -p /opt/cursor/artifacts "$STORE" "$SELF_ART"
cp -f /tmp/Artel-windows.zip /opt/cursor/artifacts/Artel-windows.zip
cp -f /tmp/Artel-windows.zip "$STORE/Artel-windows.zip"
cp -f /tmp/Artel-windows.zip "$SELF_ART/Artel-windows.zip"

# Put the new exe where the user already double-clicks (media/Artel).
# Do not wipe that folder — it is a FUSE store and may contain a nested .git.
mkdir -p "$STORE/Artel/app"
cp -f "$OUT/Artel/Artel.exe" "$STORE/Artel/Artel.exe"
cp -f "$OUT/Artel/README.txt" "$STORE/Artel/README.txt"
cp -f "$OUT/Artel/build-id.txt" "$STORE/Artel/build-id.txt"
cp -f "$ROOT/packaging/windows/server-console.cmd" "$STORE/Artel/Сервер-в-консоли.cmd" || true
cp -f "$APP/boot-server.js" "$STORE/Artel/app/boot-server.js"

ls -lh /opt/cursor/artifacts/Artel-windows.zip "$OUT/Artel/Artel.exe"
python3 - <<'PY'
import zipfile
z=zipfile.ZipFile('/tmp/Artel-windows.zip')
sym=0
for i in z.infolist():
    # Unix symlink: high bits of external attr
    if (i.external_attr >> 16) & 0o170000 == 0o120000:
        sym+=1
        if sym<=5:
            print('SYMLINK IN ZIP', i.filename)
print('symlink count', sym)
print('exe', [i.filename for i in z.infolist() if i.filename.endswith('Artel.exe')])
print('boot', any(i.filename.endswith('boot-server.js') for i in z.infolist()))
PY
