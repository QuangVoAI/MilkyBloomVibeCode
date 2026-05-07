const userRepository = require("../repositories/user.repository.js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Joi = require("joi");
const { generateToken, genOtp6, sha256 } = require("../utils/token.js");
const { getDefaultAvatar } = require("../utils/defaultAvatar.js");
const User = require("../models/user.model.js");
const { sendMail } = require("../libs/mailer.js");
const { message } = require("statuses");
const { getBackendUrl, getFrontendUrl } = require('../config/runtime.js');

const FRONTEND_URL = getFrontendUrl();
const VERIFY_TTL_MINUTES = Number(process.env.VERIFY_TTL_MINUTES || 1440);
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30m";
const BACKEND_URL = getBackendUrl();

//Trường hợp đăng nhập sai quá 5 lần thì phải nhập otp
const MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS || 5);
const OTP_TTL_MINUTES = Number(process.env.LOGIN_OTP_TTL_MINUTES || 10);
const CHANGE_EMAIL_OTP_TTL_MINUTES = Number(
    process.env.CHANGE_EMAIL_OTP_TTL_MINUTES || 10,
);
const VERIFY_NEW_EMAIL_TOKEN_TTL_MINUTES = Number(
    process.env.VERIFY_NEW_EMAIL_TOKEN_TTL_MINUTES || 15,
);
const CHANGE_EMAIL_CONFIRM_URL =
    process.env.CHANGE_EMAIL_CONFIRM_URL ||
    `${BACKEND_URL}/api/auth/change-email/confirm`;

const userSchema = Joi.object({
    fullName: Joi.string().min(3).max(100).required(), // Họ và tên
    email: Joi.string().email().required(),
    phone: Joi.string()
        .pattern(/^[0-9]{10,15}$/)
        .required(), // Số điện thoại từ 10-15 chữ số
    username: Joi.string().alphanum().min(3).max(30).required(), // Tên đăng nhập
    password: Joi.string().min(12).max(32).required(),
});

const loginSchema = Joi.object({
    emailOrPhoneOrUsername: Joi.alternatives()
        .try(
            //một field có thể hợp lệ nhiều kiểu
            Joi.string().email(),
            Joi.string().pattern(/^[0-9]{10,15}$/), // Số điện thoại
            Joi.string().alphanum().min(3).max(30), // Tên đăng nhập
        )
        .required(),
    password: Joi.string().min(8).max(32).required(),
})

    .rename('username', 'emailOrPhoneOrUsername', {
        ignoreUndefined: true,
        override: true,
    })
    .rename('email', 'emailOrPhoneOrUsername', {
        ignoreUndefined: true,
        override: true,
    })
    .rename('phone', 'emailOrPhoneOrUsername', {
        ignoreUndefined: true,
        override: true,
    });

// const generateRandomToken = (length = 6) => {
//     return Math.random().toString().slice(2,8);
// };

const toPublicUser = (userDoc) => {
    //chuyển đổi đối tượng người dùng sang định dạng công khai
    if (!userDoc) return null;

    const obj = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
    const { password, __v, ...publicUser } = obj;
    return publicUser;
};

const sendVerificationEmail = async (user) => {
    const token = generateToken();
    const tokenHash = sha256("verify:" + token);
    const expiresAt = new Date(Date.now() + VERIFY_TTL_MINUTES * 60 * 1000);

    await userRepository.setResetToken(user._id, { tokenHash, expiresAt });

    const verifyLink = `${BACKEND_URL}/api/auth/verify-email?uid=${user._id}&token=${token}`;

    try {
        await sendMail({
            to: user.email,
            subject: "Verify your email address",
            html: `
        <p>Xin chào ${user.fullName || user.username},</p>
        <p>Vui lòng xác thực email bằng cách nhấn vào liên kết sau (hạn ${VERIFY_TTL_MINUTES} phút):</p>
        <p><a href="${verifyLink}">${verifyLink}</a></p>
      `,
        });
    } catch (err) {
        console.error("[MAIL ERROR][VERIFY EMAIL]", err?.message || err);
    }
};

const detectIdentifierType = (s) => {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'email';
    if (/^[0-9]{10,15}$/.test(s)) return 'phone';
    return 'username';
};

const findUserByIdentifier = async (identifier, withPassword = false) => {
    const type = detectIdentifierType(identifier);
    switch (type) {
        case 'email':
            return userRepository.findByEmail(
                identifier.trim().toLowerCase(),
                withPassword,
            );
        case 'phone':
            return userRepository.findByPhone(identifier.trim(), withPassword);
        default:
            return userRepository.findByUsername(
                identifier.trim(),
                withPassword,
            );
    }
};

//Đăng ký tài khoản mới/ mỗi lần đăng nhập, hệ thống sẽ gửi token để xác thực trước khi truy cập các tài nguyên
const register = async (data) => {
    const { value, error } = userSchema.validate(data, { abortEarly: false }); //validate dữ liệu
    if (error) {
        const message = error.details
            .map((detail) => detail.message)
            .join(', '); //gộp tất cả các lỗi
        throw new Error(message);
    }

    const fullName = value.fullName.trim();
    const email = value.email.trim().toLowerCase();
    const phone = value.phone.trim();
    const username = value.username.trim();
    const plainPassword = value.password;

    // Additional password complexity validation
    const hasUpperCase = /[A-Z]/.test(plainPassword);
    const hasLowerCase = /[a-z]/.test(plainPassword);
    const hasNumber = /[0-9]/.test(plainPassword);

    if (!hasUpperCase || !hasLowerCase || !hasNumber) {
        throw new Error('Password must contain uppercase, lowercase, and number');
    }

    const [byEmail, byPhone, byUsername] = await Promise.all([
        //truy vấn cùng lúc
        userRepository.findByEmail(email),
        userRepository.findByPhone(phone),
        userRepository.findByUsername(username),
    ]);

    const passwordHash = await bcrypt.hash(plainPassword, 10); //băm mật khẩu

    if (byEmail) {
        throw new Error('Email already in use');
    }
    if (byPhone) {
        throw new Error('Phone number already in use');
    }
    if (byUsername) {
        throw new Error('Username already in use');
    }

    const user = await userRepository.create({
        //tạo người dùng mới
        fullName,
        email,
        phone,
        username,
        password: passwordHash,
        avatar: getDefaultAvatar(email), // Assign deterministic default avatar
        isVerified: false,
    });

    const token = generateToken();
    const tokenHash = sha256('verify:' + token);
    const expiresAt = new Date(Date.now() + VERIFY_TTL_MINUTES * 60 * 1000);

    await userRepository.setResetToken(user._id, { tokenHash, expiresAt });
    //Đường dẫn backend
    const verifyBase = getBackendUrl();
    const verifyLink = `${verifyBase}/api/auth/verify-email?uid=${user._id}&token=${token}`;
    try {
        await sendMail({
            to: email,
            subject: 'Verify your email address',
            html: `
      <p>Xin chào ${fullName},</p>
      <p>Vui lòng xác thực email bằng cách nhấn vào liên kết sau (hạn ${VERIFY_TTL_MINUTES} phút):</p>
      <p><a href="${verifyLink}">${verifyLink}</a></p>
    `,
        });
    } catch (err) {
        console.error("[MAIL ERROR][VERIFY EMAIL]", err?.message || err);
    }

    return {
        message:
            "Registration successful! Please check your email to verify your account.",
        user: toPublicUser(user),
    };
};

const createLoginOtp = async (userId) => {
    const otp = genOtp6();
    const otpHash = sha256(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    await userRepository.setLoginOtp(userId, { otpHash, expiresAt });
    return { otp, expiresAt };
};

const login = async (payload) => {
    const { value, error } = loginSchema.validate(payload, {
        abortEarly: false,
    });
    if (error) {
        const message = error.details.map((d) => d.message).join(", ");
        throw Object.assign(new Error(message), { status: 400 });
    }

    const { emailOrPhoneOrUsername, password } = value;

    // 1) Tìm user theo identifier (id)
    const found = await findUserByIdentifier(emailOrPhoneOrUsername);
    if (!found)
        throw Object.assign(new Error("Incorrect Login"), { status: 401 });

    // 2) Refetch với secrets để có password + resetOtp*
    const user = await userRepository.findByIdWithSecrets(found._id);
    if (!user)
        throw Object.assign(new Error("Incorrect Login"), { status: 401 });

    // 3) Nếu đang bị yêu cầu OTP thì buộc nhập OTP trước
    if (
        user.resetOtpHash &&
        user.resetOtpExpiresAt &&
        user.resetOtpExpiresAt > new Date()
    ) {
        return {
            needOtp: true,
            message: "The account requires OTP authentication.",
        };
    }

    // 4) Phải có hash password
    if (!user.password || typeof user.password !== "string") {
        throw Object.assign(
            new Error(
                "Account has no password. Please set a password to login.",
            ),
            { status: 400 },
        );
    }

    // 5) So sánh mật khẩu
    const valid = await bcrypt.compare(password, user.password);

    // 6) Sai mật khẩu → tăng đếm + có thể bật OTP
    if (!valid) {
        const updated = await userRepository.incFailLogin(user._id); // new:true để có giá trị mới nhất
        if ((updated.failLoginAttempts || 0) >= MAX_FAILS) {
            const otp = genOtp6();
            const otpHash = sha256(otp);
            const expiresAt = new Date(
                Date.now() + OTP_TTL_MINUTES * 60 * 1000,
            );

            await userRepository.setLoginOtp(updated._id, {
                otpHash,
                expiresAt,
            });

            // Gửi mail nhưng không để lỗi mailer phá flow
            try {
                await sendMail({
                    to: updated.email,
                    subject: "OTP Verification Code",
                    html: `
            <p>Xin chào ${updated.fullName || updated.username},</p>
            <p>Bạn đã nhập sai mật khẩu quá ${MAX_FAILS} lần. Mã OTP của bạn:</p>
            <h2 style="letter-spacing:3px;">${otp}</h2>
            <p>Mã có hiệu lực trong ${OTP_TTL_MINUTES} phút.</p>
          `,
                });
            } catch (e) {
                console.error("[MAIL ERROR][LOGIN OTP]", e?.message || e);
            }

            return {
                needOtp: true,
                message: `Incorrect ${MAX_FAILS} times. Please enter the OTP.`,
            };
        }

        throw Object.assign(new Error("Login is incorrect"), { status: 401 });
    }

    // 7) Đúng mật khẩu → reset đếm sai
    await userRepository.resetFailLogin(user._id);

    // 8) Nếu chưa verify
    if (!user.isVerified) {
        await sendVerificationEmail(user);
        throw Object.assign(
            new Error(
                "Account is not verified. Please verify via the email we just sent.",
            ),
            { status: 403 },
        );
    }

    if (!JWT_SECRET) {
        throw Object.assign(new Error("JWT secret is not configured"), {
            status: 500,
        });
    }

    const token = jwt.sign(
        {
            id: user._id,
            email: user.email,
            role: user.role,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN },
    );

    return { user: toPublicUser(user), token };
};

const verifyLoginOtp = async ({ emailOrPhoneOrUsername, otp }) => {
    if (!otp || String(otp).length !== 6) {
        throw Object.assign(new Error("Invalid OTP"), { status: 400 });
    }

    const found = await findUserByIdentifier(emailOrPhoneOrUsername);
    if (!found) throw Object.assign(new Error("Invalid User"), { status: 404 });

    const user = await userRepository.findByIdWithSecrets(found._id);
    if (!user?.resetOtpExpiresAt || user.resetOtpExpiresAt < new Date()) {
        throw Object.assign(new Error("OTP expired"), { status: 400 });
    }

    if (!user.resetOtpHash) {
        throw Object.assign(new Error("OTP does not exist"), { status: 400 });
    }

    if (sha256(otp) !== user.resetOtpHash) {
        throw Object.assign(new Error("OTP incorrect"), { status: 400 });
    }

    await userRepository.clearLoginOtp(user._id);
    return {
        ok: true,
        message: "OTP Verification Success. Please login again.",
    };
};

const profile = async (userId) => {
    //lấy thông tin hồ sơ người dùng
    const user = await userRepository.findById(userId);
    if (!user) {
        throw new Error("User not found");
    }
    return toPublicUser(user); //trả về user công khai
};

// === Change email multi-step flow ===
const requestChangeEmailOldOtp = async (userId) => {
    const user = await userRepository.findByIdWithSecrets(userId);
    if (!user)
        throw Object.assign(new Error("User not found"), { status: 404 });

    const otp = genOtp6();
    const otpHash = sha256(otp);
    const expiresAt = new Date(
        Date.now() + CHANGE_EMAIL_OTP_TTL_MINUTES * 60 * 1000,
    );

    await userRepository.setOldEmailOtp(userId, otpHash, expiresAt);

    try {
        await sendMail({
            to: user.email,
            subject: 'Xác nhận đổi email - MilkyBloom',
            html: `
                <p>Xin chào ${user.fullName},</p>
                <p>Mã OTP để xác thực đổi email:</p>
                <h2>${otp}</h2>
                <p>OTP có hiệu lực trong ${CHANGE_EMAIL_OTP_TTL_MINUTES} phút.</p>
            `,
        });
    } catch (err) {
        console.error('[MAIL ERROR] Change Email Old OTP', err?.message || err);
    }

    return { message: 'OTP sent to old email', expiresAt };
};

const verifyChangeEmailOldOtp = async (userId, otp) => {
    const user = await userRepository.findByIdWithSecrets(userId);
    if (!user)
        throw Object.assign(new Error("User not found"), { status: 404 });

    if (!user?.changeEmailOldOtpHash || !user?.changeEmailOldOtpExpiresAt) {
        throw Object.assign(new Error('OTP not requested'), { status: 400 });
    }

    if (user.changeEmailOldOtpExpiresAt < new Date()) {
        throw Object.assign(new Error('OTP expired'), { status: 400 });
    }

    const normalizedOtp = String(otp ?? "").trim();
    if (
        !normalizedOtp ||
        sha256(normalizedOtp) !== user.changeEmailOldOtpHash
    ) {
        throw Object.assign(new Error("OTP incorrect"), { status: 400 });
    }

    return { message: 'Old email verified. User may now enter new email.' };
};

const requestNewEmailVerifyLink = async (userId, newEmail) => {
    const user = await userRepository.findByIdWithSecrets(userId);
    if (!user)
        throw Object.assign(new Error("User not found"), { status: 404 });

    const normalized = String(newEmail ?? "")
        .trim()
        .toLowerCase();
    if (!normalized) {
        throw Object.assign(new Error("New email is required"), {
            status: 400,
        });
    }

    if (normalized === user.email) {
        throw Object.assign(new Error("New email must be different"), {
            status: 400,
        });
    }

    const existing = await userRepository.findByEmail(normalized);
    if (existing) {
        throw Object.assign(new Error('Email already in use'), { status: 400 });
    }

    const token = generateToken();
    const tokenHash = sha256("change-email:" + token);
    const expiresAt = new Date(
        Date.now() + VERIFY_NEW_EMAIL_TOKEN_TTL_MINUTES * 60 * 1000,
    );

    await userRepository.setPendingNewEmail(
        userId,
        normalized,
        tokenHash,
        expiresAt,
    );

    const verifyLink = `${CHANGE_EMAIL_CONFIRM_URL}?uid=${userId}&token=${token}`;

    try {
        await sendMail({
            to: normalized,
            subject: 'Xác minh email mới - MilkyBloom',
            html: `
                <p>Xin chào ${user.fullName},</p>
                <p>Nhấn vào link bên dưới để xác minh email mới:</p>
                <p><a href="${verifyLink}">Xác minh email mới</a></p>
                <p>Liên kết hết hạn sau ${VERIFY_NEW_EMAIL_TOKEN_TTL_MINUTES} phút.</p>
            `,
        });
    } catch (err) {
        console.error(
            "[MAIL ERROR] Change Email Verify Link",
            err?.message || err,
        );
    }

    return { message: 'Verification link sent to new email' };
};

const confirmNewEmail = async (userId, token) => {
    const user = await userRepository.findByIdWithSecrets(userId);
    if (!user)
        throw Object.assign(new Error("User not found"), { status: 404 });

    if (!user?.pendingNewEmail) {
        throw Object.assign(new Error("No pending email change"), {
            status: 400,
        });
    }

    if (!user?.verifyNewEmailTokenHash || !user?.verifyNewEmailExpiresAt) {
        throw Object.assign(new Error("Verification token not requested"), {
            status: 400,
        });
    }

    if (user.verifyNewEmailExpiresAt < new Date()) {
        throw Object.assign(new Error('Token expired'), { status: 400 });
    }

    const normalizedToken = String(token ?? "").trim();
    if (
        !normalizedToken ||
        sha256("change-email:" + normalizedToken) !==
            user.verifyNewEmailTokenHash
    ) {
        throw Object.assign(new Error("Invalid token"), { status: 400 });
    }

    await userRepository.applyNewEmail(userId, user.pendingNewEmail);

    return { message: 'Email changed successfully' };
};

//request đổi sđt
const requestChangePhone = async (userId, newPhone) => {
    const user = await userRepository.findByIdWithSecrets(userId);
    if (!user)
        throw Object.assign(new Error("User not found"), { status: 404 });

    const exists = await userRepository.findByPhone(newPhone);
    if (exists)
        throw Object.assign(new Error("Phone already in use"), { status: 400 });

    const otp = genOtp6();
    const otpHash = sha256(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await userRepository.setChangePhoneOtp(userId, {
        otpHash,
        expiresAt,
        pendingPhone: newPhone,
    });

    try {
        await sendMail({
            to: user.email,
            subject: 'Phone Change Verification',
            html: `
                <p>Xin chào ${user.fullName},</p>
                <p>Mã OTP để đổi số điện thoại:</p>
                <h2>${otp}</h2>
                <p>Hạn sử dụng: ${OTP_TTL_MINUTES} phút.</p>
            `,
        });
    } catch (err) {
        console.error('[MAIL ERROR] Change Phone OTP', err);
    }

    return { message: 'OTP sent to your email', expiresAt };
};

//verify đổi số điện thoại

const verifyChangePhone = async (userId, otp) => {
    const user = await userRepository.findByIdWithSecrets(userId);

    if (!user?.pendingPhone)
        throw Object.assign(new Error("No pending phone"), { status: 400 });

    if (!user?.changePhoneOtpHash || !user?.changePhoneOtpExpiresAt)
        throw Object.assign(new Error('OTP not requested'), { status: 400 });

    if (user.changePhoneOtpExpiresAt < new Date())
        throw Object.assign(new Error('OTP expired'), { status: 400 });

    const normalizedOtp = String(otp ?? "").trim();
    if (!normalizedOtp || sha256(normalizedOtp) !== user.changePhoneOtpHash)
        throw Object.assign(new Error('OTP incorrect'), { status: 400 });

    await userRepository.applyNewPhone(userId, user.pendingPhone);

    return { message: 'Phone updated successfully' };
};

module.exports = {
    register,
    login,
    createLoginOtp,
    verifyLoginOtp,
    profile,
    requestChangeEmailOldOtp,
    verifyChangeEmailOldOtp,
    requestNewEmailVerifyLink,
    confirmNewEmail,
    requestChangePhone,
    verifyChangePhone,
};
