/******************************************************************************
 * init_db.js
 *
 * Script to initialize the 'user_profiles.db' database if it doesn't already
 * exist. Creates the 'users' table with the columns needed to store:
 *   - Email (primary key)
 *   - One-time password (OTP)
 *   - User's SMTP settings (host, port, user, pass, secure)
 *   - User's Peplink credentials (client ID, client secret)
 *
 * Usage:
 *   node init_db.js
 *
 * If the 'user_profiles.db' file does not exist, this script creates it and
 * initializes the table. If it exists, it skips creation.
 ******************************************************************************/

const fs = require('fs');
const Database = require('better-sqlite3');

// Name (or path) of the SQLite database file:
const DB_FILENAME = 'user_profiles.db';

// Check if the DB file already exists
if (fs.existsSync(DB_FILENAME)) {
  console.log(`Database file "${DB_FILENAME}" already exists. Skipping initialization.`);
  process.exit(0); // Exit the script
}

console.log(`Database file "${DB_FILENAME}" does not exist. Creating and initializing...`);

// Open (or create) the database
const db = new Database(DB_FILENAME);

// Create the 'users' table with columns needed by your app
// Adjust or add columns as required for your scenario
const createTableSQL = `
  CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    otp TEXT,
    smtp_host TEXT,
    smtp_port TEXT,
    smtp_user TEXT,
    smtp_pass TEXT,
    smtp_secure TEXT,
    peplink_client_id TEXT,
    peplink_client_secret TEXT
  )
`;

db.exec(createTableSQL);

console.log(`Database "${DB_FILENAME}" initialized successfully.`);

// Close the DB connection
db.close();
