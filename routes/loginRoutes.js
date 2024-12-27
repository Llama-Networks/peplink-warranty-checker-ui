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

// build user’s SMTP config or fallback
function getSmtpConfigForUser(user) {
  const host = user.smtp_host || process.env.SYSTEM_SMTP_HOST;
  const port = parseInt(user.smtp_port || process.env.SYSTEM_SMTP_PORT || '587', 10);
  
  let secure;
  if (user.smtp_secure === 'true') {
    secure = true;
  } else if (user.smtp_secure === 'false') {
    secure = false;
  } else {
    secure = (port === 465);
  }

  const authUser = user.smtp_user || process.env.SYSTEM_SMTP_USER;
  const authPass = user.smtp_pass || process.env.SYSTEM_SMTP_PASS;

  return {
    host,
    port,
    secure,
    auth: {
      user: authUser,
      pass: authPass
    }
  };
}

async function sendOtpEmail(user, otpCode) {
  const smtpConfig = getSmtpConfigForUser(user);
  const transporter = nodemailer.createTransport(smtpConfig);
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

// GET /login => show form
router.get('/login', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Login</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body class="p-4">
<div class="container">
  <h1>OTP Login</h1>
  <form method="POST" action="/login" class="card card-body">
    <div class="mb-3">
      <label for="email" class="form-label">Email address</label>
      <input type="email" name="email" class="form-control" required>
    </div>
    <button type="submit" class="btn btn-primary">Send OTP</button>
  </form>
</div>
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
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Enter OTP</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body class="p-4">
<div class="container">
  <h1>Please check your email for the OTP</h1>
  <form method="POST" action="/login/otp" class="card card-body">
    <input type="hidden" name="email" value="${email}" />
    <div class="mb-3">
      <label for="otp" class="form-label">OTP Code</label>
      <input type="text" name="otp" class="form-control" required>
    </div>
    <button type="submit" class="btn btn-primary">Verify</button>
  </form>
</div>
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

  // redirect to warranty check
  res.redirect('/warranty-check');
});

module.exports = router;
