#!/usr/bin/env bash
# Starts PhyBot on macOS and Linux, installing and building on first run.
# Stays in a loop so the bot can restart itself from Discord or the dashboard.
set -uo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install Node.js 22.5 or newer from https://nodejs.org and run this script again."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies, this can take a few minutes..."
  npm install || exit 1
fi

if [ ! -f apps/web/dist/index.html ]; then
  echo "Building PhyBot..."
  npm run build || exit 1
fi

# Tells the bot a launcher is watching, so /restart and the dashboard button
# can bring it back with this terminal still attached.
export PHYBOT_SUPERVISED=1

# Exit code 42 is the bot asking to be restarted; anything else ends the loop.
while true; do
  echo "Starting PhyBot. Press Ctrl+C to stop."
  npm start
  status=$?
  if [ "$status" -ne 42 ]; then
    exit "$status"
  fi
  echo
  echo "Restarting PhyBot..."
  echo
done
