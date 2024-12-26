/*****************************************************************************
 * server.js
 *
 * Usage:
 *   1) npm install
 *   2) node server.js
 *   3) Go to http://localhost:3000
 *
 * This script:
 *   - Presents a Bootstrap 5 page for entering an email address.
 *   - On form submission, calls the Peplink script (client_credentials).
 *   - Builds a CSV, truncating expiry_date to "YYYY-MM-DD" only (no time).
 *   - Emails the CSV.
 *   - On success, the client parses the CSV and renders it into an HTML table.
 *****************************************************************************/

require('dotenv').config();

// If on Node <18, uncomment and install node-fetch:
// const fetch = require('node-fetch');

const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const {
  PEPLINK_CLIENT_ID,
  PEPLINK_CLIENT_SECRET,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM
} = process.env;

/** Helper: day difference */
function diffInDays(date1, date2) {
  const msInDay = 24 * 60 * 60 * 1000;
  return Math.ceil((date1 - date2) / msInDay);
}

/** Get OAuth2 bearer token from Peplink */
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

/** Build CSV lines, ignoring the time portion of expiry_date */
async function generateCsvReport() {
  // 1) Token
  const token = await getBearerToken();

  // 2) Orgs
  const orgRes = await fetch('https://api.ic.peplink.com/rest/o', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const orgRaw = await orgRes.text();
  if (!orgRes.ok) {
    throw new Error(`Failed to fetch orgs: ${orgRes.status} - ${orgRaw}`);
  }
  const orgJson = JSON.parse(orgRaw);
  const orgs = orgJson.data;

  // If no orgs found
  if (!Array.isArray(orgs) || orgs.length === 0) {
    return 'org_name,serial_number,warranty_expiry_date,days_until_expiry,is_expired\n(No organizations found)';
  }

  // CSV header
  const csvLines = ['org_name,serial_number,warranty_expiry_date,days_until_expiry,is_expired'];
  const now = new Date();
  const cutoff = new Date(now.getTime() + 90*24*60*60*1000);

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
      console.error(`Failed devices for org ${orgId}: ${devRes.status} - ${devRaw}`);
      continue;
    }

    const devJson = JSON.parse(devRaw);
    const devices = devJson.data || [];
    if (!Array.isArray(devices) || devices.length === 0) {
      continue;
    }

    for (const device of devices) {
      if (!device.sn || !device.expiry_date) {
        continue;
      }

      // Remove non-alphanumeric
      const serial = device.sn.replace(/[^a-zA-Z0-9]/g, '');

      // Only keep YYYY-MM-DD
      const expiryDateStr = device.expiry_date.substring(0, 10); // "2025-03-25"

      // Check if date <= cutoff
      const expiryDate = new Date(expiryDateStr); // parse to compare
      if (expiryDate <= cutoff) {
        const daysLeft = diffInDays(expiryDate, now);
        const isExpired = device.expired ? 'YES' : 'NO';

        csvLines.push(
          `"${orgName}","${serial}","${expiryDateStr}","${daysLeft}","${isExpired}"`
        );
      }
    }
  }

  if (csvLines.length === 1) {
    return csvLines.join('\n') + '\n(No devices expiring within 90 days)';
  }
  return csvLines.join('\n');
}

/** Send CSV via nodemailer */
async function sendCsvEmail(csvContent, recipient) {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.error('Missing SMTP credentials in .env');
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: true, // true since we are using SSL
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  const mailOptions = {
    from: SMTP_FROM || SMTP_USER,
    to: recipient,
    subject: 'Peplink Warranty Expiry Report',
    text: 'Report attached.',
    attachments: [
      {
        filename: 'peplink_expiring_warranties.csv',
        content: csvContent
      }
    ]
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return true;
  } catch (err) {
    console.error('Error sending email:', err);
    return false;
  }
}

// -------------- UI: Show a form with Bootstrap, plus an empty table for results --------------
app.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Peplink Warranty Checker</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <style>
    .spinner-border {
      width: 1rem;
      height: 1rem;
      margin-left: 0.5rem;
    }
    #statusArea {
      margin-top: 1rem;
    }
    #resultTable {
      margin-top: 1rem;
      display: none;
    }
  </style>
</head>
<body class="bg-light p-4">
  <div class="container">
    <h1>Peplink Warranty Checker</h1>
    <div class="card card-body my-3">
      <div class="mb-3">
        <label for="emailInput" class="form-label">Enter Email Address</label>
        <input type="email" class="form-control" id="emailInput" placeholder="you@example.com" required>
      </div>
      <button class="btn btn-primary" id="generateBtn">Generate & Email Report</button>
    </div>

    <div id="statusArea"></div>

    <!-- Table headers can be edited here if you want different wording -->
    <table class="table table-striped" id="resultTable">
      <thead>
        <tr>
          <th>Organization</th>
          <th>Serial Number</th>
          <th>Warranty Expiry (YYYY-MM-DD)</th>
          <th>Days to Expiry</th>
          <th>Expired?</th>
        </tr>
      </thead>
      <tbody id="resultTbody"></tbody>
    </table>
  </div>

<script>
(function(){
  const generateBtn = document.getElementById('generateBtn');
  const emailInput = document.getElementById('emailInput');
  const statusArea = document.getElementById('statusArea');
  const resultTable = document.getElementById('resultTable');
  const resultTbody = document.getElementById('resultTbody');

  function showStatus(msg, isError=false) {
    statusArea.innerHTML = \`<div class="alert \${isError ? 'alert-danger' : 'alert-info'}">\${msg}</div>\`;
  }

  function parseCsvAndRenderTable(csvContent) {
    // Clear existing rows
    resultTbody.innerHTML = "";

    // Split lines
    let lines = csvContent.trim().split("\\n");
    if (!lines.length) {
      return;
    }

    // The first line is header. We can skip it or parse it. We'll skip it because we have custom headers in HTML
    // lines[0] = "org_name,serial_number,warranty_expiry_date,days_until_expiry,is_expired"

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // skip empty lines
      // Very simple CSV parse (assuming no commas in quotes)
      const cols = line.split(',');

      // We expect 5 columns
      if (cols.length < 5) {
        continue;
      }

      // Remove leading/trailing quotes if needed
      const orgName = cols[0].replace(/^"|"$/g, '');
      const serial = cols[1].replace(/^"|"$/g, '');
      const expiry = cols[2].replace(/^"|"$/g, '');
      const days = cols[3].replace(/^"|"$/g, '');
      const expired = cols[4].replace(/^"|"$/g, '');

      // Insert row
      const row = document.createElement('tr');
      row.innerHTML = \`
        <td>\${orgName}</td>
        <td>\${serial}</td>
        <td>\${expiry}</td>
        <td>\${days}</td>
        <td>\${expired}</td>
      \`;
      resultTbody.appendChild(row);
    }

    // Show table
    resultTable.style.display = "table";
  }

  generateBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) {
      alert("Please enter an email address");
      return;
    }

    showStatus("Running Peplink script... <span class='spinner-border' role='status'></span>");
    resultTable.style.display = "none";
    resultTbody.innerHTML = "";

    try {
      const response = await fetch('/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await response.json();

      if (!response.ok) {
        showStatus("Error: " + (data.error || "Unknown"), true);
        return;
      }

      // data.csv => the CSV
      // data.emailSent => boolean
      showStatus("Script completed. " + (data.emailSent ? "Email sent!" : "Email failed (check logs)."));

      // Render CSV into table
      parseCsvAndRenderTable(data.csv);
    } catch (err) {
      console.error(err);
      showStatus("Request failed: " + err.message, true);
    }
  });
})();
</script>

</body>
</html>
  `;
  res.send(html);
});

/** POST /generate => runs the script, emails the CSV, returns JSON */
app.post('/generate', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  try {
    // 1) Generate CSV
    const csvContent = await generateCsvReport();

    // 2) Send email
    let emailSent = false;
    try {
      emailSent = await sendCsvEmail(csvContent, email);
    } catch (mailErr) {
      console.error('Email sending error:', mailErr);
    }

    // 3) Return JSON (we'll parse CSV on the client)
    return res.json({
      csv: csvContent,
      emailSent
    });
  } catch (err) {
    console.error('Error generating CSV:', err);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server listening on http://localhost:' + PORT);
});
