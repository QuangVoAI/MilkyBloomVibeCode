const Order = require("../models/order.model");
const branches = require("../data/branches");

const COD_METHODS = ["cashondelivery", "cod", "cashOnDelivery", "cash"];

// Helper: so sánh city/province không phân biệt hoa thường, bỏ dấu cách thừa
const normalize = (s = "") => s.trim().toLowerCase();
const VN_PROVINCES = [
    "An Giang","Bà Rịa - Vũng Tàu","Bắc Giang","Bắc Kạn","Bạc Liêu","Bắc Ninh",
    "Bến Tre","Bình Dương","Bình Phước","Bình Thuận","Bình Định","Cà Mau",
    "Cần Thơ","Cao Bằng","Đà Nẵng","Đắk Lắk","Đắk Nông","Điện Biên","Đồng Nai",
    "Đồng Tháp","Gia Lai","Hà Giang","Hà Nam","Hà Nội","Hà Tĩnh","Hải Dương",
    "Hải Phòng","Hậu Giang","Hòa Bình","Hưng Yên","Khánh Hòa","Kiên Giang",
    "Kon Tum","Lai Châu","Lạng Sơn","Lào Cai","Lâm Đồng","Long An","Nam Định",
    "Nghệ An","Ninh Bình","Ninh Thuận","Phú Thọ","Phú Yên","Quảng Bình",
    "Quảng Nam","Quảng Ngãi","Quảng Ninh","Quảng Trị","Sóc Trăng","Sơn La",
    "Tây Ninh","Thái Bình","Thái Nguyên","Thanh Hóa","Thừa Thiên Huế","Tiền Giang",
    "TP. Hồ Chí Minh","Thành phố Hồ Chí Minh","Trà Vinh","Tuyên Quang","Vĩnh Long","Vĩnh Phúc","Yên Bái"
];
const VN_PROVINCE_SET = new Set(VN_PROVINCES.map((p) => normalize(p)));

module.exports = {
    async getBranchesWithOrderStats() {
        // Đếm số đơn theo city của địa chỉ giao hàng
        const orderStats = await Order.aggregate([
            {
                $match: {
                    status: { $nin: ["cancelled", "returned"] },
                    $or: [
                        // Online/ewallet: đã paid
                        { paymentStatus: "paid", paymentMethod: { $nin: COD_METHODS } },
                        // COD: chỉ tính khi đã giao/hoàn tất
                        {
                            paymentMethod: { $in: COD_METHODS },
                            status: { $in: ["delivered", "completed"] },
                            paymentStatus: { $ne: "failed" },
                        },
                    ],
                },
            },
            {
                $lookup: {
                    from: "addresses",
                    localField: "addressId",
                    foreignField: "_id",
                    as: "address",
                },
            },
            { $unwind: { path: "$address", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: { $ifNull: ["$address.city", "unknown"] },
                    addressLine: { $first: "$address.addressLine" },
                    orderCount: { $sum: 1 },
                },
            },
        ]);

        const cityCount = new Map();

        const detectProvince = (rawCity = "", addressLine = "") => {
            const cityNorm = normalize(rawCity);
            if (VN_PROVINCE_SET.has(cityNorm)) return rawCity.trim();

            const addrNorm = normalize(addressLine);
            for (const province of VN_PROVINCES) {
                const pNorm = normalize(province);
                if (addrNorm.includes(pNorm)) return province;
            }
            return rawCity || "";
        };

        orderStats.forEach((s) => {
            const province = detectProvince(s._id, s.addressLine);
            const key = normalize(province || s._id);
            cityCount.set(key, (cityCount.get(key) || 0) + s.orderCount);
        });

        return branches.map((branch) => {
            const key = normalize(branch.province);
            const orderCount = cityCount.get(key) || 0;

            return {
                code: branch.code,
                name: branch.name,
                province: branch.province,
                lat: branch.lat,
                lng: branch.lng,
                orderCount,
                weight: orderCount ? Math.max(orderCount / 200, 0.05) : 0,
            };
        });
    },
};
