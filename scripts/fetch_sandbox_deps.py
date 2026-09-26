#!/usr/bin/env python3
"""Fetch the native pieces of the Linux sandbox into the Android build.

  * proot + its loader + libtalloc from the Termux package repository
    (GPL-2.0 / LGPL-3.0), for every ABI the app ships, into
    android/app/src/main/jniLibs/<abi>/ as lib*.so so the package manager
    extracts them into nativeLibraryDir, the one app-owned place Android
    still lets an app exec() from.
  * a manifest of the current Alpine minirootfs (URL + SHA-256 per arch) into
    android/app/src/main/assets/sandbox/rootfs.json. The rootfs itself is
    downloaded by the app on first use, not bundled.

Everything is verified against SHA-256 sums published by the repositories
over HTTPS. Mirrors are tried in order. Outputs are gitignored; CI runs this
before Gradle. Standard library only.

Usage: python3 scripts/fetch_sandbox_deps.py [--out android/app/src/main]
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import lzma
import os
import sys
import tarfile
import time
import urllib.request

TERMUX_MIRRORS = [
    "https://packages-cf.termux.dev/apt/termux-main",
    "https://packages.termux.dev/apt/termux-main",
    "https://grimler.se/termux/termux-main",
    "https://mirror.mwt.me/termux/main",
]
ALPINE_MIRRORS = [
    "https://dl-cdn.alpinelinux.org/alpine",
    "https://mirrors.edge.kernel.org/alpine",
    "https://mirror.leaseweb.com/alpine",
]
# Android ABI -> (Termux arch, Alpine arch)
ABIS = {
    "arm64-v8a": ("aarch64", "aarch64"),
    "armeabi-v7a": ("arm", "armv7"),
    "x86_64": ("x86_64", "x86_64"),
    "x86": ("i686", "x86"),
}
TERMUX_PREFIX = "data/data/com.termux/files/usr/"


def log(msg: str) -> None:
    print(f"[sandbox-deps] {msg}", flush=True)


def fetch(url: str, attempts: int = 3) -> bytes:
    last: Exception | None = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "superdeepseek-ci"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 - retry any network error
            last = e
            time.sleep(1 + i * 2)
    raise RuntimeError(f"{url}: {last}")


def fetch_any(urls: list[str]) -> tuple[str, bytes]:
    errors = []
    for u in urls:
        try:
            return u, fetch(u)
        except Exception as e:  # noqa: BLE001
            errors.append(str(e))
    raise RuntimeError("all mirrors failed:\n  " + "\n  ".join(errors))


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------- Termux ---

def parse_packages(text: str) -> dict[str, dict[str, str]]:
    pkgs: dict[str, dict[str, str]] = {}
    for stanza in text.split("\n\n"):
        fields: dict[str, str] = {}
        for line in stanza.splitlines():
            if ":" in line and not line.startswith(" "):
                k, v = line.split(":", 1)
                fields[k.strip()] = v.strip()
        if "Package" in fields:
            pkgs[fields["Package"]] = fields
    return pkgs


def termux_index(arch: str) -> tuple[str, dict[str, dict[str, str]]]:
    errors = []
    for mirror in TERMUX_MIRRORS:
        base = f"{mirror}/dists/stable/main/binary-{arch}/Packages"
        for suffix, decode in (("", lambda b: b), (".xz", lzma.decompress)):
            try:
                raw = decode(fetch(base + suffix, attempts=2))
                return mirror, parse_packages(raw.decode("utf-8", "replace"))
            except Exception as e:  # noqa: BLE001
                errors.append(f"{base}{suffix}: {e}")
    raise RuntimeError("no Termux index:\n  " + "\n  ".join(errors))


def ar_members(deb: bytes) -> dict[str, bytes]:
    if not deb.startswith(b"!<arch>\n"):
        raise ValueError("not a .deb (ar) archive")
    pos, out = 8, {}
    while pos + 60 <= len(deb):
        hdr = deb[pos:pos + 60]
        name = hdr[0:16].decode().strip().rstrip("/")
        size = int(hdr[48:58].decode().strip())
        pos += 60
        out[name] = deb[pos:pos + size]
        pos += size + (size & 1)
    return out


def deb_files(deb: bytes) -> dict[str, tarfile.TarFile | bytes]:
    members = ar_members(deb)
    data_name = next(n for n in members if n.startswith("data.tar"))
    tf = tarfile.open(fileobj=io.BytesIO(members[data_name]), mode="r:*")
    files: dict[str, bytes] = {}
    links: dict[str, str] = {}
    for m in tf.getmembers():
        name = m.name.lstrip("./")
        if m.isfile():
            files[name] = tf.extractfile(m).read()  # type: ignore[union-attr]
        elif m.issym():
            links[name] = m.linkname
    # Resolve symlinks (libtalloc.so.2 -> libtalloc.so.2.4.x) to contents.
    for name, target in links.items():
        resolved = os.path.normpath(os.path.join(os.path.dirname(name), target)) if not target.startswith("/") else target.lstrip("/")
        if resolved in files:
            files[name] = files[resolved]
    return files  # type: ignore[return-value]


def patch_cstring(blob: bytes, old: bytes, new: bytes) -> bytes:
    """Same-length, in-place rename of a NUL-terminated string (no ELF relayout)."""
    assert len(new) <= len(old)
    needle = old + b"\0"
    if needle not in blob:
        return blob
    return blob.replace(needle, new + b"\0" * (len(old) - len(new) + 1))


def fetch_proot(out_dir: str) -> dict:
    notice = {}
    for abi, (arch, _) in ABIS.items():
        mirror, pkgs = termux_index(arch)
        got: dict[str, bytes] = {}
        versions = {}
        for pkg in ("proot", "libtalloc"):
            meta = pkgs.get(pkg)
            if not meta:
                raise RuntimeError(f"{pkg} missing from the Termux index for {arch}")
            urls = [f"{m}/{meta['Filename']}" for m in [mirror] + [x for x in TERMUX_MIRRORS if x != mirror]]
            url, deb = fetch_any(urls)
            if sha256(deb) != meta["SHA256"].lower():
                raise RuntimeError(f"SHA-256 mismatch for {url}")
            versions[pkg] = meta["Version"]
            files = deb_files(deb)
            if pkg == "proot":
                got["libproot.so"] = files[TERMUX_PREFIX + "bin/proot"]
                loader = files.get(TERMUX_PREFIX + "libexec/proot/loader")
                if loader is None:
                    raise RuntimeError(f"proot loader missing for {arch}")
                got["libproot-loader.so"] = loader
                loader32 = files.get(TERMUX_PREFIX + "libexec/proot/loader32")
                if loader32 is not None:
                    got["libproot-loader32.so"] = loader32
            else:
                lib = files.get(TERMUX_PREFIX + "lib/libtalloc.so.2")
                if lib is None:
                    cand = sorted(n for n in files if "/lib/libtalloc.so." in n)
                    if not cand:
                        raise RuntimeError(f"libtalloc.so.2 missing for {arch}")
                    lib = files[cand[0]]
                got["libtalloc.so"] = lib
        # Android only installs lib*.so from the APK, so libtalloc must be
        # called libtalloc.so; rename proot's DT_NEEDED and the library's
        # SONAME to match, in place.
        got["libproot.so"] = patch_cstring(got["libproot.so"], b"libtalloc.so.2", b"libtalloc.so")
        got["libtalloc.so"] = patch_cstring(got["libtalloc.so"], b"libtalloc.so.2", b"libtalloc.so")
        dest = os.path.join(out_dir, "jniLibs", abi)
        os.makedirs(dest, exist_ok=True)
        for name, data in got.items():
            with open(os.path.join(dest, name), "wb") as f:
                f.write(data)
            os.chmod(os.path.join(dest, name), 0o755)
        notice[abi] = {"arch": arch, "mirror": mirror, **versions}
        log(f"{abi}: proot {versions['proot']}, libtalloc {versions['libtalloc']} ({', '.join(sorted(got))})")
    return notice


# ---------------------------------------------------------------- Alpine ---

def parse_releases_yaml(text: str) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    cur: dict[str, str] | None = None
    for line in text.splitlines():
        s = line.strip()
        if s == "-" or s.startswith("- "):
            cur = {}
            items.append(cur)
            s = s[1:].strip()
        if cur is not None and ":" in s:
            k, v = s.split(":", 1)
            cur[k.strip()] = v.strip().strip('"')
    return items


def fetch_rootfs_manifest() -> dict:
    manifest: dict = {"distro": "alpine", "arches": {}}
    for abi, (_, arch) in ABIS.items():
        urls = [f"{m}/latest-stable/releases/{arch}/latest-releases.yaml" for m in ALPINE_MIRRORS]
        _, raw = fetch_any(urls)
        rel = next((i for i in parse_releases_yaml(raw.decode()) if i.get("flavor") == "alpine-minirootfs"), None)
        if not rel:
            raise RuntimeError(f"no alpine-minirootfs for {arch}")
        branch = rel.get("branch") or "latest-stable"
        path = f"{branch}/releases/{arch}/{rel['file']}"
        manifest["arches"][abi] = {
            "arch": arch,
            "version": rel.get("version", ""),
            "sha256": rel["sha256"].lower(),
            "size": int(rel.get("size", "0") or 0),
            "urls": [f"{m}/{path}" for m in ALPINE_MIRRORS],
        }
        manifest["version"] = rel.get("version", "")
        log(f"{abi}: alpine-minirootfs {rel.get('version')} ({rel['file']})")
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main"))
    args = ap.parse_args()
    out = os.path.abspath(args.out)

    notice = fetch_proot(out)
    manifest = fetch_rootfs_manifest()
    assets = os.path.join(out, "assets", "sandbox")
    os.makedirs(assets, exist_ok=True)
    manifest["proot"] = notice
    with open(os.path.join(assets, "rootfs.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    log(f"wrote {os.path.join(assets, 'rootfs.json')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
