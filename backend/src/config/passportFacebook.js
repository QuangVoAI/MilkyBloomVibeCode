const passportFacebook = require("passport");
const FacebookStrategy = require("passport-facebook").Strategy;
const User = require("../models/user.model");

module.exports = function setupFacebookPassport() {
    passportFacebook.use(
        new FacebookStrategy(
            {
                clientID: process.env.FACEBOOK_APP_ID,
                clientSecret: process.env.FACEBOOK_APP_SECRET,
                callbackURL: process.env.FACEBOOK_CALLBACK_URL,
                profileFields: [
                    'id',
                    'displayName',
                    'emails',
                    'picture.type(large){url,is_silhouette}',
                ],
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    const socialId = profile.id;
                    const emailFromProfile =
                        profile.emails?.[0]?.value?.toLowerCase() || null;
                    // Facebook may not return an email for some accounts.
                    // Our User schema requires email, so generate a stable fallback.
                    const email =
                        emailFromProfile || `facebook_${socialId}@facebook.local`;
                    const fullName = profile.displayName || 'Facebook User';

                    // Trích xuất ảnh và kiểm tra có phải ảnh mặc định không
                    const pictureData = profile.photos?.[0];
                    const isSilhouette = pictureData?.is_silhouette ?? true;
                    const facebookAvatar = pictureData?.value || null;

                    // Nếu là ảnh mặc định của Facebook → dùng ảnh mặc định của bạn
                    const avatar =
                        !isSilhouette && facebookAvatar
                            ? facebookAvatar
                            : process.env.DEFAULT_AVATAR_URL ||
                              'https://toy-store-project-of-springwang.s3.ap-southeast-2.amazonaws.com/defaults/unknownAvatar.png';

                    // Kiểm tra user
                    let user = await User.findOne({
                        socialId,
                        socialProvider: 'facebook',
                    });

                    if (!user && email) {
                        user = await User.findOne({ email });
                        if (user) {
                            user.socialProvider = 'facebook';
                            user.socialId = socialId;
                            if (!user.avatar) user.avatar = avatar;
                            await user.save();
                        }
                    }

                    if (!user) {
                        const baseUsername = fullName
                            .replace(/\s+/g, '')
                            .toLowerCase();
                        let candidate = baseUsername;
                        let attempt = 0;
                        while (await User.exists({ username: candidate })) {
                            attempt += 1;
                            candidate = `${baseUsername}${attempt}`;
                        }

                        user = await User.create({
                            fullName,
                            username: candidate,
                            email,
                            socialProvider: 'facebook',
                            socialId,
                            avatar,
                            isVerified: true,
                        });
                    } else if (!user.avatar) {
                        user.avatar = avatar;
                        await user.save();
                    }

                    return done(null, user);
                } catch (err) {
                    console.error('Facebook login error:', err);
                    return done(err, null);
                }
            },
        ),
    );
};
