/**
 * JWT AUTHENTICATION MIDDLEWARE
 * 
 * CURRICULUM COVERAGE:
 * #676-700: JWT Token Verification
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (token) => {
    if (!token) {
        return null;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return null;
        }

        return {
            id: user._id.toString(),
            email: user.email,
            username: user.username
        };
    } catch (error) {
        return null;
    }
};

module.exports = { authMiddleware };
