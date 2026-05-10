const { GoogleGenerativeAI } = require('@google/generative-ai');
const { hasEnvValues, isProviderEnabled } = require('../config/runtime.js');

const geminiEnabled = isProviderEnabled('GEMINI_ENABLED', true);
const geminiConfigured = hasEnvValues('GEMINI_API_KEY');

const analyzeReviewContent = async (text) => {
    try {
        if (!geminiEnabled || !geminiConfigured) {
            return {
                isSafe: false,
                toxicScore: 0,
                flaggedCategories: ['moderation_unavailable'],
                autoApprove: false,
            };
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Sử dụng model flash cho tốc độ nhanh
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // --- TỐI ƯU PROMPT SONG NGỮ (ANH - VIỆT) ---
        const prompt = `
            You are a strict, bilingual AI Content Moderator (Vietnamese & English) for an E-commerce platform. 
            Your task is to analyze the following product review for toxic content. 
            You must detect slang, teencode, misspelled words, and profanity in BOTH Vietnamese and English.

            Review content: "${text}"

            Analyze based on these specific categories:
            1. "profanity": 
               - Vietnamese: Chửi thề, nói tục, viết tắt bậy (dm, vcl, cc, dcm, deo...).
               - English: Swear words, F-word, S-word, B-word (fuck, shit, bitch, wtf, stfu...).
            2. "harassment": 
               - Vietnamese: Xúc phạm nhân phẩm, chửi ngu/ngốc, body shaming (béo, lùn, xấu), quấy rối.
               - English: Bullying, personal attacks, calling names (idiot, stupid, ugly, fat), sexual harassment.
            3. "violence": 
               - Vietnamese: Đe dọa đánh, giết, xử lý, đốt quán, ngôn từ hung hăng.
               - English: Threats to kill, beat, harm, or violent language.
            4. "hate_speech": 
               - Racism, discrimination based on region (PBVM), gender, religion in both languages.
            5. "scam": 
               - Accusations of fraud/scam without proof (lừa đảo, scammer, fake) or spam advertising.

            Output ONLY a valid JSON object with this structure (no markdown):
            {
                "isSafe": boolean, // true if the content is polite and safe. false if it violates ANY category above.
                "toxicScore": number, // 0.0 to 1.0 (1.0 is extremely toxic/dangerous)
                "flaggedCategories": ["array", "of", "matched", "categories"] // e.g., ["profanity", "harassment"]. Return [] if safe.
            }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let textResponse = response.text();

        // Clean string (xóa markdown ```json nếu có)
        textResponse = textResponse
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        const jsonResult = JSON.parse(textResponse);

        return {
            isSafe: jsonResult.isSafe,
            toxicScore: jsonResult.toxicScore || 0,
            flaggedCategories: jsonResult.flaggedCategories || [],
            // Auto-approve nếu an toàn VÀ toxicScore thấp
            autoApprove:
                jsonResult.isSafe && (jsonResult.toxicScore || 0) < 0.3,
        };
    } catch (error) {
        console.error('Gemini AI Error:', error);
        // Fallback: Nếu AI lỗi, chặn lại để Admin duyệt tay
        return {
            isSafe: false,
            toxicScore: 0,
            flaggedCategories: ['ai_error'],
            autoApprove: false,
        };
    }
};

module.exports = {
    analyzeReviewContent,
};
