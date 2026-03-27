#!/usr/bin/env bash
# Database Backup Script (Linux/macOS)
# Run: bash backend/scripts/backup.sh
# Schedule with cron for automated backups:
#   0 2 * * * /path/to/backend/scripts/backup.sh >> /var/log/pos-backup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

node scripts/backup.js
exit $?
