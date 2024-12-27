
Peplink Warranty Checker
========================

A Node.js web application that:

*   Provides **OTP-based login** for user authentication.
*   Stores user **Peplink InControl2** credentials (encrypted at rest). 
*   Allows users to run **warranty checks** against Peplink’s API to retrieve upcoming or expired device warranties.
*   Permits **account deletion** and immediate data removal.

Licensed under the **AGPL 3.0**. See the `LICENSE` file for details.

NOTE: Currently Node v22 cannot be used due to incompatibilities compiling with better-sqlite

* * *

Features
--------

*   **User Management**
    *   OTP login flow (no password-based accounts).
    *   Panel for storing/updating Peplink credentials (encrypted).
    *   Red button for “Delete My Account” to remove user data entirely.
*   **Warranty Check**
    *   Calls Peplink’s InControl2 API to list organizations + devices.
    *   Filters warranties within 90 days (or expired).
    *   Displays results in a friendly table, with an option to _download CSV_.
*   **Encryption**
    *   By default uses **symmetric AES** (with `DATA_ENCRYPTION_KEY` + `DATA_ENCRYPTION_IV` in `.env`).
    *   Potential to switch to **asymmetric RSA** if you want a more advanced approach.

* * *

Installation
------------

1.  **Clone** this repository and enter the project directory:
    
    git clone https://github.com/Llama-Networks/peplink-warranty-checker.git  
    cd peplink-warranty-checker
          
    
2.  **Install** dependencies:
    
    npm install
          
    
3.  **Copy** `.env.example` (or the sample `.env`) to `.env`:
    
    cp sample.env .env
          
    
    Then edit `.env` to set `SESSION_SECRET`, `SYSTEM_SMTP_HOST`, etc.
    
4.  **Run**:
    
    npm start
          
    
5.  **Open** `http://localhost:3000` in your browser.
    

* * *

Configuration
-------------

All sensitive credentials are in the `.env` file. Notable fields:

*   `SESSION_SECRET`: A random key used by `express-session` to sign cookies. **Required**
*   `SYSTEM_SMTP_*`: System-level SMTP credentials for sending OTP emails. **Required**
*   `DATA_ENCRYPTION_KEY`, `DATA_ENCRYPTION_IV`: 32-byte key + 16-byte IV for AES encryption at rest. **Required**
*   `PEPLINK_CLIENT_ID`, `PEPLINK_CLIENT_SECRET`: **Optional** Default Peplink credentials if the user doesn’t provide their own. **This will be removed in a future release.**
* * *

Account Deletion
----------------

*   The user can click **Delete My Account** in the panel.
*   The database row + all data are removed, and the session is destroyed.
*   The user is redirected to `/login` with a message confirming data deletion.

* * *

Limitations
-----------

*   Users cannot delete their account without logging in
*   No password recovery, all logins are done via OTP.
*   Sending results via SMTP is currently not enabled, users are required to download the results in a CSV
*   Credentials are encrypted using symmetrical AES encryption
*   No data pulled from the API is stored on disk. All transactions are completed in memory on the server but may be cached in your browser.

License
-------

This project is licensed under the **AGPL-3.0**. You can find the full license text in the `LICENSE` file. By using or contributing to this codebase, you agree to the terms of the AGPL-3.0 license.
