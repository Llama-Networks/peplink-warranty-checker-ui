/******************************************************************************
 * routes/panelRoutes.js
 *
 * Now encrypts user data at rest using cryptoUtils. On read, decrypt; on write, encrypt.
 ******************************************************************************/
const express = require('express');
const router = express.Router();
const { encrypt, decrypt } = require('../cryptoUtils');  // NEW import

function requireLogin(req, res, next) {
  if (req.session && req.session.userEmail) {
    return next();
  }
  return res.redirect('/login');
}

function getHeaderHTML(req) {
  // (Same as before) - Show "Logout" if logged in, else "Login"
  const isLoggedIn = !!req.session.userEmail;
  const loginLogoutBtn = isLoggedIn
    ? `<a href="/logout" class="btn btn-lm">Logout</a>`
    : `<a href="/login" class="btn btn-lm">Login</a>`;

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
  `;
}

function getFooterHTML() {
  return `
<footer class="mt-5 py-3 bg-light footer">
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
}

// GET /panel => show form
router.get('/panel', requireLogin, (req, res) => {
  const db = req.app.get('db');
  const userRow = db.prepare('SELECT * FROM users WHERE email = ?')
    .get(req.session.userEmail);

  // DECRYPT fields before displaying
  const user = {
    email: userRow.email,
    // For data that might be unencrypted or sensitive:
    smtp_host: decrypt(userRow.smtp_host),
    smtp_port: decrypt(userRow.smtp_port),
    smtp_user: decrypt(userRow.smtp_user),
    smtp_pass: decrypt(userRow.smtp_pass),
    smtp_secure: decrypt(userRow.smtp_secure),
    peplink_client_id: decrypt(userRow.peplink_client_id),
    peplink_client_secret: decrypt(userRow.peplink_client_secret)
  };

  // Now use user.xyz in your form
  const checked25  = (user.smtp_port === '25')  ? 'selected' : '';
  const checked465 = (user.smtp_port === '465') ? 'selected' : '';
  const checked587 = (user.smtp_port === '587') ? 'selected' : '';

  const secureTrueSelected = (user.smtp_secure === 'true') ? 'selected' : '';
  const secureFalseSelected = (user.smtp_secure === 'false') ? 'selected' : '';

  const header = getHeaderHTML(req);
  const footer = getFooterHTML();

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>User Panel</title>
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
    <h1>User Panel for ${user.email}</h1>

    <form method="POST" action="/panel" class="card card-body mb-3">
      <h3>SMTP Settings</h3>
      <div class="mb-3">
        <label>Host</label>
        <input type="text" name="smtp_host" class="form-control" value="${user.smtp_host || ''}">
      </div>
      <div class="mb-3">
        <label>Port</label>
        <select name="smtp_port" class="form-select">
          <option value="25"  ${checked25}>25 (plain or STARTTLS)</option>
          <option value="465" ${checked465}>465 (implicit SSL)</option>
          <option value="587" ${checked587}>587 (STARTTLS)</option>
          <option value="${user.smtp_port || ''}" selected>Custom (${user.smtp_port || ''})</option>
        </select>
      </div>
      <div class="mb-3">
        <label>Secure</label>
        <select name="smtp_secure" class="form-select">
          <option value="true"  ${secureTrueSelected}>true (SSL/secure)</option>
          <option value="false" ${secureFalseSelected}>false (plain/STARTTLS)</option>
        </select>
      </div>
      <div class="mb-3">
        <label>SMTP User</label>
        <input type="text" name="smtp_user" class="form-control" value="${user.smtp_user || ''}">
      </div>
      <div class="mb-3">
        <label>SMTP Pass</label>
        <input type="password" name="smtp_pass" class="form-control" value="${user.smtp_pass || ''}">
      </div>

      <h3>Peplink Credentials</h3>
      <div class="mb-3">
        <label>Peplink Client ID</label>
        <input type="text" name="peplink_client_id" class="form-control" value="${user.peplink_client_id || ''}">
      </div>
      <div class="mb-3">
        <label>Peplink Client Secret</label>
        <input type="password" name="peplink_client_secret" class="form-control" value="${user.peplink_client_secret || ''}">
      </div>

      <button type="submit" class="btn btn-lm">Save</button>
    </form>

    <a href="/warranty-check" class="btn btn-lm">Go to Warranty Check</a>
  </div>
  ${footer}
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
  `);
});

// POST /panel => update user’s data
router.post('/panel', requireLogin, (req, res) => {
  const db = req.app.get('db');
  const email = req.session.userEmail;
  const {
    smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure,
    peplink_client_id, peplink_client_secret
  } = req.body;

  // ENCRYPT user inputs before storing
  const enc_smtp_host = encrypt(smtp_host);
  const enc_smtp_port = encrypt(smtp_port);
  const enc_smtp_user = encrypt(smtp_user);
  const enc_smtp_pass = encrypt(smtp_pass);
  const enc_smtp_secure = encrypt(smtp_secure);
  const enc_peplink_client_id = encrypt(peplink_client_id);
  const enc_peplink_client_secret = encrypt(peplink_client_secret);

  db.prepare(`
    UPDATE users
    SET
      smtp_host = ?,
      smtp_port = ?,
      smtp_user = ?,
      smtp_pass = ?,
      smtp_secure = ?,
      peplink_client_id = ?,
      peplink_client_secret = ?
    WHERE email = ?
  `).run(
    enc_smtp_host,
    enc_smtp_port,
    enc_smtp_user,
    enc_smtp_pass,
    enc_smtp_secure,
    enc_peplink_client_id,
    enc_peplink_client_secret,
    email
  );

  const header = getHeaderHTML(req);
  const footer = getFooterHTML();
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Settings Updated</title>
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
  </style>
</head>
<body>
  ${header}
  <div class="container">
    <h1>Settings Updated!</h1>
    <a href="/warranty-check" class="btn btn-lm">Return to Warranty Checker</a>
  </div>
  ${footer}
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
  `);
});

module.exports = router;
