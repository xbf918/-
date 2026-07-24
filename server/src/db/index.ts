import sqlite3 from 'sqlite3';
import path from 'path';
import { config } from '../config';

const dbPath = path.resolve(__dirname, '..', '..', config.db.path);

let db: sqlite3.Database | null = null;

function getDb(): sqlite3.Database {
  if (!db) {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Database connection error:', err.message);
        process.exit(1);
      }
      console.log('Connected to SQLite database');
    });
  }
  return db;
}

export { getDb as db };

export function query<T>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

export function run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
