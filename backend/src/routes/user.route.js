const express = require('express');
const auth = require('../middlewares/auth.middleware.js');
const adminOnly = require('../middlewares/admin.middleware.js');
const {
    uploadAvatar: uploadAvatarMiddleware,
} = require('../middlewares/upload.middleware.js');
const { strictApiLimiter } = require('../middlewares/rateLimit.middleware.js');

const {
    getAllUsers,
    createUser,
    verifyUser,
    setUserPassword,
    updateUser,
    deleteUser,
    uploadAvatar: uploadAvatarController,
    updateAvatar: updateAvatarController,
    getUserById,
    checkUsername,
    checkEmail,
    getDistinctValues,
} = require("../controllers/user.controller.js");

const router = express.Router();

// ============ PUBLIC ROUTES (No auth required) ============
// Check username availability
router.get("/check-username", checkUsername);

// Check email availability
router.get("/check-email", checkEmail);

// ============ PROTECTED ROUTES (Auth required) ============
router.use(auth);

// GET distinct values for filters (roles, providers) - lightweight endpoint
router.get("/distinct", adminOnly, getDistinctValues);

// GET: tất cả user hoặc search theo param
router.get("/", adminOnly, getAllUsers);

router.get("/:userId", auth, getUserById);

// Admin tạo user
router.post("/", strictApiLimiter, adminOnly, createUser);

// Admin update user
router.put("/", strictApiLimiter, adminOnly, updateUser);

// Admin delete user
router.delete("/", strictApiLimiter, adminOnly, deleteUser);

// ============ USER ROUTES ============

// Verify user
router.patch("/verify", strictApiLimiter, verifyUser);

// Set password
router.patch("/set-password", strictApiLimiter, setUserPassword);

// Upload avatar
router.post(
    "/avatar",
    strictApiLimiter,
    uploadAvatarMiddleware,
    uploadAvatarController,
);

// Update avatar
router.patch(
    "/avatar",
    strictApiLimiter,
    uploadAvatarMiddleware,
    updateAvatarController,
);

module.exports = router;
