const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

class DatabaseManager {
  constructor({ userDataPath }) {
    this.dataDir = path.join(userDataPath, 'data');
    this.backupDir = path.join(userDataPath, 'backups');
    this.databasePath = path.join(this.dataDir, 'omnimanager-botillerias.db');
    this.db = null;
  }

  initialize() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.backupDir, { recursive: true });

    this.db = new DatabaseSync(this.databasePath, { timeout: 5000 });
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      PRAGMA foreign_keys=ON;

      CREATE TABLE IF NOT EXISTS omni_documents (
        path TEXT PRIMARY KEY,
        parent TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_omni_documents_parent
        ON omni_documents(parent);

      CREATE TABLE IF NOT EXISTS omni_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS omni_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_name TEXT NOT NULL,
        source_type TEXT NOT NULL,
        imported_at INTEGER NOT NULL,
        notes TEXT NOT NULL DEFAULT ''
      ) STRICT;
    `);

    const schemaVersion = this.db.prepare('SELECT value FROM omni_meta WHERE key = ?').get('schema_version');
    if (!schemaVersion) {
      this.db.prepare('INSERT INTO omni_meta(key, value, updated_at) VALUES(?, ?, ?)')
        .run('schema_version', '1', Date.now());
    }

    return this.getInfo();
  }

  getInfo() {
    if (!this.db) throw new Error('La base de datos todavía no está inicializada.');
    const integrity = this.db.prepare('PRAGMA integrity_check').get();
    const documents = this.db.prepare('SELECT COUNT(*) AS total FROM omni_documents').get();
    const migrations = this.db.prepare('SELECT COUNT(*) AS total FROM omni_migrations').get();
    return {
      path: this.databasePath,
      integrity: integrity?.integrity_check || 'unknown',
      documents: Number(documents?.total || 0),
      migrations: Number(migrations?.total || 0)
    };
  }

  recordMigration({ sourceName, sourceType, notes = '' }) {
    if (!this.db) throw new Error('La base de datos todavía no está inicializada.');
    this.db.prepare(`
      INSERT INTO omni_migrations(source_name, source_type, imported_at, notes)
      VALUES(?, ?, ?, ?)
    `).run(String(sourceName), String(sourceType), Date.now(), String(notes));
  }

  backupNow(label = 'manual') {
    if (!this.db) throw new Error('La base de datos todavía no está inicializada.');
    this.db.exec('PRAGMA wal_checkpoint(FULL)');

    const safeLabel = String(label || 'manual').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(this.backupDir, `omnimanager-${safeLabel}-${stamp}.db`);
    fs.copyFileSync(this.databasePath, target);
    return target;
  }

  close() {
    if (this.db) {
      try { this.db.close(); } catch {}
      this.db = null;
    }
  }
}

module.exports = { DatabaseManager };
