#!/bin/sh
# Installs Seatworks into the Paseo on this machine, from its Git source, once what it needs is here.
set -eu

usage() {
  cat <<'USAGE'
Installs Seatworks into the Paseo on this machine.
  curl -fsSL https://raw.githubusercontent.com/sting9k/seatworks/main/install.sh | sh
  sh install.sh --ref <branch|tag|commit>    a release other than the default branch's
  sh install.sh --dir <path>                 a directory on this machine, for whoever builds Seatworks
Run again once installed, it says whether a newer release is out.
USAGE
}

PLUGIN_ID=seatworks
SOURCE="sting9k/seatworks"
REF=""
GIVEN=""
PASEO_MIN="0.10.0"
NODE_MIN="22.13.0"

say() { printf '%s\n' "$*"; }
die() {
  printf 'seatworks: %s\n' "$*" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --ref)
      [ $# -ge 2 ] || die "--ref needs a branch, tag or commit"
      REF="$2"
      GIVEN="$GIVEN --ref"
      shift 2
      ;;
    --dir)
      [ $# -ge 2 ] || die "--dir needs a path"
      [ -f "$2/paseo-plugin.json" ] || die "$2 holds no paseo-plugin.json"
      SOURCE="$(cd "$2" && pwd)"
      GIVEN="$GIVEN --dir"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) die "unknown argument $1 (try --help)" ;;
  esac
done

# True when version $1 is at least $2, both as x.y.z.
at_least() {
  printf '%s\n%s\n' "$2" "$1" | sort -t. -k1,1n -k2,2n -k3,3n -C
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is not on PATH: $2"
}

need git "install git first"
need node "install Node.js $NODE_MIN or newer first"
need npm "Paseo builds the plugin with npm, which comes with Node.js"
need paseo "install Paseo $PASEO_MIN or newer first (https://paseo.sh), and start it once"

node_version="$(node -p 'process.versions.node')"
at_least "$node_version" "$NODE_MIN" || die "Node.js $node_version is too old: Seatworks needs $NODE_MIN or newer"
paseo_version="$(paseo --version | sed 's/[^0-9.].*$//')"
at_least "$paseo_version" "$PASEO_MIN" || die "Paseo $paseo_version is too old: Seatworks needs $PASEO_MIN or newer"

if paseo plugin ls "$PLUGIN_ID" >/dev/null 2>&1; then
  say "Seatworks is already installed."
  if [ -n "$GIVEN" ]; then
    say "The options ${GIVEN# } are for a first install only, so they were not used here."
    say "To install it from another source, remove Seatworks from Paseo's plugins first, then run this again."
  fi
  say "Whether a newer release is out:"
  paseo plugin update "$PLUGIN_ID" --check || true
  say "To update, run: paseo plugin update $PLUGIN_ID"
  exit 0
fi

say "Installing Seatworks from $SOURCE${REF:+ at $REF}."
if [ -n "$REF" ]; then
  paseo plugin install "$SOURCE" --ref "$REF"
else
  paseo plugin install "$SOURCE"
fi

say ""
say "Seatworks is installed. Next:"
say "  1. Open Seatworks in Paseo's sidebar, then Plugin. Under Templates, install the way of working your team"
say "     runs: SLP comes with Seatworks."
say "  2. Under Agent profiles on that page, match each name the template gives to an agent profile of yours,"
say "     or add one of that name in Paseo's settings."
say "  3. Attach a project on Seatworks' page, or run \"Open a Seatworks team here\" from the command center"
say "     in a workspace."
say "  4. Set a key under Settings, Classifier, so the watch can tell an owner when to look; without it the team"
say "     still works, less watched."
