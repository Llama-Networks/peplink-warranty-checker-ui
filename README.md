# Peplink Warranty Checker

A Node.js web application that:

- Provides **OTP-based login** for user authentication.
- Stores user **SMTP and Peplink InControl2** credentials (encrypted at rest).
- Allows users to run **warranty checks** against Peplink’s API to retrieve upcoming or expired device warranties.
- Permits **account deletion** and immediate data removal.

Licensed under the **AGPL 3.0**. See the `LICENSE` file for details.

## Features

- **User Management**  
  - OTP login flow (no password-based accounts).
  - Panel for storing/updating **SMTP** + **Peplink** credentials (encrypted).
  - Capability for **Deleting Accounts** to remove user data entirely.

- **Warranty Check**  
  - Calls Peplink’s InControl2 API to list organizations + devices.
  - Filters warranties within 90 days, inclusive (or expired).
  - Displays results in a friendly table, with an option to **download as a CSV**.

- **Encryption**  
  - By default uses **symmetric AES** (with `DATA_ENCRYPTION_KEY` + `DATA_ENCRYPTION_IV` from `.env`).
  - Potential to switch to **asymmetric** RSA if you want a more advanced approach.

## Installation

1. **Clone** this repository and enter the project directory:
   ```bash
   git clone https://github.com/Llama-Networks/peplink-warranty-checker.git
   cd peplink-warranty-checker
