const express = require("express");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const passportGoogle = require("../config/passportGoogle.js");
const setupFacebookPassport = require("../config/passportFacebook.js");
const {
    register,
    login,
    verifyLoginOtp,
    resendLoginOtp,
    verifyEmail,
    googleCallback,
    profile,
    requestChangeEmailController,
    verifyChangeEmailController,
    requestChangePhoneController,
    verifyChangePhoneController,
    requestOldEmailOtpController,
    verifyOldEmailOtpController,
    requestNewEmailVerifyLinkController,
    confirmNewEmailController,
} = require("../controllers/auth.controller.js");
const {
    forgotPassword,
    resetPassword,
} = require("../controllers/password.controller.js");
const {
    loginLimiter,
    registerLimiter,
    passwordResetLimiter,
    otpLimiter,
} = require("../middlewares/rateLimit.middleware.js");
const { getCookieDomain, getFrontendUrl, isProduction } = require('../config/runtime.js');

setupFacebookPassport();

const router = express.Router();

//google login flow
router.get(
    "/google",
    passportGoogle.authenticate("google", {
        scope: ["profile", "email"],
        session: false,
        state: true,
    }),
);

//after login google
router.get(
    '/google/callback',
    passportGoogle.authenticate('google', {
        failureRedirect: '/login?error=google',
        session: false,
    }),
    (req, res) => {
        const token = jwt.sign(
            {
                id: req.user._id,
                email: req.user.email,
                role: req.user.role,
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" },
        );

        // Support both production and local development
        const target = new URL(getFrontendUrl());
        target.searchParams.set("token", token);

        const cookieOptions = {
            httpOnly: true,
            secure: isProduction(),
            sameSite: isProduction() ? "none" : "lax",
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        };
        const cookieDomain = getCookieDomain();
        if (cookieDomain) {
            cookieOptions.domain = cookieDomain;
        }

        res.cookie("token", token, cookieOptions);
        
        res.redirect(target.toString());
    },
);

router.get(
    "/facebook",
    passport.authenticate("facebook", { scope: ["email"] }),
);

router.get(
    "/facebook/callback",
    passport.authenticate("facebook", {
        failureRedirect: `/login?error=facebook`,
        session: false,
    }),
    (req, res) => {
        const token = jwt.sign(
            {
                id: req.user._id,
                email: req.user.email,
                role: req.user.role,
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" },
        );

        // Support both production and local development
        const target = new URL(getFrontendUrl());
        target.searchParams.set("token", token);

        const cookieOptions = {
            httpOnly: true,
            secure: isProduction(),
            sameSite: isProduction() ? "none" : "lax",
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        };
        const cookieDomain = getCookieDomain();
        if (cookieDomain) {
            cookieOptions.domain = cookieDomain;
        }

        res.cookie("token", token, cookieOptions);
        
        res.redirect(target.toString());
    },
);

router.get("/verify-email", verifyEmail);

router.post('/register', registerLimiter, register); //đăng ký
router.post('/login', loginLimiter, login); //đăng nhập

router.post('/forgot-password', passwordResetLimiter, forgotPassword); //quên mật khẩu
router.post('/reset-password', passwordResetLimiter, resetPassword); //đặt lại mật khẩu

router.post("/login/verify-otp", otpLimiter, verifyLoginOtp);
router.post("/login/resend-otp", otpLimiter, resendLoginOtp);
router.get("/profile/:id", profile); //lấy thông tin người dùng hiện tại
router.post("/change-email/request-old-otp", otpLimiter, requestOldEmailOtpController);
router.post("/change-email/verify-old-otp", otpLimiter, verifyOldEmailOtpController);
router.post(
    "/change-email/request-new-email",
    requestNewEmailVerifyLinkController,
);
router.get("/change-email/confirm", confirmNewEmailController);
router.post("/change-phone/:id/request", otpLimiter, requestChangePhoneController);
router.post("/change-phone/:id/verify", otpLimiter, verifyChangePhoneController);

module.exports = router;
