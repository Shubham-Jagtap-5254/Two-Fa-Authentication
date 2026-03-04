const express = require('express');
const { signup, login, setup2FA, verify2FA, loginWith2FA, get2FAQRCode } = require('../controllers/authController');
const protect = require('../middlewares/authMiddleware');

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', signup);

// POST /api/auth/login (original, without 2FA)
router.post('/login', login);

// POST /api/auth/login-2fa (new login with 2FA support)
router.post('/login-2fa', loginWith2FA);

// POST /api/auth/setup-2fa (requires authentication)
router.post('/setup-2fa', protect, setup2FA);

// POST /api/auth/verify-2fa (requires authentication)
router.post('/verify-2fa', protect, verify2FA);

// POST /api/auth/get-2fa-qr (new endpoint - requires authentication, always returns QR code)
router.post('/get-2fa-qr', protect, get2FAQRCode);

module.exports = router;
