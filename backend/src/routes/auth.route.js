const express = require("express");
const crypto = require("crypto");
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

const router = express.Router();
const OAUTH_RESULT_TTL_MS = 5 * 60 * 1000;
const oauthResultCache = new Map();

setupFacebookPassport();

const hashAuthCode = (provider, code) =>
    crypto
        .createHash("sha256")
        .update(`${provider}:${code}`)
        .digest("hex");

const pruneExpiredOAuthResults = () => {
    const now = Date.now();
    for (const [key, value] of oauthResultCache.entries()) {
        if (value.expiresAt <= now) {
            oauthResultCache.delete(key);
        }
    }
};

const buildFrontendRedirectUrl = (path = "/", params = {}) => {
    const target = new URL(path, getFrontendUrl());
    Object.entries(params).forEach(([key, value]) => {
        if (value != null && value !== "") {
            target.searchParams.set(key, value);
        }
    });
    return target.toString();
};

const getAuthCookieOptions = () => {
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
    return cookieOptions;
};

const issueUserToken = (user) =>
    jwt.sign(
        {
            id: user._id,
            email: user.email,
            role: user.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" },
    );

const cacheOAuthSuccess = (provider, code, token) => {
    if (!code) return;
    pruneExpiredOAuthResults();
    oauthResultCache.set(hashAuthCode(provider, code), {
        token,
        redirectUrl: buildFrontendRedirectUrl("/", { token }),
        expiresAt: Date.now() + OAUTH_RESULT_TTL_MS,
    });
};

const replayCachedOAuthSuccess = (provider, code, res) => {
    if (!code) return false;
    pruneExpiredOAuthResults();

    const cached = oauthResultCache.get(hashAuthCode(provider, code));
    if (!cached) return false;

    res.cookie("token", cached.token, getAuthCookieOptions());
    res.redirect(cached.redirectUrl);
    return true;
};

const redirectOAuthFailure = (provider, reason, res) => {
    res.redirect(buildFrontendRedirectUrl("/login", { oauthError: `${provider}_${reason}` }));
};

const handleOAuthCallback = (provider, strategy) => (req, res, next) => {
    const authCode =
        typeof req.query.code === "string" ? req.query.code : undefined;

    if (replayCachedOAuthSuccess(provider, authCode, res)) {
        return;
    }

    passport.authenticate(
        strategy,
        { session: false },
        (err, user) => {
            if (err) {
                const message = String(err.message || "");
                const isCodeReuse =
                    /authorization code has been used/i.test(message);

                if (isCodeReuse && replayCachedOAuthSuccess(provider, authCode, res)) {
                    return;
                }

                console.error(`${provider} callback error:`, err);
                redirectOAuthFailure(
                    provider,
                    isCodeReuse ? "code_used" : "callback_failed",
                    res,
                );
                return;
            }

            if (!user) {
                redirectOAuthFailure(provider, "denied", res);
                return;
            }

            const token = issueUserToken(user);
            const redirectUrl = buildFrontendRedirectUrl("/", { token });

            res.cookie("token", token, getAuthCookieOptions());
            cacheOAuthSuccess(provider, authCode, token);
            res.redirect(redirectUrl);
        },
    )(req, res, next);
};

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
    handleOAuthCallback("google", "google"),
);

router.get(
    "/facebook",
    passport.authenticate("facebook", {
        scope: ["email"],
        state: true,
    }),
);

router.get(
    "/facebook/callback",
    handleOAuthCallback("facebook", "facebook"),
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
