const express = require("express");
const auth = require("../middlewares/auth.middleware.js");
const addressRepository = require("../repositories/address.repository.js");

const {
    getAllAddresses,
    getAddressesByUserId,
    getAddressById,
    createAddress,
    updateAddress,
    setDefaultAddress,
    deleteAddress,
} = require("../controllers/address.controller.js");

const {
    getAddressSuggestions,
} = require("../controllers/vietmap.controller.js");
const router = express.Router();

const isAdmin = (req) => req.user?.role === "admin";

const ensureSelfOrAdminByUserId = (paramName = "userId") => (req, res, next) => {
    const targetUserId = String(req.params[paramName] || req.body?.[paramName] || req.query?.[paramName] || "");
    if (isAdmin(req) || (targetUserId && String(req.user?.id) === targetUserId)) {
        return next();
    }
    return res.status(403).json({
        success: false,
        message: "Forbidden: You can only access your own addresses",
    });
};

const ensureAddressOwnerOrAdmin = async (req, res, next) => {
    try {
        const addressId = req.params.id || req.params.addressId;
        const address = await addressRepository.findById(addressId);

        if (!address) {
            return res.status(404).json({
                success: false,
                message: "Address not found",
            });
        }

        const ownerId = String(address.userId?._id || address.userId || "");
        if (isAdmin(req) || ownerId === String(req.user?.id || "")) {
            req.address = address;
            return next();
        }

        return res.status(403).json({
            success: false,
            message: "Forbidden: You can only access your own addresses",
        });
    } catch (error) {
        return next(error);
    }
};

const scopeAddressListToCurrentUser = (req, _res, next) => {
    if (!isAdmin(req)) {
        req.query.userId = req.user.id;
    }
    next();
};

const bindAddressUserForCreate = (req, res, next) => {
    const requestedUserId = req.body?.userId ? String(req.body.userId) : "";
    if (!isAdmin(req)) {
        if (requestedUserId && requestedUserId !== String(req.user.id)) {
            return res.status(403).json({
                success: false,
                message: "Forbidden: You can only create addresses for yourself",
            });
        }
        req.body.userId = req.user.id;
    }
    next();
};

//VietMap api gợi ý địa chỉ, autocomplete
router.get("/suggest", getAddressSuggestions);

// (Tùy chọn) Route lấy địa chỉ mặc định của người dùng hiện tại
router.get("/default/:userId", auth, ensureSelfOrAdminByUserId("userId"), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const addressService = require("../services/address.service.js");
        const addresses = await addressService.getAddressesByUserId(userId);
        const defaultAddress = addresses.find((a) => a.isDefault);
        if (!defaultAddress) {
            return res
                .status(404)
                .json({ success: false, message: "No default address found" });
        }
        res.json({ success: true, data: defaultAddress });
    } catch (error) {
        next(error);
    }
});

// Lấy tất cả địa chỉ (có thể lọc theo userId, phân trang)
router.get('/', auth, scopeAddressListToCurrentUser, getAllAddresses);

// Lấy toàn bộ địa chỉ của một người dùng
router.get('/user/:userId', auth, ensureSelfOrAdminByUserId("userId"), getAddressesByUserId);

// Lấy chi tiết một địa chỉ theo ID
router.get('/:id', auth, ensureAddressOwnerOrAdmin, getAddressById);

// Tạo địa chỉ mới cho người dùng
router.post('/', auth, bindAddressUserForCreate, createAddress);

// Cập nhật thông tin địa chỉ
router.put('/:id', auth, ensureAddressOwnerOrAdmin, updateAddress);

// Đặt địa chỉ mặc định cho người dùng
///api/addresses/:userId/default/:addressId
router.patch(
    '/:userId/default/:addressId',
    auth,
    ensureSelfOrAdminByUserId("userId"),
    ensureAddressOwnerOrAdmin,
    setDefaultAddress,
);

// Xóa địa chỉ
router.delete('/:id', auth, ensureAddressOwnerOrAdmin, deleteAddress);

module.exports = router;
