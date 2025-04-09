require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const productRoutes = require('./routes/products');
const authRoutes = require('./routes/auth');
const User = require('./models/User'); // Import User model
const bcrypt = require('bcryptjs'); // For password hashing

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Database Connection and Admin Initialization
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.DATABASE_URL || process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');

        // Initialize admin user
        await initializeAdmin();
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

// Function to create admin user if none exists
const initializeAdmin = async () => {
    try {
        const adminCount = await User.countDocuments({ role: 'admin' });
        if (adminCount === 0) {
            const adminUsername = process.env.ADMIN_USERNAME || 'Adunke';
            const adminPassword = process.env.ADMIN_PASSWORD || 'Adunke101'; // Change in production!

            const adminUser = new User({
                username: adminUsername,
                password: adminPassword,
                role: 'admin',
                isActive: true,
            });

            await adminUser.save();
            console.log(`Admin user '${adminUsername}' created successfully`);
        } else {
            console.log('Admin user already exists, skipping creation');
        }
    } catch (error) {
        console.error('Error initializing admin user:', error);
    }
};

// Initialize database connection
connectDB();

// Routes
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to Clothing Store API',
        version: '1.0.0',
        status: 'running'
    });
});

app.use('/api/products', productRoutes);
console.log("products:");
app.use('/api/auth', (req, res, next) => {
    console.log(`Auth request: ${req.method} ${req.url}`);
    next();
}, authRoutes);
// 404 Handler
app.use((req, res, next) => {
    res.status(404).json({
        message: 'Route not found',
        path: req.originalUrl
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    res.status(500).json({
        message: 'Something went wrong',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Server Startup
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

// Graceful shutdown
const shutdown = () => {
    console.log('Shutting down server...');
    server.close(() => {
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;