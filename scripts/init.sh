#!/bin/sh
# Prepares a host for `make start`: a compose (podman compose or docker
# compose), Go, the secrets of a new installation and .env. `make init`
# runs it.
#
# Without a working compose it installs one with the system's package
# manager, as root or through sudo:
#   - RHEL and its rebuilds (Rocky, AlmaLinux, CentOS Stream, Oracle Linux):
#     EPEL, then podman and podman-compose.
#   - Fedora: podman and podman-compose.
#   - Anything else: Docker and its compose plugin, from the distribution's
#     packages (apt, zypper or pacman).
# Without Go as recent as src/go.mod needs, it installs the release
# go.mod names from go.dev into /usr/local/go (make start does not need it,
# make test and run-web do). Then it generates the secrets
# (scripts/init-secrets.sh) unless they are
# there, and creates ENV_FILE (.env) from .env.example, in development
# mode, unless it exists.
#
# Usage: init.sh SECRETS_DIR [ENV_FILE]
set -eu

secrets_dir=$1
env_file=${2:-}
here=$(cd "$(dirname "$0")" && pwd)

say() { echo "init: $*"; }
fail() {
	echo "init: $*" >&2
	exit 1
}

# The compose the Makefile would use: podman compose first, as it picks.
compose_runtime() {
	if podman compose version >/dev/null 2>&1; then
		echo podman
	elif docker compose version >/dev/null 2>&1; then
		echo docker
	fi
}

if [ "$(id -u)" -eq 0 ]; then
	sudo=
elif command -v sudo >/dev/null 2>&1; then
	sudo=sudo
else
	sudo=none
fi
# as_root runs a command as root, saying so first.
as_root() {
	[ "$sudo" != none ] || fail "installing needs root: run make init as root, or install sudo"
	say "running: $sudo${sudo:+ }$*"
	$sudo "$@"
}

install_podman_rhel() {
	if command -v dnf >/dev/null 2>&1; then pm=dnf; else pm=yum; fi
	if [ "$ID" != fedora ] && ! rpm -q epel-release >/dev/null 2>&1; then
		# Rocky, AlmaLinux and CentOS ship epel-release in their own
		# repositories; RHEL and Oracle Linux get it from the EPEL project.
		major=${VERSION_ID%%.*}
		as_root "$pm" install -y epel-release ||
			as_root "$pm" install -y "https://dl.fedoraproject.org/pub/epel/epel-release-latest-$major.noarch.rpm"
	fi
	as_root "$pm" install -y podman podman-compose
}

# docker_apt_repository adds Docker's apt repository
# (https://docs.docker.com/engine/install/debian/), for Debian, Ubuntu and
# the distributions built on them.
docker_apt_repository() {
	case " $ID ${ID_LIKE:-} " in
	*" ubuntu "*) repo=ubuntu codename=${UBUNTU_CODENAME:-${VERSION_CODENAME:-}} ;;
	*" debian "*) repo=debian codename=${DEBIAN_CODENAME:-${VERSION_CODENAME:-}} ;;
	*) return 1 ;;
	esac
	[ -n "$codename" ] || return 1
	say "adding Docker's apt repository for the compose plugin ($repo $codename)"
	as_root apt-get install -y ca-certificates curl
	as_root install -m 0755 -d /etc/apt/keyrings
	as_root curl -fsSL "https://download.docker.com/linux/$repo/gpg" -o /etc/apt/keyrings/docker.asc
	as_root chmod a+r /etc/apt/keyrings/docker.asc
	echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$repo $codename stable" |
		as_root tee /etc/apt/sources.list.d/docker.list >/dev/null
	as_root apt-get update
}

install_docker() {
	if command -v apt-get >/dev/null 2>&1; then
		as_root apt-get update
		as_root apt-get install -y docker.io
		# The compose plugin's package name differs by distribution and
		# release (Ubuntu's docker-compose-v2; Docker's own repository's
		# docker-compose-plugin; Debian's docker-compose, a plugin since
		# trixie): the first that gives `docker compose` wins.
		for pkg in docker-compose-v2 docker-compose-plugin docker-compose; do
			docker compose version >/dev/null 2>&1 && break
			as_root apt-get install -y "$pkg" || true
		done
		# Older releases (Debian 12's docker-compose is the old
		# docker-compose command, not the plugin): the plugin from Docker's
		# own repository, beside the distribution's docker.
		if ! docker compose version >/dev/null 2>&1; then
			docker_apt_repository && as_root apt-get install -y docker-compose-plugin || true
		fi
	elif command -v zypper >/dev/null 2>&1; then
		as_root zypper --non-interactive install docker docker-compose
	elif command -v pacman >/dev/null 2>&1; then
		as_root pacman -S --needed --noconfirm docker docker-compose
	else
		fail "no supported package manager: install podman compose or docker compose (https://docs.docker.com/engine/install/), then run make init again"
	fi
	# A container has no systemd; the daemon is then the user's to start.
	if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
		as_root systemctl enable --now docker || say "could not start the docker service: start it before make start"
	fi
	if [ -n "$sudo" ] && [ "$sudo" != none ]; then
		say "to run docker without sudo, add yourself to the docker group (sudo usermod -aG docker $(id -un)) and log in again"
	fi
}

# Go, for what runs on the host (make test, check, lint, run-web, run-task,
# migrate; the images build in a Go container of their own). The version
# src/go.mod names: distributions' Go is often older, and RHEL's and
# Fedora's set GOTOOLCHAIN=local, so it would not fetch the newer one.
go_profile=/etc/profile.d/ascender-golang.sh

# go_version prints the version of the go command given (1.27.3), without
# switching toolchains.
go_version() {
	v=$(cd / && GOTOOLCHAIN=local "$1" env GOVERSION 2>/dev/null) || return 1
	v=${v%% *}
	echo "${v#go}"
}

# version_at_least A B: A >= B.
version_at_least() {
	[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n 1)" = "$2" ]
}

# install_curl installs curl with the system's package manager.
install_curl() {
	if command -v dnf >/dev/null 2>&1; then
		as_root dnf install -y curl
	elif command -v yum >/dev/null 2>&1; then
		as_root yum install -y curl
	elif command -v apt-get >/dev/null 2>&1; then
		as_root apt-get update && as_root apt-get install -y ca-certificates curl
	elif command -v zypper >/dev/null 2>&1; then
		as_root zypper --non-interactive install curl
	elif command -v pacman >/dev/null 2>&1; then
		as_root pacman -S --needed --noconfirm curl
	else
		return 1
	fi
}

# download URL FILE, with curl or wget (curl installed when neither is).
download() {
	if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
		install_curl || true
	fi
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL "$1" -o "$2"
	elif command -v wget >/dev/null 2>&1; then
		wget -q "$1" -O "$2"
	else
		say "neither curl nor wget is installed"
		return 1
	fi
}

# install_go installs the official release into /usr/local/go. Every step
# is checked by hand: it runs in an || list, where set -e does not apply.
install_go() {
	version=$1
	case "$(uname -s)" in
	Linux) os=linux ;;
	*)
		say "install Go $version yourself on $(uname -s) (https://go.dev/dl/)"
		return 1
		;;
	esac
	case "$(uname -m)" in
	x86_64 | amd64) arch=amd64 ;;
	aarch64 | arm64) arch=arm64 ;;
	ppc64le) arch=ppc64le ;;
	s390x) arch=s390x ;;
	*)
		say "no Go release for $(uname -m)"
		return 1
		;;
	esac
	file="go$version.$os-$arch.tar.gz"
	tmp=$(mktemp -d) || return 1
	say "downloading $file"
	download "https://dl.google.com/go/$file" "$tmp/$file" &&
		download "https://dl.google.com/go/$file.sha256" "$tmp/$file.sha256" || {
		rm -f "$tmp/$file" "$tmp/$file.sha256"
		rmdir "$tmp"
		return 1
	}
	want=$(tr -d ' \n' <"$tmp/$file.sha256")
	have=$(sha256sum "$tmp/$file" | cut -d ' ' -f 1)
	if [ "$want" != "$have" ]; then
		say "$file does not match its published SHA-256"
		rm -f "$tmp/$file" "$tmp/$file.sha256"
		rmdir "$tmp"
		return 1
	fi
	# An older Go there is kept beside it, not deleted.
	if [ -e /usr/local/go ]; then
		old=$(go_version /usr/local/go/bin/go || echo old)
		aside=/usr/local/go-$old
		[ ! -e "$aside" ] || aside=$aside-$(date +%Y%m%d%H%M%S)
		as_root mv /usr/local/go "$aside" || return 1
	fi
	as_root tar -C /usr/local -xzf "$tmp/$file" || return 1
	rm -f "$tmp/$file" "$tmp/$file.sha256"
	rmdir "$tmp"
	# First on the PATH at the next login, ahead of an older system Go.
	printf '%s\n' '# Go for Ascender development, installed by make init.' \
		'case ":$PATH:" in *:/usr/local/go/bin:*) ;; *) PATH=/usr/local/go/bin:$PATH ;; esac' |
		as_root tee "$go_profile" >/dev/null || return 1
	say "installed Go $version in /usr/local/go; it is on the PATH at your next login ($go_profile), and the Makefile uses it already"
}

ensure_go() {
	gomod="$here/../src/go.mod"
	need=$(sed -n 's/^go //p' "$gomod")
	want=$(sed -n 's/^toolchain go//p' "$gomod")
	want=${want:-$need}
	for g in "$(command -v go 2>/dev/null || true)" /usr/local/go/bin/go; do
		[ -n "$g" ] && [ -x "$g" ] || continue
		v=$(go_version "$g") || continue
		if version_at_least "$v" "$need"; then
			say "found Go $v ($g)"
			return 0
		fi
		say "Go $v ($g) is older than the $need src/go.mod needs"
	done
	install_go "$want"
}

runtime=$(compose_runtime)
if [ -n "$runtime" ]; then
	say "found $runtime compose"
else
	[ -r /etc/os-release ] || fail "unknown system (no /etc/os-release): install podman compose or docker compose, then run make init again"
	# shellcheck disable=SC1091
	. /etc/os-release
	ID=${ID:-}
	VERSION_ID=${VERSION_ID:-}
	case " $ID ${ID_LIKE:-} " in
	*" rhel "* | *" fedora "* | *" centos "* | *" rocky "* | *" almalinux "* | *" ol "*)
		say "no compose found; installing podman compose ($ID $VERSION_ID)"
		install_podman_rhel
		;;
	*)
		say "no compose found; installing docker compose ($ID $VERSION_ID)"
		install_docker
		;;
	esac
	runtime=$(compose_runtime)
	[ -n "$runtime" ] || fail "the install did not give a working podman compose or docker compose; install one, then run make init again"
	say "installed $runtime compose"
fi

# make start needs no Go: a failure here is a warning.
ensure_go || say "warning: Go was not installed; make start works without it, but make test, check and run-web need Go $(sed -n 's/^go //p' "$here/../src/go.mod") or later"

sh "$here/init-secrets.sh" "$secrets_dir" "$runtime"
# Either may be configured in the environment instead (the Makefile passes
# what it found).
[ -e "$secrets_dir/ASCENDER_DB_PASSWORD" ] || [ -n "${ASCENDER_DB_PASSWORD:-}" ] ||
	fail "$secrets_dir/ASCENDER_DB_PASSWORD is missing (see above, and deploy/README.md)"
[ -e "$secrets_dir/SECRET_KEY" ] || [ -n "${SECRET_KEY_FILE:-}" ] ||
	fail "$secrets_dir/SECRET_KEY is missing (see above, and deploy/README.md)"
say "secrets are in $secrets_dir/"

# .env from .env.example, in development mode: a local stack is reached
# over plain HTTP, where production mode's Secure cookies make login fail.
# An existing .env is left as it is.
example="$here/../.env.example"
if [ -n "$env_file" ] && [ ! -e "$env_file" ] && [ -r "$example" ]; then
	sed 's/^#ASCENDER_MODE=development$/ASCENDER_MODE=development/' "$example" >"$env_file"
	say "created $env_file from .env.example (ASCENDER_MODE=development)"
fi
say "ready: make start"
