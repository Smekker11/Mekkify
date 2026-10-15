#!/bin/sh
set -eu

if [ ! -f config.json ]; then
  echo "Error: config.json not found. Copy config-example.json to config.json and fill in the values before starting the app." >&2
  exit 1
fi

GIVEN_PATH=$(node -p "const fs=require('fs'); const cfg=JSON.parse(fs.readFileSync('config.json','utf8')); cfg.givenPath || ''")

if [ -z "$GIVEN_PATH" ]; then
  echo "Error: config.json is missing the required givenPath value." >&2
  exit 1
fi

echo "Using music path from config.json: $GIVEN_PATH"
