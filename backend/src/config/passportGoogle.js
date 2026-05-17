const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/user.model');
const { getDefaultAvatar } = require('../utils/defaultAvatar');
const { getBackendUrl } = require('./runtime.js');

const getGoogleCallbackUrl = () =>
    process.env.GOOGLE_CALLBACK_URL ||
    `${getBackendUrl()}/api/auth/google/callback`;

const sanitize = (value = '') =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/_{2,}/g, '_');

const generateUniqueUsername = async (profile) => {
    const email = profile.emails?.[0]?.value || '';
    const fromEmail = email.split('@')[0];
    const fromName =
        profile.displayName ||
        `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();

    let base =
        sanitize(fromEmail) || sanitize(fromName) || `google${profile.id}`;
    let candidate = base;
    let attempt = 0;

    while (await User.exists({ username: candidate })) {
        attempt++;
        candidate = `${base}${attempt}`;
    }
    return candidate;
};

// GOOGLE STRATEGY
passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: getGoogleCallbackUrl(),
        },

        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails?.[0]?.value;

                if (!email) {
                    return done(
                        new Error('Google account does not expose an email.'),
                        null,
                    );
                }

                const DEFAULT_AVATAR = getDefaultAvatar(email);

                //KIỂM TRA EMAIL TRƯỚC
                let user = await User.findOne({ email });

                if (user) {
                    // Nếu user chưa có socialId → cập nhật thêm
                    if (!user.socialId) {
                        user.socialId = profile.id;
                        user.socialProvider = 'google';
                    }

                    // Cập nhật avatar nếu chưa có
                    if (!user.avatar) {
                        user.avatar =
                            profile.photos?.[0]?.value?.replace(
                                '=s96-c',
                                '=s400-c',
                            ) || DEFAULT_AVATAR;
                    }

                    user.isVerified = true;
                    await user.save();

                    return done(null, user);
                }
                   

                //CHƯA TỒN TẠI → TẠO MỚI
                const username = await generateUniqueUsername(profile);

                const fullName =
                    profile.displayName ||
                    `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim() ||
                    username;

                const avatar =
                    profile.photos?.[0]?.value?.replace('=s96-c', '=s400-c') ||
                    DEFAULT_AVATAR;

                user = await User.create({
                    socialProvider: 'google',
                    socialId: profile.id,
                    email,
                    fullName,
                    username,
                    avatar,
                    isVerified: true,
                });

                return done(null, user);
            } catch (err) {
                console.error('GOOGLE LOGIN ERROR:', err);
                return done(err, null);
            }
        },
    ),
);

// SERIALIZE
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// DESERIALIZE
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

module.exports = passport;
