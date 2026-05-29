const net = require('net');

/**
 * Checks a mailbox's existence using SMTP RCPT TO command.
 * @param {string} email - The email to verify
 * @param {string} mxRecord - The MX record to connect to
 * @param {number} timeoutMs - Timeout for SMTP operations
 * @returns {Promise<object>} Object containing result and subresult
 */
async function verifyMailbox(email, mxRecord, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let step = 0;
    let resolved = false;

    const mailFrom = process.env.MAIL_FROM || 'verify@example.com';
    let timeoutId = null;

    const endAndResolve = (result, subresult, code = null) => {
      if (!resolved) {
        resolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        
        try {
          if (!socket.destroyed) {
            // Attempt graceful quit, then immediately destroy to prevent hanging
            socket.write('QUIT\r\n');
            socket.destroy();
          }
        } catch (e) {
          // Ignore cleanup errors to ensure we never crash
        }
        
        resolve({ result, subresult, code });
      }
    };

    timeoutId = setTimeout(() => {
      endAndResolve('unknown', 'timeout');
    }, timeoutMs);

    socket.setTimeout(timeoutMs);
    
    socket.on('timeout', () => {
      endAndResolve('unknown', 'timeout');
    });

    socket.on('error', (err) => {
      endAndResolve('unknown', 'connection_error');
    });

    socket.on('close', () => {
      if (!resolved) {
         endAndResolve('unknown', 'connection_closed_unexpectedly');
      }
    });

    socket.on('data', (data) => {
      try {
        const response = data.toString();
        const code = parseInt(response.substring(0, 3), 10);

        if (isNaN(code)) {
          return endAndResolve('unknown', 'invalid_smtp_response');
        }

        // 421 Service not available
        if (code === 421) {
          return endAndResolve('unknown', 'greylisted', code);
        }

        if (step === 0) {
          if (code === 220) {
            step = 1;
            socket.write(`HELO example.com\r\n`);
          } else {
            endAndResolve('unknown', 'unexpected_response', code);
          }
        } else if (step === 1) {
          if (code === 250) {
            step = 2;
            socket.write(`MAIL FROM:<${mailFrom}>\r\n`);
          } else {
            endAndResolve('unknown', 'unexpected_response', code);
          }
        } else if (step === 2) {
          if (code === 250) {
            step = 3;
            socket.write(`RCPT TO:<${email}>\r\n`);
          } else {
            endAndResolve('unknown', 'unexpected_response', code);
          }
        } else if (step === 3) {
          if (code === 250 || code === 251) {
            endAndResolve('valid', 'mailbox_exists', code);
          } else if (code === 550 || code === 551 || code === 552 || code === 553) {
            endAndResolve('invalid', 'mailbox_does_not_exist', code);
          } else if (code >= 400 && code < 500) {
            endAndResolve('unknown', 'greylisted_or_temp_error', code);
          } else {
            endAndResolve('unknown', 'unexpected_response', code);
          }
        }
      } catch (err) {
        endAndResolve('unknown', 'processing_error');
      }
    });

    try {
      socket.connect(25, mxRecord);
    } catch (err) {
      endAndResolve('unknown', 'connection_error');
    }
  });
}

module.exports = {
  verifyMailbox
};
