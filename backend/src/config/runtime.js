const crypto = require('crypto');

const LOCAL_FRONTEND_URL = 'http://localhost:5173';
const getLocalBackendUrl = () =>
    `http://localhost:${process.env.PORT || 6969}`;

const normalizeUrl = (value) => {
    if (!value || typeof value !== 'string') return '';
    return value.trim().replace(/\/+$/, '');
};

const hasScheme = (value) => /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

const normalizeHostedUrl = (value, { localProtocol = 'http', remoteProtocol = 'https' } = {}) => {
    const trimmed = normalizeUrl(value);
    if (!trimmed) return '';
    if (hasScheme(trimmed)) return trimmed;

    const protocol = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(trimmed)
        ? localProtocol
        : remoteProtocol;

    return `${protocol}://${trimmed}`;
};

const parseList = (value) =>
    String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

const isProduction = () => process.env.NODE_ENV === 'production';
const isDevelopment = () => !isProduction();

const getFrontendUrl = () =>
    normalizeHostedUrl(process.env.FRONTEND_URL) ||
    (isDevelopment() ? LOCAL_FRONTEND_URL : '');

const getBackendUrl = () =>
    normalizeHostedUrl(
        process.env.BACKEND_URL ||
            process.env.BACKEND_BASE_URL ||
            process.env.RENDER_EXTERNAL_URL ||
            process.env.BASE_URL,
    ) || (isDevelopment() ? getLocalBackendUrl() : '');

const getApiBaseUrl = () => {
    const backendUrl = getBackendUrl();
    return backendUrl ? `${backendUrl}/api` : '';
};

const getCookieDomain = () => {
    const explicit = normalizeUrl(process.env.COOKIE_DOMAIN);
    if (explicit) return explicit.replace(/^https?:\/\//, '');

    const frontendUrl = getFrontendUrl();
    if (!frontendUrl) return undefined;

    try {
        const hostname = new URL(frontendUrl).hostname;
        if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
        ) {
            return undefined;
        }

        const parts = hostname.split('.');
        if (parts.length >= 2) {
            return `.${parts.slice(-2).join('.')}`;
        }
    } catch (_error) {
        return undefined;
    }

    return undefined;
};

let cachedSessionSecret = null;
const getSessionSecret = () => {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
    if (!cachedSessionSecret) {
        cachedSessionSecret = crypto.randomBytes(32).toString('hex');
        console.warn(
            '[runtime] SESSION_SECRET is not configured. Using an ephemeral secret for this process.',
        );
    }
    return cachedSessionSecret;
};

const getAllowedCorsOrigins = () => {
    const configured = parseList(process.env.CORS_ALLOWED_ORIGINS);
    const defaults = [LOCAL_FRONTEND_URL, 'http://localhost:5174'];
    const frontendUrl = getFrontendUrl();

    return [...new Set([...defaults, frontendUrl, ...configured].filter(Boolean))];
};

const isRenderOrigin = (origin) =>
    /^https:\/\/[a-z0-9-]+(?:-[a-z0-9-]+)*\.onrender\.com$/i.test(origin || '');

const isProviderEnabled = (flagName, fallback = true) => {
    const raw = process.env[flagName];
    if (raw == null || raw === '') return fallback;
    return raw === 'true';
};

const hasEnvValues = (...keys) =>
    keys.every((key) => {
        const value = process.env[key];
        return typeof value === 'string' && value.trim() !== '';
    });

module.exports = {
    LOCAL_FRONTEND_URL,
    getAllowedCorsOrigins,
    getApiBaseUrl,
    getBackendUrl,
    getCookieDomain,
    isRenderOrigin,
    getFrontendUrl,
    getSessionSecret,
    hasEnvValues,
    isDevelopment,
    isProduction,
    isProviderEnabled,
    normalizeUrl,
    getLocalBackendUrl,
};
