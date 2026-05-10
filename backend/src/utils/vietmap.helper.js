const axios = require("axios");
const { hasEnvValues, isProviderEnabled } = require('../config/runtime.js');

const VIETMAP_API_KEY = process.env.VIETMAP_API_KEY;
const NODE_ENV = process.env.NODE_ENV || "development";
const DEFAULT_TIMEOUT = 8000;

// --- Utility helpers ---
const extractFeatures = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.features)) return payload.features;
    return [];
};

const toLowerSafe = (value) =>
    typeof value === "string" ? value.toLowerCase() : "";

// --- Format address ---
const buildFormattedAddress = (props = {}, userInput = "") => {
    const rawParts = [
        props.locality || "",
        props.county || "",
        props.region || "",
    ]
        .filter(Boolean)
        .map((p) => p.trim());

    // Remove duplicates (case-insensitive)
    const uniqueParts = [];
    for (const part of rawParts) {
        const lower = part.toLowerCase();
        if (!uniqueParts.some((x) => x.toLowerCase() === lower)) {
            uniqueParts.push(part);
        }
    }

    return uniqueParts.join(", ");
};

// --- Pick best VietMap feature ---
const selectBestFeature = (features, targetText) => {
    if (!features.length) return null;
    if (!targetText) return features[0];

    const lowerTarget = targetText.toLowerCase();
    const match = features.find((f) => {
        const label = toLowerSafe(f.properties?.label);
        const name = toLowerSafe(f.properties?.name);
        return label.includes(lowerTarget) || name.includes(lowerTarget);
    });

    return match || features[0];
};

// --- Build final address result ---
const buildResultFromFeature = (feature, userInput = "") => {
    if (!feature) return null;

    const props = feature.properties || {};
    const coords = feature.geometry?.coordinates || [];

    // Tách phần số nhà hoặc đầu vào
    const inputHead = userInput.split(",")[0].trim();

    // Lấy hành chính từ VietMap
    const vietmapAdmin = buildFormattedAddress(props);

    // Loại phần hành chính trùng trong input
    const cleanedHead = inputHead
        .replace(/(Phường|Xã|Thị Trấn|Quận|Huyện|Thành Phố).*/i, "")
        .trim();

    // Hợp nhất số nhà người nhập + hành chính chuẩn từ VietMap
    const formatted = [cleanedHead, vietmapAdmin]
        .filter(Boolean)
        .join(", ")
        .replace(/,\s*,/g, ",")
        .replace(/\s{2,}/g, " ")
        .trim();

    return {
        valid: true,
        formatted,
        lat: typeof coords[1] === "number" ? coords[1] : null,
        lng: typeof coords[0] === "number" ? coords[0] : null,
    };
};

// --- Request wrapper ---
const vietMapRequest = async (endpoint, params = {}) => {
    const response = await axios.get(
        `https://maps.vietmap.vn/api/${endpoint}`,
        {
            params: { apikey: VIETMAP_API_KEY, type: "address", ...params },
            timeout: DEFAULT_TIMEOUT,
        },
    );
    return extractFeatures(response.data?.data);
};

// --- Verify address using VietMap ---
const verifyAddress = async (addressLine) => {
    try {
        if (!isProviderEnabled('VIETMAP_ENABLED', true)) {
            return {
                valid: true,
                userInput: addressLine,
                formatted: addressLine,
                lat: null,
                lng: null,
                corrected: false,
            };
        }

        if (!addressLine || !VIETMAP_API_KEY) {
            throw new Error("Missing address or API key");
        }

        const searchResults = await vietMapRequest("search", {
            text: addressLine,
        });
        const matched = buildResultFromFeature(
            selectBestFeature(searchResults, addressLine),
            addressLine,
        );

        if (matched) {
            return {
                valid: true,
                userInput: addressLine,
                formatted: matched.formatted,
                lat: matched.lat,
                lng: matched.lng,
                corrected: matched.formatted.trim() !== addressLine.trim(),
            };
        }

        const suggestions = await vietMapRequest("autocomplete", {
            text: addressLine,
        });
        const fallback = buildResultFromFeature(
            selectBestFeature(suggestions, addressLine),
            addressLine,
        );

        if (fallback) {
            return {
                valid: true,
                userInput: addressLine,
                formatted: fallback.formatted,
                lat: fallback.lat,
                lng: fallback.lng,
                corrected: fallback.formatted.trim() !== addressLine.trim(),
            };
        }

        if (NODE_ENV === "development") {
            return {
                valid: true,
                userInput: addressLine,
                formatted: addressLine,
                lat: null,
                lng: null,
                corrected: false,
            };
        }

        return {
            valid: false,
            userInput: addressLine,
            formatted: null,
            lat: null,
            lng: null,
            corrected: false,
        };
    } catch (error) {
        console.error("VietMap verifyAddress error:", error.message);
        return {
            valid: false,
            userInput: addressLine,
            formatted: null,
            lat: null,
            lng: null,
            corrected: false,
        };
    }
};

// --- Suggest addresses ---
const suggestAddress = async (keyword) => {
    try {
        if (
            !isProviderEnabled('VIETMAP_ENABLED', true) ||
            !hasEnvValues('VIETMAP_API_KEY')
        ) {
            return [];
        }

        if (!keyword || !VIETMAP_API_KEY)
            throw new Error("Missing keyword or API key");
        const suggestions = await vietMapRequest("autocomplete", {
            text: keyword,
        });

        return suggestions.map((item) => {
            const props = item.properties || {};
            const coords = item.geometry?.coordinates || [];
            
            // Use label as full address, or fallback to name
            const fullAddress = props.label || props.name || "";
            
            return {
                name: fullAddress,
                address: buildFormattedAddress(props),
                lat: typeof coords[1] === "number" ? coords[1] : null,
                lng: typeof coords[0] === "number" ? coords[0] : null,
            };
        });
    } catch (error) {
        console.error("VietMap suggestAddresses error:", error.message);
        return [];
    }
};

module.exports = { verifyAddress, suggestAddress };
