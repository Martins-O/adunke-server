const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
    // Extract token from header
    const token = req.header('x-auth-token');

    // Check if token exists
    if (!token) {
        return res.status(401).json({
            message: 'No authentication token provided',
            error: 'Access denied'
        });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach user data to request
        req.user = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role
        };

        // Optional: Check token expiration explicitly (redundant with jwt.verify but useful for custom handling)
        const currentTime = Math.floor(Date.now() / 1000);
        if (decoded.exp && decoded.exp < currentTime) {
            return res.status(401).json({
                message: 'Token has expired',
                error: 'Access denied'
            });
        }

        // Role-based access control for admin routes
        if (req.path.includes('/admin') && req.user.role !== 'admin') {
            return res.status(403).json({
                message: 'Admin privileges required',
                error: 'Forbidden'
            });
        }

        // Token is valid, proceed to next middleware/route
        next();
    } catch (error) {
        // Handle specific JWT errors
        let message = 'Invalid token';
        if (error.name === 'TokenExpiredError') {
            message = 'Token has expired';
        } else if (error.name === 'JsonWebTokenError') {
            message = 'Token is malformed';
        }

        console.error('Authentication error:', error);
        return res.status(401).json({
            message,
            error: 'Authentication failed'
        });
    }
};

// Optional: Add a factory function for role-specific middleware
const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({
                message: `Requires ${role} role`,
                error: 'Forbidden'
            });
        }
        next();
    };
};

module.exports = {
    auth: authMiddleware,
    requireRole
};