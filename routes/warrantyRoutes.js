/******************************************************************************
 * routes/warrantyRoutes.js
 *
 * Provides:
 *   GET /warranty-check => shows a page with a button to run the check
 *   POST /warranty-check => actually runs the check, displays CSV
 ******************************************************************************/
const express = require('express');
const { runWarrantyCheck } = require('../peplinkCheck');

const router = express.Router();

function requireLogin(req, res, next) {
  if (req.session && req.session.userEmail) {
    return next();
  }
  return res.redirect('/login');
}

// GET /warranty-check => show page
router.get('/warranty-check', requireLogin, (req, res) => {
  const db = req.app.get('db');
  const user = db.prepare('SELECT * FROM users WHERE email = ?')
    .get(req.session.userEmail);

  // If either clientId or clientSecret is empty, show a callout and disable button
  const missingPeplink = (!user.peplink_client_id || !user.peplink_client_secret);

  let alertHtml = '';
  if (missingPeplink) {
    alertHtml = `
<div class="alert alert-warning">
  <strong>Warning!</strong> Your Peplink InControl2 credentials are missing. 
  Please go to <a href="/panel">User Panel</a> and add them before running the check.
</div>
    `;
  }

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Warranty Check</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body class="p-4">
<div class="container">
  <h1>Peplink Warranty Check</h1>
  ${alertHtml}

  <form method="POST" action="/warranty-check">
    <button type="submit" class="btn btn-primary" ${missingPeplink ? 'disabled' : ''}>
      Run Warranty Check
    </button>
  </form>

  <a href="/panel" class="btn btn-secondary mt-3">Back to Panel</a>
</div>
</body>
</html>
  `);
});

// POST /warranty-check => run the check, display results (CSV)
router.post('/warranty-check', requireLogin, async (req, res) => {
  const db = req.app.get('db');
  const user = db.prepare('SELECT * FROM users WHERE email = ?')
    .get(req.session.userEmail);

  // If missing, just return an error
  if (!user.peplink_client_id || !user.peplink_client_secret) {
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
    Missing Peplink credentials. <a href="/panel">Go to Panel</a>
  </div>
</div>
</body>
</html>
    `);
  }

  try {
    const csv = await runWarrantyCheck(user.peplink_client_id, user.peplink_client_secret);
    // Show CSV in <pre>
    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Warranty Check Results</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body class="p-4">
<div class="container">
  <h1>Warranty Check Results</h1>
  <pre>${csv}</pre>
  <a href="/warranty-check" class="btn btn-secondary">Back</a>
</div>
</body>
</html>
    `);
  } catch (err) {
    console.error(err);
    res.send(`
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

module.exports = router;
