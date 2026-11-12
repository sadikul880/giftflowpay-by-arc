import { DatabaseSync } from 'node:sqlite'

/**
 * Storage for the support service: who signed in, their conversations and the admin's replies.
 * Plain SQLite, one file. Times are milliseconds since the epoch.
 */
export function openDb(path) {
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      address TEXT PRIMARY KEY,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      sign_ins INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS nonces (
      nonce TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      message TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL,
      kind TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL,
      user_seen INTEGER NOT NULL,
      admin_seen INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS tickets_address ON tickets(address, updated DESC);
    CREATE INDEX IF NOT EXISTS tickets_updated ON tickets(updated DESC);
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      author TEXT NOT NULL CHECK (author IN ('user', 'admin')),
      body TEXT NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_ticket ON messages(ticket_id, id);
  `)
  return db
}

/** A ticket row with the two flags the interfaces need: unread for the user, unread for the admin. */
export const TICKET_SELECT = `
  SELECT t.id, t.address, t.kind, t.subject, t.status, t.created, t.updated,
    (SELECT COUNT(*) FROM messages m WHERE m.ticket_id = t.id) AS messages,
    EXISTS(SELECT 1 FROM messages m WHERE m.ticket_id = t.id AND m.author = 'admin' AND m.created > t.user_seen) AS user_unread,
    EXISTS(SELECT 1 FROM messages m WHERE m.ticket_id = t.id AND m.author = 'user' AND m.created > t.admin_seen) AS admin_unread,
    (SELECT author FROM messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_author
  FROM tickets t`
