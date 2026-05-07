const axios = require("axios");
const { hasEnvValues, isProviderEnabled } = require('../config/runtime.js');
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

/**
 * Lấy thông tin thời tiết hiện tại theo tọa độ.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @returns {Promise<{ main: string, description: string, temp: number, isBadWeather: boolean }>}
 */
async function getWeatherCondition(lat, lng) {
    if (!lat || !lng) return { isBadWeather: false, message: 'Thiếu tọa độ' };
    if (
        !isProviderEnabled('WEATHER_ENABLED', true) ||
        !hasEnvValues('OPENWEATHER_API_KEY')
    ) {
        return {
            isBadWeather: false,
            message: 'Weather provider unavailable',
        };
    }

    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=vi`;
        const { data } = await axios.get(url);

        const weatherMain = data.weather[0]?.main || '';
        const weatherDesc = data.weather[0]?.description || '';
        const temp = data.main?.temp ?? 0;

        // Điều kiện "xấu" (tùy chỉnh)
        const badConditions = ['Rain', 'Thunderstorm', 'Storm'];
        const isBadWeather = badConditions.includes(weatherMain);

        return {
            main: weatherMain,
            description: weatherDesc,
            temp,
            isBadWeather,
        };
    } catch (err) {
        console.error("Weather API error:", err.message);
        return {
            isBadWeather: false,
            message: "Không thể lấy dữ liệu thời tiết",
        };
    }
}

module.exports = { getWeatherCondition };
