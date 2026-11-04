#!/bin/bash
set -e
cd "$(dirname "$0")"
exec python3 scripts/serve-preview.py --port 4301
