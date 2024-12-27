/******************************************************************************
 * server.js
 *
 * Main entry point:
 *   - Express setup
 *   - Session
 *   - SQLite DB init
 *   - Route mounting
 ******************************************************************************/
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const path = require('path');

// Our route files
const loginRoutes = require('./routes/loginRoutes');
const panelRoutes = require('./routes/panelRoutes');
const warrantyRoutes = require('./routes/warrantyRoutes');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'some-default-secret',
  resave: false,
  saveUninitialized: false
}));

// SQLite init
const dbPath = path.join(__dirname, 'user_profiles.db');
const db = new Database(dbPath);

// Create table if not exists
db.exec(`
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
`);

// Let's debug the schema
const tableInfo = db.prepare("PRAGMA table_info('users')").all();
console.log("DEBUG: users table columns:", tableInfo);

// Make the db accessible in routes
app.set('db', db);

// Use our routes
app.use('/', loginRoutes);
app.use('/', panelRoutes);
app.use('/', warrantyRoutes);

// GET / => redirect to /login
app.get('/', (req, res) => {
  return res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
