/******************************************************************************
 * routes/loginRoutes.js
 *
 * Handles:
 *   GET /login
 *   POST /login
 *   POST /login/otp
 * For user OTP-based login
 ******************************************************************************/
const express = require('express');
const nodemailer = require('nodemailer');
const uuid = require('uuid');

const router = express.Router();

// find or create user
function findOrCreateUserByEmail(db, email) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row) {
    db.prepare(`
      INSERT INTO users (email, otp)
      VALUES (?, ?)
    `).run(email, '');
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }
  return row;
}

// Always using system-based (from .env) or fallback to user if that’s your preference
// For simplicity, we assume you want .env for OTP. If not, you can do the fallback logic.
function getOtpSmtpConfig() {
  const port = parseInt(process.env.SYSTEM_SMTP_PORT || '465', 10);
  return {
    host: process.env.SYSTEM_SMTP_HOST,
    port,
    secure: (port === 465), // or true if you want forced
    auth: {
      user: process.env.SYSTEM_SMTP_USER,
      pass: process.env.SYSTEM_SMTP_PASS
    }
  };
}

async function sendOtpEmail(user, otpCode) {
  const transporter = nodemailer.createTransport(getOtpSmtpConfig());
  const fromAddress = process.env.SYSTEM_SMTP_FROM || 'Peplink OTP <noreply@example.com>';

  const mailOptions = {
    from: fromAddress,
    to: user.email,
    subject: 'Your One-Time Password',
    text: `Your one-time password is: ${otpCode}`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`OTP email sent to ${user.email}`);
  } catch (err) {
    console.error('Error sending OTP email:', err);
  }
}

function getHeaderHTML(req) {
  // If logged in => "Logout", else "Login"
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
}

// GET /login => show form
router.get('/login', (req, res) => {
  const header = getHeaderHTML(req);
  const footer = getFooterHTML();
  let deletedCallout = '';
  if (req.query.deleted === '1') {
    deletedCallout = `
<div class="alert mt-3" style="
  background-color: rgba(255,0,0,0.2);
  border: 1px solid #fca8a8;
  color: #b10000;">
  <strong>Notice:</strong> Your account and all of your data have been permanently removed from our system.
</div>
    `;
  }
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Llama Networks Peplink Warranty Checker - Login</title>
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
  ${deletedCallout}
    <h1>Login</h1>
    <p>In order to login, please input your email address. You will be sent a one-time code which you can enter to complete your login.</p>
    <br>
    <form method="POST" action="/login" class="card card-body">
      <div class="mb-3">
        <label for="email" class="form-label">Email address</label>
        <input type="email" name="email" class="form-control" required>
      </div>
      <button type="submit" class="btn btn-lm">Send OTP</button>
    </form>
  </div>
  ${footer}
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
  `);
});

// POST /login => generate OTP, email user
router.post('/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.send('Missing email');

  const db = req.app.get('db');
  let user = findOrCreateUserByEmail(db, email);

  // Generate OTP
  const otpCode = uuid.v4().split('-')[0].toUpperCase();

  // Store
  db.prepare('UPDATE users SET otp = ? WHERE email = ?').run(otpCode, email);

  // Send
  await sendOtpEmail(user, otpCode);

  // Show form
  const header = getHeaderHTML(req);
  const footer = getFooterHTML();
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Llama Networks Peplink Warranty Checker</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <style>
    .btn-lm {
      background-color: #2589BD;
      color: #ffffff;
      border: none;
    }
    .btn-lm:hover {
      opacity: 0.9;
      background-color: #40a3d7;
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
    <h1>Please check your email for the OTP</h1>
    <form method="POST" action="/login/otp" class="card card-body">
      <input type="hidden" name="email" value="${email}" />
      <div class="mb-3">
        <label for="otp" class="form-label">OTP Code</label>
        <input type="text" name="otp" class="form-control" required>
      </div>
      <button type="submit" class="btn btn-lm">Verify</button>
    </form>
  </div>
  ${footer}
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
  `);
});

// POST /login/otp => verify
router.post('/login/otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.send('Missing email or OTP');

  const db = req.app.get('db');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.send('User not found');

  if (user.otp !== otp) {
    return res.send('Invalid OTP');
  }

  // success => store in session
  req.session.userEmail = email;
  // clear OTP
  db.prepare("UPDATE users SET otp = '' WHERE email = ?").run(email);

  // redirect to warranty check (the default page)
  res.redirect('/warranty-check');
});

// LOGOUT route
router.get('/logout', (req, res) => {
    // Destroy session
    req.session.destroy(() => {
      res.redirect('/login'); // or / if you prefer
    });
  });

module.exports = router;
