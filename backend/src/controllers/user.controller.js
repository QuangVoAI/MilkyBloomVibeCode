const userService = require('../services/user.service.js');
const userRepository = require('../repositories/user.repository.js');
const { uploadToS3 } = require('../utils/s3.helper.js');

// GET USERS (GỘP PARAM)
const getAllUsers = async (req, res, next) => {
    try {
        const result = await userService.getAllUsers(req.query);
        res.json({ 
            success: true, 
            data: result.users,
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
            stats: result.stats, // Aggregated stats for all users
        });
    } catch (error) {
        next(error);
    }
};

// GET USER BY ID (ADMIN ONLY)
const getUserById = async (req, res, next) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "Missing user id",
            });
        }

        const user = await userRepository.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        res.json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
};

// CREATE USER (ADMIN ONLY)
const createUser = async (req, res, next) => {
    try {
        const user = await userService.createUser(req.body);
        res.status(201).json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
};

// VERIFY USER
const verifyUser = async (req, res, next) => {
    try {
        const { id, token } = req.query;

        if (!id || !token) {
            return res.status(400).json({
                success: false,
                message: 'Missing id or token',
            });
        }

        const user = await userRepository.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        if (user.verificationCode !== token) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code',
            });
        }

        const verifiedUser = await userService.setUserVerified(id, true);

        res.json({
            success: true,
            message: 'User verified successfully',
            data: verifiedUser,
        });
    } catch (error) {
        next(error);
    }
};

// SET USER PASSWORD
const setUserPassword = async (req, res, next) => {
    try {
        const { id } = req.query;
        const { password, confirmPassword, currentPassword } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Missing user id',
            });
        }

        // Security check: users can only change their own password (unless admin)
        if (req.user.id !== id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'You can only change your own password',
            });
        }

        const isSelfChange = req.user.id === id;
        const isAdminReset = req.user.role === 'admin' && !isSelfChange;

        if (!currentPassword && !isAdminReset) {
            return res.status(400).json({
                success: false,
                message: 'Current password is required',
            });
        }

        if (!password || password.length < 12 || password.length > 32) {
            return res.status(400).json({
                success: false,
                message: 'Password must be 12-32 characters long',
            });
        }

        // Password strength validation
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumber = /[0-9]/.test(password);

        if (!hasUpperCase || !hasLowerCase || !hasNumber) {
            return res.status(400).json({
                success: false,
                message: 'Password must contain uppercase, lowercase, and number',
            });
        }

        if (confirmPassword !== undefined && password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Password confirmation does not match',
            });
        }

        const updated = await userService.setUserPassword(id, password, currentPassword);

        res.json({ success: true, data: updated });
    } catch (error) {
        // Make sure error has proper status code
        const statusCode = error.status || error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message || 'Failed to change password',
        });
    }
};

// UPDATE USER
const updateUser = async (req, res, next) => {
    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Missing user id',
            });
        }

        const updated = await userService.updateUser(id, req.body);

        res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
};

// DELETE USER
const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Missing user id',
            });
        }

        const deleted = await userService.deleteUser(id);

        res.json({ success: true, data: deleted });
    } catch (error) {
        next(error);
    }
};

// UPLOAD AVATAR (POST)
const uploadAvatar = async (req, res, next) => {
    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Missing user id',
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded',
            });
        }

        const [url] = await uploadToS3([req.file], 'avatarImages');
        const updated = await userRepository.update(id, { avatar: url });

        res.json({
            success: true,
            message: 'Avatar uploaded successfully',
            data: updated,
        });
    } catch (error) {
        next(error);
    }
};

// UPDATE AVATAR (PATCH)
const updateAvatar = async (req, res, next) => {
    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Missing user id',
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded',
            });
        }

        const [url] = await uploadToS3([req.file], 'avatars');
        const updatedUser = await userRepository.update(id, { avatar: url });

        res.json({
            success: true,
            message: 'Avatar updated successfully',
            data: updatedUser,
        });
    } catch (error) {
        next(error);
    }
};

// CHECK USERNAME AVAILABILITY (PUBLIC)
const checkUsername = async (req, res, next) => {
    try {
        const { username } = req.query;
        
        if (!username) {
            return res.status(400).json({
                success: false,
                message: "Username is required"
            });
        }
        
        const existingUser = await userRepository.findByUsername(username);
        
        res.json({
            success: true,
            available: !existingUser,
            message: existingUser ? "Username is already taken" : "Username is available"
        });
    } catch (error) {
        next(error);
    }
};

// CHECK EMAIL AVAILABILITY (PUBLIC)
const checkEmail = async (req, res, next) => {
    try {
        const { email } = req.query;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }
        
        const existingUser = await userRepository.findByEmail(email);
        
        res.json({
            success: true,
            available: !existingUser,
            message: existingUser ? "Email is already taken" : "Email is available"
        });
    } catch (error) {
        next(error);
    }
};

// GET DISTINCT VALUES (roles, providers) for filter dropdowns
const getDistinctValues = async (req, res, next) => {
    try {
        const result = await userRepository.getDistinctValues();
        res.json({
            success: true,
            roles: result.roles.map(role => ({
                value: role,
                label: role.charAt(0).toUpperCase() + role.slice(1)
            })),
            providers: result.providers.map(provider => ({
                value: provider,
                label: provider === 'local' ? 'Email/Password' : provider.charAt(0).toUpperCase() + provider.slice(1)
            }))
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllUsers,
    getUserById,
    createUser,
    verifyUser,
    setUserPassword,
    updateUser,
    deleteUser,
    uploadAvatar,
    updateAvatar,
    checkUsername,
    checkEmail,
    getDistinctValues,
};
