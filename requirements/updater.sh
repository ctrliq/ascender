#!/bin/sh
set -ue

requirements_in="$(readlink -f ./requirements.in)"
requirements="$(readlink -f ./requirements.txt)"
requirements_git="$(readlink -f ./requirements_git.txt)"
requirements_dev="$(readlink -f ./requirements_dev.txt)"
# uv resolves the same tree as pip-compile; --refresh is its -r/--rebuild, and
# unsafe packages (pip, setuptools) are emitted by default, so --allow-unsafe
# has no counterpart to carry over.
uv_compile="uv pip compile --no-strip-extras --no-header --quiet --refresh"
sanitize_git="1"

_cleanup() {
  cd /
  test "${KEEP_TMP:-0}" = 1 || rm -rf "${_tmp}"
  return 0
}

generate_requirements() {
  local input_reqs="$1"
  venv="$(pwd)/venv"
  echo "$venv"
  /usr/bin/python3.14 -m venv "${venv}"
  # shellcheck disable=SC1090
  source "${venv}/bin/activate"

  # pip / setuptools version must match the version used in AWX venv (see README.md UPGRADE BLOCKERs)
  "${venv}/bin/python3" -m pip install -U 'pip==26.2.1' 'setuptools==84.0.0' uv

  ${uv_compile} ${input_reqs} --output-file requirements.txt
  # consider the git requirements for purposes of resolving deps
  # Then comment out any git+ lines from requirements.txt
  #
  # Matching is on the package name rather than the whole requirement line: uv
  # resolves a branch ref to the commit sha it points at, so the emitted line
  # reads "certifi @ git+...@5aa52ab" where requirements_git.txt says "@devel".
  # The comment written into requirements.txt keeps the requirements_git.txt
  # wording, which is the ref this repository tracks.
  if [[ "$sanitize_git" == "1" ]] ; then
    while IFS= read -r line; do
      case "$line" in \#*|'') continue ;; esac  # skip comments and blank lines
      # "name[extras] @ git+url@ref" -> "name[extras]"
      pkg="$(printf '%s' "${line%%@*}" | sed 's/[[:space:]]*$//')"
      # Escape regex special characters for the search pattern
      # Only escape BRE metacharacters: . * ^ $ [ \
      escaped_pkg=$(printf '%s\n' "${pkg}" | sed 's/[[\.*^$]/\\&/g')
      # Add # to the start of any line matched
      sed -i "s|^${escaped_pkg} @ git+.*|# ${line%#*}  # git requirements installed separately|g" requirements.txt
    done < "${requirements_git}"
  fi;
  return 0
}

main() {
  local command="${1:-}"
  base_dir=$(pwd)
  dest_requirements="${requirements}"
  input_requirements="${requirements_in} ${requirements_git}"

  shift || true  # Remove first argument, leave remaining as package names

  _tmp=$(python -c "import tempfile; print(tempfile.mkdtemp(suffix='.awx-requirements', dir='/tmp'))")

  trap _cleanup INT TERM EXIT

  case $command in
    "run")
      NEEDS_HELP=0
    ;;
    "dev")
      dest_requirements="${requirements_dev}"
      input_requirements="${requirements_dev}"
      sanitize_git=0
      NEEDS_HELP=0
    ;;
    "upgrade")
      NEEDS_HELP=0
      if [[ $# -eq 0 ]]; then
        uv_compile="${uv_compile} --upgrade"
      else
        for package in "$@"; do
          uv_compile="${uv_compile} --upgrade-package $package"
        done
      fi
    ;;
    "outdated")
      pip list --outdated
      exit 0
    ;;
    "help")
      NEEDS_HELP=1
    ;;
    *)
      echo "" >&2
      echo "ERROR: Parameter $command not valid" >&2
      echo "" >&2
      NEEDS_HELP=1
    ;;
  esac

  if [[ "$NEEDS_HELP" == "1" ]] ; then
    echo "This script generates requirements.txt from requirements.in and requirements_git.in"
    echo "It should be run from within the awx container"
    echo ""
    echo "Usage: $0 [run|upgrade [package-name...]|dev|outdated]"
    echo ""
    echo "Commands:"
    echo "help                   Print this message"
    echo "run                    Run the process only upgrading pinned libraries from requirements.in"
    echo "upgrade [package...]   Upgrade all libraries (or specific packages if specified) to latest while respecting pinnings"
    echo "dev                    Pin the development requirements file"
    echo "outdated               List all outdated packages"
    echo ""
    exit
  fi

  if [[ ! -d /awx_devel ]] ; then
      echo "This script should be run inside the awx container" >&2
      exit
  fi

  if [[ ! -z "$(tail -c 1 "${requirements_git}")" ]]
  then
      echo "No newline at end of ${requirements_git}, please add one" >&2
      exit
  fi

  cp -vf requirements.txt "${_tmp}"
  cd "${_tmp}"

  generate_requirements "${input_requirements}"

  echo "Changing $base_dir to /awx_devel/requirements"
  cat requirements.txt | sed "s:$base_dir:/awx_devel/requirements:" > "${dest_requirements}"

  _cleanup
  return 0
}

# set EVAL=1 in case you want to source this script
test "${EVAL:-0}" -eq "1" || main "$@"
