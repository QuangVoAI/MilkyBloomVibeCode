const userRepository = require('../repositories/user.repository.js');
const { generateToken, sha256 } = require('../utils/token.js');
const { sendMail } = require('../libs/mailer.js');
const bcrypt = require('bcrypt');
const Joi = require('joi');
const { message } = require('statuses');
const { getFrontendUrl } = require('../config/runtime.js');

const ttlMinutes = Number(process.env.RESET_TTL_MINUTES) || 15; //thời gian hết hạn của link reset

const requestReset = async (identifier, finders) => {
    const { byEmail, byPhone, byUsername } = finders;

    let user = null;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
        user = await byEmail(identifier.toLowerCase());
    } else if (/^[0-9]{10,15}$/.test(identifier)) {
        user = await byPhone(identifier);
    } else {
        user = await byUsername(identifier);
    }

    if (!user) {
        return { ok: true }; //không tiết lộ người dùng không tồn tại');
    }

    const token = generateToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000); //tính thời gian hết hạn

    await userRepository.setResetToken(user._id, { tokenHash, expiresAt }); // lưu token đã băm và thời gian hết hạn vào cơ sở dữ liệu

    const linkBase = process.env.CLIENT_URL || getFrontendUrl();
    const link = `${linkBase}/reset-password?uid=${user._id}&token=${token}`; //tạo link đặt lại mật khẩu

    await sendMail({
        //nội dung mail
        to: user.email,
        subject: 'Password Reset Request',
        text: `You requested a password reset. Click the link below to reset your password:\n\n${link}\n\nThis link will expire in ${ttlMinutes} minutes.\n\nIf you did not request this, please ignore this email.`,
    });

    return { message: 'Check your mail to reset password.' };
};

const resetPassword = async (userId, token, newPassword) => {
    const user = await userRepository.findByIdWithSecrets(userId);
    if (!user || !user.resetTokenHash || !user.resetTokenExpiresAt) {
        throw new Error('Invalid token');
    }

    if (user.resetTokenExpiresAt < new Date()) {
        throw new Error('Token has expired');
    }

    const match = user.resetTokenHash === sha256(token);
    if (!match) {
        throw new Error('Invalid token');
    }

    // Additional password complexity validation
    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);

    if (!hasUpperCase || !hasLowerCase || !hasNumber) {
        throw new Error('Password must contain uppercase, lowercase, and number');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await userRepository.setPassword(userId, hash); //cập nhật mật khẩu mới đã băm
    await userRepository.clearResetToken(userId); //xóa token sau khi đặt lại mật khẩu

    return { ok: true };
};

const forgotPasswordSchema = Joi.object({
    emailOrPhoneOrUsername: Joi.string().required(),
});

const resetPasswordSchema = Joi.object({
    userId: Joi.string().required(),
    token: Joi.string().required(),
    newPassword: Joi.string().min(12).max(32).required(),
});

module.exports = {
    requestReset,
    resetPassword,
    forgotPasswordSchema,
    resetPasswordSchema,
};
