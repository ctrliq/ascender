#!/bin/sh
# The checks a commit runs, from .git/hooks/pre-commit (`make hooks`, which
# `make init` runs, installs it). The quick ones CI would otherwise fail on;
# vet, lint and the tests stay with `make check`, `make lint` and CI.
#
#   - Anything under src/ or docs/ staged: `make fmt-check` (gofmt, the
#     templates' layout, the API JSON and the documentation tables).
#   - src/go.mod or src/go.sum staged: `make tidy-check` and
#     `make licenses-check` (licenses/go/ follows the modules).
#   - Every executable file in pre-commit-user/ (git-ignored: your own),
#     with the staged files in CHANGED_FILES.
#
# The checks read the working tree, not the index: stage what they look at.
# ASCENDER_SKIP_HOOKS=1 (or git commit --no-verify) skips them all.
set -u

[ -z "${ASCENDER_SKIP_HOOKS:-}" ] || exit 0
cd "$(git rev-parse --show-toplevel)" || exit 1

staged=$(git diff --cached --name-only --diff-filter=ACMR)
[ -n "$staged" ] || exit 0
fail=0

check() {
	echo "pre-commit: make $1"
	make -s "$1" || {
		echo "pre-commit: make $1 failed: $2 (or commit with ASCENDER_SKIP_HOOKS=1)" >&2
		fail=1
	}
}

if printf '%s\n' "$staged" | grep -qE '^(src|docs)/'; then
	check fmt-check "run make check (it rewrites what needs it), stage the result"
fi
if printf '%s\n' "$staged" | grep -qE '^src/go\.(mod|sum)$'; then
	check tidy-check "run go mod tidy in src/"
	check licenses-check "run make licenses, stage licenses/go/"
fi

if [ -d pre-commit-user ]; then
	CHANGED_FILES=$staged
	export CHANGED_FILES
	for script in $(find pre-commit-user -type f | sort); do
		[ -x "$script" ] || continue
		echo "pre-commit: $script"
		"./$script" || {
			echo "pre-commit: $script failed" >&2
			fail=1
		}
	done
fi

exit $fail
