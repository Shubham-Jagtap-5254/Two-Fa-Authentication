const User = require('../models/user');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const https = require('https');

// Helper function to send email via Brevo
const sendBrevoEmail = (toEmail, subject, htmlContent) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      sender: { email: process.env.BREVO_SENDER_EMAIL, name: 'Collage Project' },
      to: [{ email: toEmail }],
      subject: subject,
      htmlContent: htmlContent
    });

    const options = {
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
        'content-length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(responseBody || '{}'));
        } else {
          console.error('Brevo API Error:', responseBody);
          reject(new Error(`Brevo API returned status ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('Network Error:', error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
};

const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    const user = new User({ name, email, password });
    await user.save();

    // Generate OTP for email verification
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailOtp = otp;
    user.emailOtpExpires = Date.now() + 10 * 60 * 1000;

    await sendBrevoEmail(
      user.email,
      'Email Verification - Complete Your Signup',
      `<html><body><h1>Verify Your Email</h1><p>Your OTP: <strong style="font-size: 24px;">${otp}</strong></p><p>This code expires in 10 minutes.</p></body></html>`
    );

    await user.save();

    res.status(201).json({
      message: 'User registered successfully. OTP sent to your email for verification.',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate OTP for email verification
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailOtp = otp;
    user.emailOtpExpires = Date.now() + 10 * 60 * 1000;

    await sendBrevoEmail(
      user.email,
      'Login Verification - Enter OTP',
      `<html><body><h1>Login Verification</h1><p>Your OTP: <strong style="font-size: 24px;">${otp}</strong></p><p>This code expires in 10 minutes.</p></body></html>`
    );

    await user.save();

    res.status(200).json({
      message: 'Login initiated. OTP sent to your email. Please verify.',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const setup2FA = async (req, res) => {
  try {
    const userId = req.user.id; // Assuming user is authenticated via middleware
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.twoFactorEnabled) {
      return res.status(400).json({ message: '2FA is already enabled' });
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `Collage Project (${user.email})`,
      issuer: 'Collage Project'
    });

    user.twoFactorSecret = secret.base32;
    await user.save();

    // Generate QR code
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    res.status(200).json({
      message: '2FA setup initiated',
      secret: secret.base32,
      qrCodeUrl
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const verify2FA = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;
    const user = await User.findById(userId);

    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ message: '2FA not set up' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: token,
      window: 2 // Allow some time drift
    });

    if (!verified) {
      return res.status(400).json({ message: 'Invalid 2FA token' });
    }

    user.twoFactorEnabled = true;
    await user.save();

    res.status(200).json({ message: '2FA enabled successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const loginWith2FA = async (req, res) => {
  try {
    const { email, password, token } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (user.twoFactorEnabled) {
      if (!token) {
        // Return 206 with user info so frontend can get QR code
        return res.status(206).json({ 
          message: '2FA token required', 
          requires2FA: true,
          userId: user._id.toString()
        });
      }

      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: token,
        window: 2
      });

      if (!verified) {
        return res.status(400).json({ message: 'Invalid 2FA token' });
      }
    }

    const jwtToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.status(200).json({
      message: 'Login successful',
      token: jwtToken,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// New endpoint to get QR code even when 2FA is already enabled
const get2FAQRCode = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If 2FA is not set up, generate new secret and QR code
    if (!user.twoFactorSecret) {
      const secret = speakeasy.generateSecret({
        name: `Collage Project (${user.email})`,
        issuer: 'Collage Project'
      });

      user.twoFactorSecret = secret.base32;
      await user.save();

      const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

      return res.status(200).json({
        message: '2FA setup initiated',
        secret: secret.base32,
        qrCodeUrl
      });
    }

    // If 2FA is already set up, regenerate QR code from existing secret
    const secret = {
      base32: user.twoFactorSecret,
      otpauth_url: `otpauth://totp/Collage%20Project%20(${encodeURIComponent(user.email)})?secret=${user.twoFactorSecret}&issuer=Collage%20Project`
    };

    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    res.status(200).json({
      message: '2FA QR code retrieved',
      secret: user.twoFactorSecret,
      qrCodeUrl
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// New endpoint to get QR code even when 2FA is already enabled (using userId directly)
const get2FAQRCodeByUserId = async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If 2FA is not set up, generate new secret and QR code
    if (!user.twoFactorSecret) {
      const secret = speakeasy.generateSecret({
        name: `Collage Project (${user.email})`,
        issuer: 'Collage Project'
      });

      user.twoFactorSecret = secret.base32;
      await user.save();

      const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

      return res.status(200).json({
        message: '2FA setup initiated',
        secret: secret.base32,
        qrCodeUrl
      });
    }

    // If 2FA is already set up, regenerate QR code from existing secret
    const secret = {
      base32: user.twoFactorSecret,
      otpauth_url: `otpauth://totp/Collage%20Project%20(${encodeURIComponent(user.email)})?secret=${user.twoFactorSecret}&issuer=Collage%20Project`
    };

    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    res.status(200).json({
      message: '2FA QR code retrieved',
      secret: user.twoFactorSecret,
      qrCodeUrl
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const sendEmailOtp = async (req, res) => {
  try {
    // Safely handle undefined req.body
    const email = req.body?.email;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save OTP and expiration (10 minutes) to user
    // Note: Ensure 'emailOtp' and 'emailOtpExpires' fields exist in your User model schema
    user.emailOtp = otp;
    user.emailOtpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    // Send email via Brevo
    await sendBrevoEmail(
      user.email,
      'Your Login OTP',
      `<html><body><h1>Your OTP Code</h1><p>Your verification code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p></body></html>`
    );

    res.status(200).json({ message: 'OTP sent successfully to email' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error sending OTP' });
  }
};

const verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.emailOtp || !user.emailOtpExpires || Date.now() > user.emailOtpExpires) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    if (user.emailOtp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Clear OTP after successful verification
    user.emailOtp = undefined;
    user.emailOtpExpires = undefined;
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({ message: 'OTP verified', token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error verifying OTP' });
  }
};

module.exports = { signup, login, setup2FA, verify2FA, loginWith2FA, get2FAQRCode, get2FAQRCodeByUserId, sendEmailOtp, verifyEmailOtp };
