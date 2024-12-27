/******************************************************************************
 * peplinkCheck.js
 *
 * Contains a function that uses Peplink InControl2 API to list organizations,
 * devices, check warranties within 90 days, etc. Returns a CSV or similar.
 ******************************************************************************/

const fetch = require('node-fetch'); // If on Node <18
// For Node 18+ built-in fetch, just remove this import.

/**
 * runWarrantyCheck(clientId, clientSecret):
 *   - Calls OAuth2 with clientId/Secret (if needed), or uses a direct token approach
 *   - Lists orgs
 *   - Lists devices
 *   - Builds CSV for warranties expiring in 90 days
 */
async function runWarrantyCheck(clientId, clientSecret) {
  // example: call https://api.ic.peplink.com/api/oauth2/token if needed
  // We'll do something simpler here: assume clientId,clientSecret => get token => call /rest/o, etc.

  // Pseudo-code: get token
  const tokenBody = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials'
  });
  const tokenRes = await fetch('https://api.ic.peplink.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody
  });

  if (!tokenRes.ok) {
    const errTxt = await tokenRes.text();
    throw new Error(`Failed to get token: ${tokenRes.status} - ${errTxt}`);
  }

  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    throw new Error('No access_token in token response');
  }

  // Now call /rest/o to get orgs
  const orgRes = await fetch('https://api.ic.peplink.com/rest/o', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!orgRes.ok) {
    const orgErr = await orgRes.text();
    throw new Error(`Failed to fetch orgs: ${orgRes.status} - ${orgErr}`);
  }
  const orgData = await orgRes.json();
  const orgs = orgData.data || [];

  if (!Array.isArray(orgs) || orgs.length === 0) {
    return 'org_name,serial_number,warranty_expiry_date,days_until_expiry,is_expired\n(No organizations found)';
  }

  let csvLines = ['org_name,serial_number,warranty_expiry_date,days_until_expiry,is_expired'];
  const now = new Date();
  const cutoff = new Date(now.getTime() + 90*24*60*60*1000);

  // For each org, fetch devices
  for (const org of orgs) {
    const orgId = org.id;
    const devUrl = `https://api.ic.peplink.com/rest/o/${orgId}/d?includeWarranty=true`;
    const devRes = await fetch(devUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!devRes.ok) {
      console.error(`Failed devices for org ${orgId}`);
      continue;
    }
    const devData = await devRes.json();
    const devices = devData.data || [];

    for (const device of devices) {
      if (!device.sn || !device.expiry_date) {
        continue;
      }
      // remove hyphens
      const serial = device.sn.replace(/[^a-zA-Z0-9]/g, '');
      const expiryDateStr = device.expiry_date.substring(0,10); // just YYYY-MM-DD
      const expiryDate = new Date(expiryDateStr);

      if (expiryDate <= cutoff) {
        const daysLeft = Math.ceil((expiryDate - now)/(1000*60*60*24));
        const isExpired = device.expired ? 'YES' : 'NO';

        csvLines.push(
          `"${org.name}","${serial}","${expiryDateStr}","${daysLeft}","${isExpired}"`
        );
      }
    }
  }

  if (csvLines.length === 1) {
    return csvLines.join('\n') + '\n(No devices expiring within 90 days)';
  }

  return csvLines.join('\n');
}

module.exports = { runWarrantyCheck };
