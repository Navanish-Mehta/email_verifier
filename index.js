require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { verifyEmail } = require('./verifier');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// GET / - Health check
app.get('/', (req, res) => {
  res.send('Email Verification API Running');
});

// POST /verify-email - Main verification endpoint
app.post('/verify-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        error: 'Invalid request. Please provide a valid email string in the JSON body.',
        example: { email: 'user@example.com' }
      });
    }

    const result = await verifyEmail(email);
    res.json(result);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      error: 'Internal server error while verifying email.'
    });
  }
});

// Start server only if executed directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
