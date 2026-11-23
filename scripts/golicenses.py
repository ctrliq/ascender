#!/usr/bin/env python3
"""Write licenses/go/: the license of every Go module compiled into the
binaries, which the images ship under /usr/share/licenses/ascender.

    python3 scripts/golicenses.py [--check]

(make licenses runs it; make licenses-check, which CI runs, passes --check.)

The modules are those `go list -deps` finds for ./cmd/ascender-web and
./cmd/ascender-task, built as the images build them (CGO_ENABLED=0) for
each platform the release images are published for. Each module gets
licenses/go/<name>.txt: a line naming the module and version, then its
LICENSE (or COPYING) and, where the module has them, its NOTICE (which
Apache-2.0 requires to be passed on) and PATENTS. A file for a module that
is no longer linked is removed. Nothing else under licenses/ is touched:
those texts are kept by hand.

--check changes nothing and lists what is missing, stale or different
(exit status 1 when anything is).
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
OUT = os.path.join(ROOT, "licenses", "go")
COMMANDS = ["./cmd/ascender-web", "./cmd/ascender-task"]
# The platforms .github/workflows/release.yml publishes.
PLATFORMS = [("linux", "amd64"), ("linux", "arm64")]

LICENSE_RE = re.compile(r"(?i)^(licen[cs]e|copying)(\.md|\.txt)?$")
EXTRA_RE = re.compile(r"(?i)^(notice|patents)(\.md|\.txt)?$")


def linked_modules():
    """(path, version, dir) of every non-main module linked into a binary."""
    found = {}
    for goos, goarch in PLATFORMS:
        env = dict(os.environ, GOOS=goos, GOARCH=goarch, CGO_ENABLED="0", GOFLAGS="-mod=readonly")
        out = subprocess.run(
            ["go", "list", "-deps", "-f",
             "{{with .Module}}{{if not .Main}}{{.Path}}\t{{.Version}}\t{{.Dir}}{{end}}{{end}}", *COMMANDS],
            cwd=SRC, env=env, check=True, capture_output=True, text=True).stdout
        for line in out.splitlines():
            if line.strip():
                path, version, d = line.split("\t")
                found[path] = (path, version, d)
    return sorted(found.values())


def file_name(path):
    """licenses/go file name for a module path: github.com/jackc/pgx/v5 is
    jackc-pgx-v5, golang.org/x/net golang-x-net, gopkg.in/yaml.v3 yaml.v3."""
    name = path
    for prefix, repl in (("github.com/", ""), ("golang.org/x/", "golang-x-"), ("gopkg.in/", "")):
        if name.startswith(prefix):
            name = repl + name[len(prefix):]
            break
    return name.replace("/", "-") + ".txt"


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def license_text(path, version, d):
    names = sorted(os.listdir(d))
    licenses = [n for n in names if LICENSE_RE.match(n)]
    if not licenses:
        sys.exit(f"golicenses: {path} {version} has no LICENSE or COPYING file in {d}")
    text = f"{path} {version}\n\n"
    parts = [read(os.path.join(d, n)) for n in licenses]
    for n in names:
        if EXTRA_RE.match(n):
            parts.append(f"--- {n} ---\n\n" + read(os.path.join(d, n)))
    text += "\n".join(p if p.endswith("\n") else p + "\n" for p in parts)
    return text


def main():
    check = sys.argv[1:] == ["--check"]
    if sys.argv[1:] not in ([], ["--check"]):
        sys.exit(__doc__)
    want = {}
    for path, version, d in linked_modules():
        name = file_name(path)
        if name in want:
            sys.exit(f"golicenses: two modules map to {name}")
        want[name] = license_text(path, version, d)
    have = set(os.listdir(OUT)) if os.path.isdir(OUT) else set()
    problems = []
    for name, text in sorted(want.items()):
        p = os.path.join(OUT, name)
        current = read(p) if name in have else None
        if current == text:
            continue
        problems.append(("missing " if current is None else "outdated ") + os.path.relpath(p, ROOT))
        if not check:
            os.makedirs(OUT, exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                f.write(text)
    for name in sorted(have - set(want)):
        p = os.path.join(OUT, name)
        problems.append("not linked " + os.path.relpath(p, ROOT))
        if not check:
            os.remove(p)
    for line in problems:
        print(line)
    if check and problems:
        print("licenses/go does not match the linked modules: run make licenses", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
