const nodemailer = require('nodemailer');
const { hasEnvValues, isProviderEnabled } = require('../config/runtime.js');

const smtpConfigured = hasEnvValues(
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
);
const smtpEnabled = isProviderEnabled('SMTP_ENABLED', true);

const transporter =
    smtpEnabled && smtpConfigured
        ? nodemailer.createTransport({
              host: process.env.SMTP_HOST,
              port: Number(process.env.SMTP_PORT || 587),
              secure: process.env.SMTP_SECURE === 'true',
              auth: {
                  user: process.env.SMTP_USER,
                  pass: process.env.SMTP_PASS,
              },
          })
        : null;

const sendMail = async (payload) => {
    if (!smtpEnabled) {
        console.warn('[mailer] SMTP is disabled. Skipping outbound email.');
        return { skipped: true, reason: 'smtp_disabled' };
    }

    if (!transporter) {
        console.warn(
            '[mailer] SMTP is not fully configured. Skipping outbound email.',
        );
        return { skipped: true, reason: 'smtp_not_configured' };
    }

    return transporter.sendMail({
        from: process.env.SMTP_FROM,
        ...payload,
    });
};

module.exports = { sendMail };
