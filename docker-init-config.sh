#!/bin/sh
set -eu

if [ -f config.json ]; then
  echo "config.json already exists; skipping generation"
  exit 0
fi

echo "Missing config.json. Please provide the values below."

read -p "Icecast host [host.docker.internal]: " ICECAST_HOST
ICECAST_HOST=${ICECAST_HOST:-host.docker.internal}

read -p "Icecast port [8000]: " ICECAST_PORT
ICECAST_PORT=${ICECAST_PORT:-8000}

read -p "Icecast user [source]: " ICECAST_USER
ICECAST_USER=${ICECAST_USER:-source}

read -p "Icecast password [source]: " ICECAST_PASSWORD
ICECAST_PASSWORD=${ICECAST_PASSWORD:-source}

read -p "Icecast mount [/flacs.ogg]: " ICECAST_MOUNT
ICECAST_MOUNT=${ICECAST_MOUNT:-/flacs.ogg}

read -p "Music folder [/music]: " GIVEN_PATH
GIVEN_PATH=${GIVEN_PATH:-/music}

read -p "API port [7887]: " API_PORT
API_PORT=${API_PORT:-7887}

read -p "API base URL [http://127.0.0.1:7887/]: " API_BASE_URL
API_BASE_URL=${API_BASE_URL:-http://127.0.0.1:7887/}

read -p "Public stream URL [http://127.0.0.1:8000/]: " STREAM_URL
STREAM_URL=${STREAM_URL:-http://127.0.0.1:8000/}

read -p "Icecast status URL [http://127.0.0.1:8000/status-json.xsl]: " STATUS_URL
STATUS_URL=${STATUS_URL:-http://127.0.0.1:8000/status-json.xsl}

cat > config.json <<EOF
{
  "icecastserver": {
    "ICECAST_HOST": "${ICECAST_HOST}",
    "ICECAST_PORT": ${ICECAST_PORT},
    "ICECAST_USER": "${ICECAST_USER}",
    "ICECAST_PASSWORD": "${ICECAST_PASSWORD}",
    "ICECAST_MOUNT": "${ICECAST_MOUNT}"
  },
  "givenPath": "${GIVEN_PATH}",
  "apiport": ${API_PORT},
  "apiBaseUrl": "${API_BASE_URL}",
  "icecastFrontend": {
    "STREAM_URL": "${STREAM_URL}",
    "MOUNT_POINT": "${ICECAST_MOUNT}",
    "STATUS_URL": "${STATUS_URL}"
  },
  "silenceArgs": [
    "-re",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-c:a",
    "libvorbis",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-content_type",
    "audio/ogg",
    "-f",
    "ogg"
  ]
}
EOF

echo "Generated config.json from the answers you provided"
