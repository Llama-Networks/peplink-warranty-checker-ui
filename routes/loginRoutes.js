/******************************************************************************
 * routes/loginRoutes.js
 *
 * 1. GET /login -> user enters email for OTP
 * 2. POST /login -> generate OTP, email user
 * 3. POST /login/otp -> verify OTP
 * 4. GET /logout -> logout
 * 5. POST /login/resend -> resend code if cooldown passed
 *
 * On incorrect OTP:
 *   - Show a Bootstrap modal with "Incorrect OTP" message.
 *   - Provide "Resend" button that triggers a 60s cooldown logic.
 ******************************************************************************/
const express = require('express');
const nodemailer = require('nodemailer');
const uuid = require('uuid');

const router = express.Router();

// find or create user
function findOrCreateUserByEmail(db, email) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row) {
    db.prepare(`INSERT INTO users (email, otp) VALUES (?, ?)`).run(email, '');
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }
  return row;
}

// We'll use system-level SMTP from .env
function getOtpSmtpConfig() {
  const port = parseInt(process.env.SYSTEM_SMTP_PORT || '465', 10);
  return {
    host: process.env.SYSTEM_SMTP_HOST,
    port,
    secure: (port === 465),
    auth: {
      user: process.env.SYSTEM_SMTP_USER,
      pass: process.env.SYSTEM_SMTP_PASS
    }
  };
}

// email options and send mail 
async function sendOtpEmail(user, otpCode) {
  const transporter = nodemailer.createTransport(getOtpSmtpConfig());
  const fromAddress = process.env.SYSTEM_SMTP_FROM || 'Llama Networks <llamatasks@llamamail.io>';

  const mailOptions = {
    from: fromAddress,
    to: user.email,
    subject: 'Llama Networks | Your One-Time Password',
    text: `Your one-time password for the Llama Networks Peplink Warranty Checker is: ${otpCode}`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`OTP email sent to ${user.email}`);
  } catch (err) {
    console.error('Error sending OTP email:', err);
  }
}

// For the header
function getHeaderHTML(req) {
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
        <li class="nav-item"><a class="nav-link" href="/panel">Settings</a></li>
      </ul>
      ${loginLogoutBtn}
    </div>
  </div>
</nav>`;
}

// For the footer
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
</footer>`;
}

// GET /login => user enters email
router.get('/login', (req, res) => {
  const header = getHeaderHTML(req);
  const footer = getFooterHTML();
  let deletedCallout = '';
  if (req.query.deleted === '1') {
    deletedCallout = `
<div class="alert mt-3" style="background-color: rgba(255,0,0,0.2);
     border: 1px solid #fca8a8; color: #b10000;">
  <strong>Notice:</strong> Your account and all of your data have been permanently removed from our system.
</div>`;
  }

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
    <p>Please input your email address. You will be sent a one-time code to complete your login.</p>
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
</html>`);
});

// POST /login => generate OTP, store, email to user
router.post('/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.send('Missing email');

  const db = req.app.get('db');
  const user = findOrCreateUserByEmail(db, email);

  // Generate OTP
  const otpCode = uuid.v4().split('-')[0].toUpperCase();

  // Store in DB
  db.prepare('UPDATE users SET otp = ? WHERE email = ?').run(otpCode, email);

  // Send the OTP
  await sendOtpEmail(user, otpCode);

  // Show the "enter OTP" page
  return renderOtpPage(res, req, { email, showInvalidModal: false });
});

/**
 * Utility: Render the "enter OTP" page. 
 * If showInvalidModal = true => display a Bootstrap modal indicating invalid OTP.
 */
function renderOtpPage(res, req, options) {
  const { email, showInvalidModal } = options;
  const header = getHeaderHTML(req);
  const footer = getFooterHTML();

  // Next resend allowed time from session
  const nextAllowed = req.session.nextResendAllowedTime || 0;
  const now = Date.now();
  const canResendNow = (now >= nextAllowed);

  // We'll embed a small script that handles the "Resend" AJAX call + 60s countdown
  // The modal is hidden unless showInvalidModal = true => we'll auto-trigger it with JS
  const showModalScript = showInvalidModal ? 
    `var invalidModal = new bootstrap.Modal(document.getElementById('invalidOtpModal'));
     invalidModal.show();`
    : '';

  return res.send(`
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
    <h1>Enter your one-time password</h1>
    <p>Check your email for a one-time password. Enter that here to complete your login.</p>
    <form method="POST" action="/login/otp" class="card card-body">
      <input type="hidden" name="email" value="${email}" />
      <div class="mb-3">
        <label for="otp" class="form-label">OTP Code</label>
        <input type="text" name="otp" class="form-control" required>
      </div>
      <button type="submit" class="btn btn-lm">Verify</button>
    </form>
  </div>

  <!-- Bootstrap Modal for invalid OTP -->
  <div class="modal fade" id="invalidOtpModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Incorrect OTP</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <p>The OTP you entered is incorrect. Please check your code and try again.</p>
          <p>If you'd like to resend a new OTP, click "Resend OTP".</p>
          <p style="color: red;" id="errorMsg"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          <button class="btn btn-lm" id="resendBtn" ${canResendNow ? '' : 'disabled'}>Resend OTP</button>
        </div>
      </div>
    </div>
  </div>

  ${footer}

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    ${showModalScript}

    var resendBtn = document.getElementById('resendBtn');
    var errorMsg = document.getElementById('errorMsg');

    // If the button is disabled, let's do a countdown
    var canResendNow = ${canResendNow ? 'true' : 'false'};
    var nextAllowedTime = ${nextAllowed};

    if (!canResendNow) {
      // Calculate how many seconds left
      var remaining = Math.floor( (nextAllowedTime - Date.now()) / 1000 );
      startCountdown(remaining);
    }

    resendBtn.addEventListener('click', function() {
      // AJAX POST /login/resend
      resendBtn.disabled = true;
      errorMsg.textContent = '';
      fetch('/login/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: "${email}" })
      })
      .then(resp => resp.json())
      .then(data => {
        if (data.success) {
          // success => show message, start countdown
          errorMsg.style.color = 'green';
          errorMsg.textContent = 'OTP resent successfully. Please check your email.';
          var remainSecs = data.cooldown;
          startCountdown(remainSecs);
        } else {
          // error
          errorMsg.style.color = 'red';
          errorMsg.textContent = data.error || 'Error resending code.';
          resendBtn.disabled = false;
        }
      })
      .catch(err => {
        errorMsg.style.color = 'red';
        errorMsg.textContent = 'Request failed: ' + err;
        resendBtn.disabled = false;
      });
    });

    function startCountdown(secs) {
      resendBtn.disabled = true;
      var interval = setInterval(function() {
        secs--;
        if (secs <= 0) {
          clearInterval(interval);
          errorMsg.textContent = '';
          resendBtn.disabled = false;
        } else {
          errorMsg.textContent = 'Please wait ' + secs + 's before requesting another code.';
        }
      }, 1000);
    }
  </script>
</body>
</html>
  `);
}

// POST /login/otp => verify the code
router.post('/login/otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.send('Missing email or OTP');

  const db = req.app.get('db');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.send('User not found');

  if (user.otp !== otp) {
    // Render the same OTP page with a modal
    return renderOtpPage(res, req, { email, showInvalidModal: true });
  }

  // success
  req.session.userEmail = email;
  db.prepare("UPDATE users SET otp = '' WHERE email = ?").run(email);
  res.redirect('/warranty-check');
});

// A new route to handle "Resend" code with cooldown
router.post('/login/resend', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.json({ success: false, error: 'No email provided.' });
  }

  const db = req.app.get('db');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.json({ success: false, error: 'User not found.' });
  }

  // Check session cooldown
  const now = Date.now();
  const nextAllowed = req.session.nextResendAllowedTime || 0;
  if (now < nextAllowed) {
    // Still in cooldown
    const remainSecs = Math.floor( (nextAllowed - now) / 1000 );
    return res.json({ success: false, error: `Please wait ${remainSecs}s before requesting another code.` });
  }

  // Set new cooldown: 60s from now
  req.session.nextResendAllowedTime = now + (60 * 1000);

  // Generate new code
  const otpCode = uuid.v4().split('-')[0].toUpperCase();
  db.prepare('UPDATE users SET otp = ? WHERE email = ?').run(otpCode, email);

  // Send email
  sendOtpEmail(user, otpCode)
    .then(() => {
      res.json({ success: true, cooldown: 60 });
    })
    .catch(err => {
      console.error('Error resending OTP:', err);
      res.json({ success: false, error: 'Failed to resend code.' });
    });
});

// GET /logout => destroy session
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
