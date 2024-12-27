/******************************************************************************
 * routes/warrantyRoutes.js
 *
 * Provides:
 *   GET /warranty-check         => show the form w/ spinner
 *   POST /warranty-check        => run the Peplink check, store CSV in session
 *   GET /warranty-check/results => parse CSV to table, show on page
 *   GET /warranty-check/download => download the raw CSV
 *
 * Also logs debug info to the Node console and the browser console.
 ******************************************************************************/

const express = require('express');
const { runWarrantyCheck } = require('../peplinkCheck');
const { decrypt } = require('../cryptoUtils');
const nodemailer = require('nodemailer'); // only if you also want to email results
const router = express.Router();

/** 
 * Simple session-based check: must be logged in
 */
function requireLogin(req, res, next) {
  if (req.session && req.session.userEmail) {
    return next();
  }
  return res.redirect('/login');
}

/**
 * getDecryptedUser(db, email):
 *   Reads user row from SQLite, decrypts relevant fields, returns a user object.
 */
function getDecryptedUser(db, email) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row) return null;

  // Decrypt relevant columns
  return {
    email: row.email,
    smtp_host: decrypt(row.smtp_host),
    smtp_port: decrypt(row.smtp_port),
    smtp_user: decrypt(row.smtp_user),
    smtp_pass: decrypt(row.smtp_pass),
    smtp_secure: decrypt(row.smtp_secure),
    peplink_client_id: decrypt(row.peplink_client_id),
    peplink_client_secret: decrypt(row.peplink_client_secret)
  };
}

/**
 * parseCsvLine(line):
 *   Splits a single CSV line into columns, respecting quotes so that commas
 *   inside quotes do not break the field.
 *   Returns an array of column strings.
 */
function parseCsvLine(line) {
  let columns = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      columns.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  // push last column if any
  if (current) {
    columns.push(current);
  }
  return columns;
}

/**
 * parseCsvToTable(csv):
 *   Splits CSV by lines, uses parseCsvLine on each line,
 *   builds an HTML table string.
 */
function parseCsvToTable(csv) {
  const trimCsv = csv.trim();
  if (!trimCsv) {
    return '<p>No data.</p>';
  }

  const lines = trimCsv.split('\n');
  if (!lines.length) {
    return '<p>No lines in CSV.</p>';
  }

  // header line
  const headerLine = lines[0];
  const headerCols = parseCsvLine(headerLine).map(col => col.replace(/^"|"$/g, ''));
  let thead = '<tr>';
  for (const col of headerCols) {
    thead += `<th>${col}</th>`;
  }
  thead += '</tr>';

  let tbody = '';
  for (let i = 1; i < lines.length; i++) {
    const rowStr = lines[i].trim();
    if (!rowStr) continue; // skip blank line
    const cols = parseCsvLine(rowStr).map(col => col.replace(/^"|"$/g, ''));
    tbody += '<tr>';
    for (const c of cols) {
      tbody += `<td>${c}</td>`;
    }
    tbody += '</tr>';
  }

  return `
<table class="table table-striped">
  <thead>${thead}</thead>
  <tbody>${tbody}</tbody>
</table>
  `;
}

/**
 * getHeaderHTML(req):
 *   Builds a header bar with a Login/Logout button,
 *   logs a debug message to the browser console.
 */
function getHeaderHTML(req) {
  const isLoggedIn = !!req.session.userEmail;
  const loginLogoutBtn = isLoggedIn
    ? `<a href="/logout" class="btn btn-lm">Logout</a>`
    : `<a href="/login" class="btn btn-lm">Login</a>`;

  // We'll add a <script> tag to do a console.log in the browser
  const browserDebugScript = `
<script>
  console.log("Browser Debug: userEmail = '${isLoggedIn ? req.session.userEmail : 'not logged in'}'");
</script>
  `;

  return `
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
${browserDebugScript}
  `;
}

/**
 * getFooterHTML():
 *   Basic footer. Also logs a debug message to the browser console.
 */
function getFooterHTML() {
  const footerDebugScript = `
<script>
  console.log("Browser Debug: Footer loaded successfully.");
</script>
  `;

  return `
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
${footerDebugScript}
  `;
}

// GET /warranty-check => show form
router.get('/warranty-check', requireLogin, (req, res) => {
  const db = req.app.get('db');
  const user = getDecryptedUser(db, req.session.userEmail);
  if (!user) {
    console.log('DEBUG (Node): No user found in DB for', req.session.userEmail);
    return res.redirect('/login');
  }

  const missingPeplink = !user.peplink_client_id || !user.peplink_client_secret;
  if (missingPeplink) {
    console.log('DEBUG (Node): Missing Peplink creds for user', user.email);
  }

  const header = getHeaderHTML(req);
  const footer = getFooterHTML();

  // We'll log to Node console that we're rendering the page
  console.log('DEBUG (Node): Rendering warranty-check GET for user:', user.email);

  const disabledAttr = missingPeplink ? 'disabled' : '';
  const alertHtml = missingPeplink ? `
<div class="alert alert-warning">
  <strong>Warning!</strong> Your Peplink InControl2 credentials are missing. 
  Please go to <a href="/panel">User Panel</a> and add them before running the check.
</div>
  ` : '';

  const pageHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Warranty Check</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <style>
    .btn-lm {
      background-color: #2589BD;
      color: #ffffff;
      border: none;
    }
    .btn-lm:hover { opacity: 0.9; background-color: #2589BD; color: #ffffff; }
    .spinner-border { display: none; margin-left: 8px; vertical-align: text-bottom; }
    body {
      color: #3b5563;
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
  ${header}
  <div class="container">
    <h1>Peplink Warranty Check</h1>
    ${alertHtml}

    <form method="POST" action="/warranty-check" onsubmit="showSpinner(event)">
      <button type="submit" class="btn btn-lm" id="checkBtn" ${disabledAttr}>
        Run Warranty Check
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" id="spinner"></span>
      </button>
    </form>

    <a href="/panel" class="btn btn-secondary mt-3">Back to Panel</a>
  </div>
  ${footer}

  <script>
    console.log("Browser Debug: warranty-check GET loaded for user: '${user.email}'");
    function showSpinner(e) {
      const spinner = document.getElementById('spinner');
      spinner.style.display = 'inline-block';
      const btn = document.getElementById('checkBtn');
      btn.disabled = true;
      console.log("Browser Debug: Spinner displayed, button disabled, form submitted.");
    }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
  `;

  res.send(pageHTML);
});

// POST /warranty-check => run the check
router.post('/warranty-check', requireLogin, async (req, res) => {
  const db = req.app.get('db');
  const user = getDecryptedUser(db, req.session.userEmail);
  if (!user) {
    console.log('DEBUG (Node): No user found for post /warranty-check');
    return res.redirect('/login');
  }

  if (!user.peplink_client_id || !user.peplink_client_secret) {
    console.log('DEBUG (Node): Missing peplink creds at post /warranty-check');
    return res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Warranty Check Error</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body>
  <div class="container mt-5">
    <div class="alert alert-danger">
      Missing Peplink credentials. <a href="/panel">Go to Panel</a>
    </div>
  </div>
</body>
</html>
    `);
  }

  console.log('DEBUG (Node): Running warranty check for user:', user.email);

  try {
    const csv = await runWarrantyCheck(user.peplink_client_id, user.peplink_client_secret);

    console.log('DEBUG (Node): CSV length =', csv.length);

    // store CSV in session
    req.session.lastCsv = csv;

    return res.redirect('/warranty-check/results');
  } catch (err) {
    console.log('DEBUG (Node): error from runWarrantyCheck =>', err);
    return res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Warranty Check Error</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body class="p-4">
  <div class="container">
    <div class="alert alert-danger">
      Error running warranty check: ${err.message}
    </div>
    <a href="/warranty-check" class="btn btn-secondary">Back</a>
  </div>
</body>
</html>
    `);
  }
});

// GET /warranty-check/results => parse CSV into table, show
router.get('/warranty-check/results', requireLogin, (req, res) => {
  const header = getHeaderHTML(req);
  const footer = getFooterHTML();

  const csv = req.session.lastCsv || '';
  console.log('DEBUG (Node): /warranty-check/results => CSV length =', csv.length);

  // parse
  const tableHtml = parseCsvToTable(csv);
  // If tableHtml is a short string or "No data", that might indicate parse issues

  // We'll embed a script log in the HTML
  const debugBrowserScript = `
<script>
  console.log("Browser Debug: Rendered results with CSV length = ${csv.length}");
</script>
  `;

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Warranty Check Results</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <style>
    .btn-lm {
      background-color: #2589BD;
      color: #ffffff;
      border: none;
    }
    .btn-lm:hover { opacity: 0.9; background-color: #2589BD; color: #ffffff; }
  </style>
</head>
<body>
  ${header}
  <div class="container">
    <h1>Warranty Check Results</h1>
    ${tableHtml}
    <div class="mt-3">
      <a href="/warranty-check/download" class="btn btn-lm">Download CSV</a>
      <a href="/warranty-check" class="btn btn-secondary">Back</a>
    </div>
  </div>
  ${footer}
  ${debugBrowserScript}
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
  `);
});

// GET /warranty-check/download => send CSV as an attachment
router.get('/warranty-check/download', requireLogin, (req, res) => {
  const csv = req.session.lastCsv || '';
  console.log('DEBUG (Node): /warranty-check/download => CSV length =', csv.length);

  if (!csv) {
    return res.redirect('/warranty-check');
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="warranty_results.csv"');
  res.send(csv);
});

module.exports = router;
