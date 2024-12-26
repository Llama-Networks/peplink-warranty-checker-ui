/********************************************************************************
 * server.js
 *
 * Run:
 *   1) npm install
 *   2) node server.js
 *   3) Visit http://localhost:3000
 *
 * This script:
 *   1. Presents a Bootstrap form for entering an email address.
 *   2. On form submission, fetches a Bearer token from Peplink (client_credentials).
 *   3. Gathers orgs/devices from /rest/o and /rest/o/<orgId>/d?includeWarranty=true.
 *   4. Builds a CSV of devices expiring in 90 days.
 *   5. Emails the CSV to the user-provided address, then displays the CSV on a results page.
 *******************************************************************************/
require('dotenv').config();

// If on Node < 18, uncomment and ensure node-fetch is installed:
// const fetch = require('node-fetch');

const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
app.use(express.urlencoded({ extended: true }));  // For form parsing
app.use(express.json());                          // For JSON parsing if needed

// Environment variables
const {
  PEPLINK_CLIENT_ID,
  PEPLINK_CLIENT_SECRET,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM
} = process.env;

/** 
 * Helper: fetch OAuth2 token from Peplink
 */
async function getBearerToken() {
  if (!PEPLINK_CLIENT_ID || !PEPLINK_CLIENT_SECRET) {
    throw new Error('Missing PEPLINK_CLIENT_ID or PEPLINK_CLIENT_SECRET in .env');
  }
  const TOKEN_ENDPOINT = 'https://api.ic.peplink.com/api/oauth2/token';

  const body = new URLSearchParams({
    client_id: PEPLINK_CLIENT_ID,
    client_secret: PEPLINK_CLIENT_SECRET,
    grant_type: 'client_credentials'
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Failed to get token: ${response.status} - ${raw}`);
  }

  const json = JSON.parse(raw);
  if (!json.access_token) {
    throw new Error('No access_token in token response');
  }
  return json.access_token;
}

/**
 * Helper: day difference
 */
function diffInDays(date1, date2) {
  const msInDay = 24 * 60 * 60 * 1000;
  return Math.ceil((date1 - date2) / msInDay);
}

/**
 * Generate the CSV content by calling Peplink endpoints
 */
async function generateCsvReport() {
  // 1) Get the token
  const token = await getBearerToken();

  // 2) Fetch orgs
  const orgResponse = await fetch('https://api.ic.peplink.com/rest/o', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const orgRaw = await orgResponse.text();
  if (!orgResponse.ok) {
    throw new Error(`Failed to fetch orgs: ${orgResponse.status} - ${orgRaw}`);
  }
  const orgJson = JSON.parse(orgRaw);
  const orgs = orgJson.data;
  if (!Array.isArray(orgs) || orgs.length === 0) {
    return 'org_name,serial_number,warranty_expiry_date,days_until_expiry,is_expired\n(No organizations found)';
  }

  // CSV header
  const csvLines = ['org_name,serial_number,warranty_expiry_date,days_until_expiry,is_expired'];
  const now = new Date();
  const cutoff = new Date(now.getTime() + 90*24*60*60*1000); // 90 days from now

  // 3) For each org, fetch devices
  for (const org of orgs) {
    const orgId = org.id;
    const orgName = org.name;

    const devUrl = `https://api.ic.peplink.com/rest/o/${orgId}/d?includeWarranty=true`;
    const devRes = await fetch(devUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const devRaw = await devRes.text();
    if (!devRes.ok) {
      console.error(`Error fetching devices for org ${orgId}`, devRaw);
      continue; // skip this org
    }

    const devJson = JSON.parse(devRaw);
    const devices = devJson.data || [];
    if (!Array.isArray(devices) || devices.length === 0) {
      // No devices for this org
      continue;
    }

    for (const device of devices) {
      if (!device.sn || !device.expiry_date) {
        continue;
      }

      // Remove hyphens and non-alphanumeric from sn
      const serial = device.sn.replace(/[^a-zA-Z0-9]/g, '');
      const expiryDate = new Date(device.expiry_date);

      if (expiryDate <= cutoff) {
        const daysLeft = diffInDays(expiryDate, now);
        const isExpired = device.expired ? 'YES' : 'NO';

        csvLines.push(
          `"${orgName}","${serial}","${device.expiry_date}","${daysLeft}","${isExpired}"`
        );
      }
    }
  }

  if (csvLines.length === 1) {
    // Means no devices found within 90 days
    return csvLines.join('\n') + '\n(No devices expire within 90 days)';
  }

  return csvLines.join('\n');
}

/**
 * Send email with CSV attachment
 */
async function sendCsvEmail(csvContent, recipientEmail) {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.error('Missing SMTP credentials in .env');
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: false, // or true if you're using SSL on this port
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  const mailOptions = {
    from: SMTP_FROM || SMTP_USER,
    to: recipientEmail,
    subject: 'Peplink Warranty Expiry Report',
    text: 'Please see attached CSV of devices expiring within 90 days.',
    attachments: [
      {
        filename: 'peplink_expiring_devices.csv',
        content: csvContent
      }
    ]
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return true;
  } catch (err) {
    console.error('Error sending email:', err);
    return false;
  }
}

/** 
 * 1) Home route: Show a simple form
 */
app.get('/', (req, res) => {
  // Simple Bootstrap 5 form
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Peplink Warranty Checker</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body class="bg-light p-5">
  <div class="container">
    <h1 class="mb-4">Peplink Warranty Checker</h1>
    <form action="/generate" method="POST" class="card card-body">
      <div class="mb-3">
        <label for="email" class="form-label">Recipient Email</label>
        <input type="email" id="email" name="email" class="form-control" placeholder="you@example.com" required>
      </div>
      <button type="submit" class="btn btn-primary">Generate & Email Report</button>
    </form>
  </div>
</body>
</html>
  `;
  res.send(html);
});

/**
 * 2) POST /generate: 
 *    - runs the script
 *    - sends the email
 *    - displays the CSV result
 */
app.post('/generate', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).send('Missing email in form data.');
  }

  try {
    // Generate the CSV
    const csvContent = await generateCsvReport();

    // Attempt to send the email
    const emailSent = await sendCsvEmail(csvContent, email);

    // Show results in a simple HTML
    let html = `
<!DOCTYPE html>
<html>
<head>
  <title>Peplink Warranty Checker</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body class="bg-light p-5">
  <div class="container">
    <h1>Peplink Warranty Checker</h1>
    <div class="alert ${emailSent ? 'alert-success' : 'alert-danger'}">
      ${emailSent ? 'Email sent successfully to ' + email : 'Failed to send email'}
    </div>
    <h2>CSV Output:</h2>
    <pre>${csvContent}</pre>
    <hr/>
    <a href="/" class="btn btn-secondary">Go Back</a>
  </div>
</body>
</html>
    `;
    res.send(html);
  } catch (err) {
    console.error('Error generating report:', err);
    res.status(500).send(`Error generating report: ${err.message}`);
  }
});

/**
 * Start the server
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
