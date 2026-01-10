const express = require('express');
const { signup, login, setup2FA, verify2FA, loginWith2FA } = require('../controllers/authController');
// Assuming there's an auth middleware, e.g., requireAuth
// const requireAuth = require('../middlewares/authMiddleware');

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', signup);

// POST /api/auth/login (original, without 2FA)
router.post('/login', login);

// POST /api/auth/login-2fa (new login with 2FA support)
router.post('/login-2fa', loginWith2FA);

// POST /api/auth/setup-2fa (requires authentication)
// router.post('/setup-2fa', requireAuth, setup2FA);
router.post('/setup-2fa', setup2FA); // Temporarily without middleware

// POST /api/auth/verify-2fa (requires authentication)
// router.post('/verify-2fa', requireAuth, verify2FA);
router.post('/verify-2fa', verify2FA); // Temporarily without middleware

module.exports = router;
