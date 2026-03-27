/**
 * Database Backup Script
 *
 * Creates a mysqldump backup of the POS database and saves it to the backups/ directory.
 * Automatically cleans up old backups, keeping only the last 30 files.
 *
 * Usage:
 *   node backend/scripts/backup.js
 *
 * Environment variables (read from .env or process.env):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Load .env from the backend root
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = process.env.DB_PORT || '3306'
const DB_USER = process.env.DB_USER || 'root'
const DB_PASSWORD = process.env.DB_PASSWORD || ''
const DB_NAME = process.env.DB_NAME || 'pos_stock_shop'

const BACKUP_DIR = path.join(__dirname, '..', 'backups')
const MAX_BACKUPS = 30

function formatTimestamp() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('')
  // produces e.g. "20260327-143000"
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
    console.log(`[backup] Created backup directory: ${BACKUP_DIR}`)
  }
}

function runBackup() {
  const timestamp = formatTimestamp()
  const filename = `backup-${timestamp}.sql`
  const filepath = path.join(BACKUP_DIR, filename)

  // Build mysqldump command
  // Using --result-file for Windows compatibility (avoids shell redirection issues)
  const cmd = [
    'mysqldump',
    `--host=${DB_HOST}`,
    `--port=${DB_PORT}`,
    `--user=${DB_USER}`,
    `--password=${DB_PASSWORD}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--set-gtid-purged=OFF',
    `--result-file=${filepath}`,
    DB_NAME,
  ].join(' ')

  console.log(`[backup] Starting backup of database "${DB_NAME}" on ${DB_HOST}:${DB_PORT}`)
  console.log(`[backup] Output file: ${filepath}`)

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 5 * 60 * 1000 }) // 5 minute timeout
    const stats = fs.statSync(filepath)
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
    console.log(`[backup] SUCCESS - ${filename} (${sizeMB} MB)`)
    return filepath
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message
    console.error(`[backup] FAILED - ${stderr}`)

    // Clean up empty/partial file if it was created
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath)
    }

    process.exit(1)
  }
}

function cleanupOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-') && f.endsWith('.sql'))
    .map(f => ({
      name: f,
      path: path.join(BACKUP_DIR, f),
      mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime) // newest first

  if (files.length <= MAX_BACKUPS) {
    console.log(`[backup] ${files.length} backup(s) kept (max ${MAX_BACKUPS})`)
    return
  }

  const toDelete = files.slice(MAX_BACKUPS)
  for (const file of toDelete) {
    fs.unlinkSync(file.path)
    console.log(`[backup] Deleted old backup: ${file.name}`)
  }
  console.log(`[backup] Cleaned up ${toDelete.length} old backup(s), ${MAX_BACKUPS} remaining`)
}

// === Main ===
function main() {
  console.log(`[backup] ==============================`)
  console.log(`[backup] Database Backup - ${new Date().toISOString()}`)
  console.log(`[backup] ==============================`)

  ensureBackupDir()
  runBackup()
  cleanupOldBackups()

  console.log(`[backup] Done.`)
}

main()
