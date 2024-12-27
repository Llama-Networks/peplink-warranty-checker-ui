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

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'some-default-secret',
  resave: false,
  saveUninitialized: false
}));

// SQLite init
const dbPath = path.join(__dirname, 'user_profiles.db');
const db = new Database(dbPath);

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

console.log("DEBUG: users table columns:", db.prepare("PRAGMA table_info('users')").all());

// Make db accessible
app.set('db', db);

// Use our routes
app.use('/', loginRoutes);
app.use('/', panelRoutes);
app.use('/', warrantyRoutes);

// GET / => cover page
app.get('/', (req, res) => {
  const isLoggedIn = !!req.session.userEmail;
  const loginLogoutBtn = isLoggedIn
    ? `<a href="/logout" class="btn btn-lm">Logout</a>`
    : `<a href="/login" class="btn btn-lm">Login</a>`;
  const headerHTML = `
<nav class="navbar navbar-expand-lg navbar-light bg-light mb-4">
  <div class="container-fluid">
    <a class="navbar-brand" href="https://www.peplinkwarrantycheck.com">
      <img src="https://f000.backblazeb2.com/file/llama-public/llama-logo.png" 
           width="176px" height="80px" alt="Logo" class="d-inline-block align-text-top">
    </a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" 
            data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" 
            aria-expanded="false" aria-label="Toggle navigation">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="navbarSupportedContent">
      <ul class="navbar-nav ms-auto mb-2 mb-lg-0">
        <li class="nav-item"><a class="nav-link" href="/warranty-check">Warranty Check</a></li>
        <li class="nav-item"><a class="nav-link" href="#">Privacy Policy</a></li>
      </ul>
      ${loginLogoutBtn}
    </div>
  </div>
</nav>
`;

  const footerHTML = `
<footer class="mt-5 py-3 bg-light">
  <div class="container text-center">
    <p class="mb-1">&copy; 2024 Llama Networks LLC</p>
    <small>
      <a href="https://www.llamanetworks.com/privacy-policy" target="_blank">Privacy Policy</a> | 
      <a href="https://www.llamanetworks.com/terms-of-use" target="_blank">Terms of Use</a> | 
      <a href="https://www.llamanetworks.com/cookie-policy" target="_blank">Cookie Policy</a>
    </small>
  </div>
</footer>
`;

  const pageHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Peplink Warranty Checker</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <style>
    .btn-lm {
      background-color: #2589BD;
      color: #ffffff;
      border: none;
    }
    .btn-lm:hover {
      opacity: 0.9;
      background-color: #2589BD;
      color: #ffffff;
    }
    html, body {
      height: 100%;
    }
    body {
      display: flex;
      flex-direction: column;
      text-align: center;
      color: #3b5563;
    }
    .cover-container {
      max-width: 42em;
      margin-top: auto;
      margin-bottom: auto;
    }
    .cover-heading {
      font-size: 3.5rem;
    }
    .navbar {
      color: #3b5563;
    }
    .footer {
      color: #3b5563;
    }
  </style>
</head>
<body>
  ${headerHTML}
  <div class="cover-container mx-auto">
    <h1 class="cover-heading">Welcome to Peplink Warranty Check</h1>
    <p class="lead">Easily verify device warranties using the InControl2 API.</p>
    <p>
      <a href="/login" class="btn btn-lm btn-lg">Get Started</a>
    </p>
  </div>
  ${footerHTML}
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
  `;

  res.send(pageHTML);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
