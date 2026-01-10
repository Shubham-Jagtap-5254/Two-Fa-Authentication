const User = require('../models/user');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

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

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: { id: user._id, name: user.name, email: user.email },
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

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.status(200).json({
      message: 'Login successful',
      token,
      user: { id: user._id, name: user.name, email: user.email },
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
        return res.status(206).json({ message: '2FA token required', requires2FA: true });
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

module.exports = { signup, login, setup2FA, verify2FA, loginWith2FA };
