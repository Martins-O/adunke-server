const router = require('express').Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {auth} = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const adminOnly = (req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.user?.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};

router.post('/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;

        // Input validation
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Create new user
        const user = new User({
            username,
            password, // Will be hashed by pre-save hook
            role: role || 'admin', // Default to admin if not specified
        });

        const savedUser = await user.save();

        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: savedUser._id,
                username: savedUser.username,
                role: savedUser.role,
            },
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            message: 'Error creating user',
            error: error.message,
        });
    }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: { message: 'Too many login attempts, please try again later' }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username }).select('+password');

        if (!user || !user.isActive || !(await user.comparePassword(password))) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        console.log(`Generated token for ${username}: ${token}`); // Debug log

        res.json({
            token,
            user: { id: user._id, username: user.username, role: user.role },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Error during login', error: error.message });
    }
});

// Verify token (protected route)
router.get('/verify', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || !user.isActive) {
            return res.status(401).json({ message: 'User not found or inactive' });
        }

        res.json({
            message: 'Token is valid',
            user: {
                id: user._id,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ message: 'Server error during verification' });
    }
});

router.post('/logout', auth, async (req, res) => {
    // In a real app, you might want to blacklist the token
    res.json({ message: 'Logged out successfully' });
});

router.get('/me', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    res.json({
        id: user._id,
        username: user.username,
        role: user.role,
        lastLogin: user.lastLogin
    });
});
module.exports = router;