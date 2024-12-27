/******************************************************************************
 * routes/panelRoutes.js
 *
 * A user panel to update:
 *   - SMTP settings
 *   - Peplink clientId/clientSecret
 ******************************************************************************/
const express = require('express');
const router = express.Router();

function requireLogin(req, res, next) {
  if (req.session && req.session.userEmail) {
    return next();
  }
  return res.redirect('/login');
}

// GET /panel => show form
router.get('/panel', requireLogin, (req, res) => {
  const db = req.app.get('db');
  const user = db.prepare('SELECT * FROM users WHERE email = ?')
    .get(req.session.userEmail);

  // We'll build a Bootstrap form
  // Provide a link back to /warranty-check or something
  // Also show the user's existing data
  const checked25  = (user.smtp_port === '25')  ? 'selected' : '';
  const checked465 = (user.smtp_port === '465') ? 'selected' : '';
  const checked587 = (user.smtp_port === '587') ? 'selected' : '';

  const secureTrueSelected = (user.smtp_secure === 'true') ? 'selected' : '';
  const secureFalseSelected = (user.smtp_secure === 'false') ? 'selected' : '';

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>User Panel</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body class="p-4">
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
        <option value="25" ${checked25}>25 (plain or STARTTLS)</option>
        <option value="465" ${checked465}>465 (implicit SSL)</option>
        <option value="587" ${checked587}>587 (STARTTLS)</option>
        <option value="${user.smtp_port || ''}" selected>Custom (${user.smtp_port || ''})</option>
      </select>
    </div>
    <div class="mb-3">
      <label>Secure</label>
      <select name="smtp_secure" class="form-select">
        <option value="true" ${secureTrueSelected}>true (SSL/secure from start)</option>
        <option value="false" ${secureFalseSelected}>false (plain or STARTTLS upgrade)</option>
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

    <button type="submit" class="btn btn-success">Save</button>
  </form>

  <a href="/warranty-check" class="btn btn-primary">Go to Warranty Check</a>
  <a href="/logout" class="btn btn-secondary">Logout</a>
</div>
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
    smtp_host || '',
    smtp_port || '',
    smtp_user || '',
    smtp_pass || '',
    smtp_secure || '',
    peplink_client_id || '',
    peplink_client_secret || '',
    email
  );

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Settings Updated</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body class="p-4">
<div class="container">
  <h1>Settings Updated!</h1>
  <a href="/panel" class="btn btn-secondary">Back to Panel</a>
</div>
</body>
</html>
  `);
});

module.exports = router;
