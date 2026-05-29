# Email Verification Module API

## Project Overview
This project is a production-quality backend API built with Node.js and Express to verify if an email address is real and usable. It performs multiple layers of checks:
1. Syntax validation using regex and the `validator` package.
2. Typos detection for common domains using the Levenshtein Distance algorithm.
3. DNS MX record lookup to ensure the domain can receive emails.
4. Direct SMTP connection and RCPT TO probing to verify if the exact mailbox exists.
5. Provider-aware fallback for major providers that actively block SMTP probing.

## API Endpoints

### `GET /`
**Description:** Health check endpoint to confirm the API is running.
**Response:**
```text
Email Verification API Running
```

### `POST /verify-email`
**Description:** Main endpoint to verify an email address.
**Request Body (JSON):**
```json
{
  "email": "test@gmail.com"
}
```
**Response (JSON):**
```json
{
  "email": "test@gmail.com",
  "result": "unknown",
  "resultcode": 3,
  "subresult": "provider_blocked",
  "domain": "gmail.com",
  "mxRecords": [
    "gmail-smtp-in.l.google.com",
    "alt1.gmail-smtp-in.l.google.com"
  ],
  "executiontime": 121,
  "error": null,
  "didyoumean": null,
  "timestamp": "2026-05-28T11:56:50.866Z"
}
```

## Setup Steps (Local)

### Prerequisites
- Node.js installed on your system.

### Installation
1. Clone or download this project.
2. Open a terminal in the project directory.
3. Run the following command to install dependencies:
   ```bash
   npm install
   ```

### Running the API locally
To start the Express server, run:
```bash
npm start
```
You will see `Server running on port 3000`. You can test it by sending a POST request to `http://localhost:3000/verify-email`.

### Running Tests
To execute the comprehensive Jest unit tests, run:
```bash
npm test
```

## Render Deployment Instructions

This project is configured and fully ready for direct deployment on Render's free tier.

1. **Push your code to GitHub/GitLab.**
2. **Log into Render** (https://render.com) and click **New > Web Service**.
3. **Connect your repository**.
4. **Configure the deployment settings:**
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Click **Create Web Service**. Render will automatically provision a URL for your API, build the dependencies, and start the server. The application listens on `process.env.PORT` which Render automatically supplies.

## How It Works

### SMTP Verification Explanation
SMTP (Simple Mail Transfer Protocol) is the protocol mail servers use to send and receive emails across the internet. This module opens a raw TCP socket connection directly to port 25 of the target mail server. It sends the `HELO`, `MAIL FROM`, and `RCPT TO` commands to simulate sending an email. The server's response to `RCPT TO` tells us if the mailbox actually exists (e.g., `250 OK` means it exists, `550` means mailbox not found). Once we receive this response, we gracefully send `QUIT` and terminate the connection without actually sending an email.

### DNS MX Lookup Explanation
Before connecting to an SMTP server, the module must know *which* server to connect to. It uses Node.js's built-in `dns` module (configured to use reliable Google Public DNS servers 8.8.8.8 and 8.8.4.4) to lookup MX (Mail Exchange) records for the domain extracted from the email address. MX records point to the mail servers responsible for accepting email on behalf of that domain. The module automatically filters invalid records and sorts them by priority.

## Real-world Limitations of Email Verification

### Why Gmail Blocks Probing
Major email providers like Gmail, Outlook, Yahoo, and Hotmail actively block SMTP probing to protect user privacy and prevent spammers from "harvesting" or verifying lists of valid email addresses. When probing these servers, they will typically drop the connection or ban the IP address performing the probe. This module detects these major providers and safely returns an `unknown` result with a `provider_blocked` subresult, rather than falsely marking the email as invalid or attempting to fake a validation result.

### Meaning of the "Unknown" Result
The `unknown` result means the module cannot definitively prove whether the mailbox exists or not. This is a professionally acceptable and realistic outcome in email verification. It occurs when:
- **Provider Blocking:** The provider (like Gmail) blocks SMTP probing.
- **Timeouts & Firewalls:** The connection to port 25 is blocked by a network firewall or ISP.
- **Greylisting:** The server temporarily rejects the connection with a 4xx error (e.g., 450 or 421) to deter spam.
- **Catch-All Servers:** The server accepts all emails for the domain, making it impossible to verify a specific user.

### SMTP Limitations
- **Anti-Spam/Catch-All Policies:** Many corporate servers configure their servers as "catch-all". They will return a `250 OK` for *any* email address at their domain.
- **Port 25 Blocking:** Residential ISPs and cloud providers sometimes block outbound traffic on port 25 to prevent spam, causing inevitable timeouts when running this module locally.
