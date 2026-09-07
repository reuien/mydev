import { DatabaseSync } from 'node:sqlite';

export function createSqliteClient(filename: string): DatabaseSync {
  const database = new DatabaseSync(filename);
  database.exec('PRAGMA foreign_keys = ON');
  return database;
}
