# TODO for Two-Factor Authentication Implementation

## Completed Tasks
- [x] Install speakeasy and qrcode packages
- [x] Update user model to include twoFactorSecret and twoFactorEnabled fields
- [x] Add 2FA setup, verification, and login functions to authController
- [x] Update authRoutes to include new 2FA endpoints

## Remaining Tasks
- [ ] Create authentication middleware for protecting 2FA setup and verify routes
- [ ] Test the 2FA functionality
- [ ] Update frontend to handle 2FA login flow (if applicable)
- [ ] Add disable 2FA endpoint (optional)

## Notes
- The setup-2fa and verify-2fa routes are temporarily unprotected. Add middleware when available.
- Use /login-2fa for login with 2FA support.
- Original /login remains for backward compatibility.
