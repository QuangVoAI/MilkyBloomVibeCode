const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const CONNECTION_URL = process.env.MONGO_URI;

const connectDB = async () => {
    const tryConnect = async (uri, label) => {
        console.log(`Attempting MongoDB connection (${label})...`);
        const conn = await mongoose.connect(uri, {
            // Những option này giúp Beanstalk tự động reconnect khi mạng AWS delay nhẹ
            serverSelectionTimeoutMS: 10000, // timeout sau 10s
            socketTimeoutMS: 45000, // giữ socket mở 45s
            family: 4, // Force IPv4 to avoid some IPv6/TLS handshake issues
            tls: uri.startsWith("mongodb+srv://"), // SRV connections use TLS by default
        });
        console.log(`Connected to MongoDB: ${conn.connection.host} (${label})`);
        return conn;
    };

    try {
        if (!CONNECTION_URL) {
            console.error(
                'ERROR: MONGO_URI is not defined in environment variables.',
            );
            process.exit(1);
        }

        await tryConnect(CONNECTION_URL, "primary");

        // Nếu mất kết nối
        mongoose.connection.on("disconnected", () => {
            console.warn("MongoDB disconnected. Trying to reconnect...");
        });

        // Nếu có lỗi
        mongoose.connection.on("error", (err) => {
            console.error("MongoDB connection error:", err);
        });

        // Xử lý khi tắt server (Ctrl + C hoặc AWS deploy mới)
        process.on("SIGINT", async () => {
            await mongoose.connection.close();
            process.exit(0);
        });
    } catch (error) {
        console.error(`MongoDB connection failed: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
