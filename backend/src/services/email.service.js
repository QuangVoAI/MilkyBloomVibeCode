const { sendMail } = require('../libs/mailer.js');
const { getFrontendUrl } = require('../config/runtime.js');

const FRONTEND_URL = getFrontendUrl();

/**
 * Format price to VND
 */
function formatPrice(price) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(price);
}

/**
 * Format date to Vietnamese format
 */
function formatDate(date) {
    return new Date(date).toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Generate order items HTML
 */
function generateItemsHtml(items) {
    return items.map(item => {
        const productName = item.productId?.name || 'Sản phẩm';
        const variantInfo = item.variantId?.attributes?.map(a => `${a.name}: ${a.value}`).join(', ') || '';
        const quantity = item.quantity || 1;
        const unitPrice = Number(item.unitPrice) || 0;
        const subtotal = Number(item.subtotal) || unitPrice * quantity;

        return `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">
                    <strong>${productName}</strong>
                    ${variantInfo ? `<br><span style="color: #666; font-size: 12px;">${variantInfo}</span>` : ''}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${quantity}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatPrice(unitPrice)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatPrice(subtotal)}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Send order confirmation email to registered user
 */
async function sendOrderConfirmationEmail(order, user, items, address) {
    if (!user?.email) {
        return;
    }

    const orderId = order._id.toString();
    const orderIdShort = orderId.slice(-8).toUpperCase();
    const totalAmount = Number(order.totalAmount?.$numberDecimal || order.totalAmount) || 0;
    const shippingFee = Number(order.shippingFee) || 0;
    const discountAmount = Number(order.discountAmount) || 0;
    const voucherDiscount = Number(order.voucherDiscount) || 0;
    const pointsUsed = Number(order.pointsUsed) || 0;

    const itemsHtml = generateItemsHtml(items);
    const orderLink = `${FRONTEND_URL}/order-history/${orderId}`;

    const addressText = address 
        ? `${address.fullNameOfReceiver || user.fullName}, ${address.phone}<br>${address.addressLine}`
        : 'Không có thông tin địa chỉ';

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Đặt hàng thành công!</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Cảm ơn bạn đã mua sắm tại MilkyBloom</p>
        </div>
        
        <div style="background: #fff; padding: 30px; border: 1px solid #eee; border-top: none;">
            <p>Xin chào <strong>${user.fullName || 'bạn'}</strong>,</p>
            <p>Đơn hàng của bạn đã được tiếp nhận và đang được xử lý.</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px; color: #ff6b35;">📦 Thông tin đơn hàng #${orderIdShort}</h3>
                <p style="margin: 5px 0;"><strong>Ngày đặt:</strong> ${formatDate(order.createdAt)}</p>
                <p style="margin: 5px 0;"><strong>Phương thức thanh toán:</strong> ${getPaymentMethodText(order.paymentMethod)}</p>
                <p style="margin: 5px 0;"><strong>Hình thức giao hàng:</strong> ${getDeliveryTypeText(order.deliveryType)}</p>
            </div>

            <div style="margin: 20px 0;">
                <h3 style="color: #ff6b35;">📍 Địa chỉ giao hàng</h3>
                <p style="background: #f8f9fa; padding: 15px; border-radius: 8px;">${addressText}</p>
            </div>

            <h3 style="color: #ff6b35;">🛒 Chi tiết đơn hàng</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th style="padding: 12px; text-align: left;">Sản phẩm</th>
                        <th style="padding: 12px; text-align: center;">SL</th>
                        <th style="padding: 12px; text-align: right;">Đơn giá</th>
                        <th style="padding: 12px; text-align: right;">Thành tiền</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 20px;">
                <table style="width: 100%; border-collapse: collapse;">
                ${discountAmount > 0 ? `<tr><td style="padding: 5px 0;">Giảm giá:</td><td style="padding: 5px 0; text-align: right; color: #28a745;">-${formatPrice(discountAmount)}</td></tr>` : ''}
                ${voucherDiscount > 0 ? `<tr><td style="padding: 5px 0;">Voucher:</td><td style="padding: 5px 0; text-align: right; color: #28a745;">-${formatPrice(voucherDiscount)}</td></tr>` : ''}
                ${pointsUsed > 0 ? `<tr><td style="padding: 5px 0;">Điểm đã dùng:</td><td style="padding: 5px 0; text-align: right; color: #28a745;">-${formatPrice(pointsUsed)}</td></tr>` : ''}
                <tr><td style="padding: 5px 0;">Phí vận chuyển:</td><td style="padding: 5px 0; text-align: right;">${shippingFee > 0 ? formatPrice(shippingFee) : 'Miễn phí'}</td></tr>
                </table>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 5px 0; font-size: 18px;"><strong>Tổng cộng:</strong></td><td style="padding: 5px 0; text-align: right; font-size: 18px;"><strong style="color: #ff6b35;">${formatPrice(totalAmount)}</strong></td></tr>
                </table>
            </div>

            <div style="text-align: center; margin-top: 30px;">
                <a href="${orderLink}" style="display: inline-block; background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%); color: white; text-decoration: none; padding: 15px 30px; border-radius: 8px; font-weight: bold;">Xem đơn hàng</a>
            </div>

            <p style="margin-top: 30px; color: #666; font-size: 14px;">
                Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi qua email hoặc hotline.
            </p>
        </div>

        <div style="background: #333; color: white; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
            <p style="margin: 0;">© 2024 MilkyBloom Toy Store</p>
            <p style="margin: 5px 0 0; font-size: 12px; color: #aaa;">Đồ chơi an toàn cho bé yêu của bạn</p>
        </div>
    </body>
    </html>
    `;

    try {
        await sendMail({
            to: user.email,
            subject: `✅ Đơn hàng #${orderIdShort} đã được tiếp nhận - MilkyBloom`,
            html
        });
    } catch (err) {
        console.error('[EMAIL ERROR] Failed to send order confirmation:', err?.message || err);
    }
}

/**
 * Send order confirmation email to guest
 */
async function sendGuestOrderConfirmationEmail(order, guestInfo, items, address) {
    if (!guestInfo?.email && !address?.email) {
        return;
    }

    const email = guestInfo?.email || address?.email;
    const fullName = guestInfo?.fullName || address?.fullNameOfReceiver || 'Quý khách';

    const orderId = order._id.toString();
    const orderIdShort = orderId.slice(-8).toUpperCase();
    const totalAmount = Number(order.totalAmount?.$numberDecimal || order.totalAmount) || 0;
    const shippingFee = Number(order.shippingFee) || 0;

    const itemsHtml = generateItemsHtml(items);
    const orderLink = `${FRONTEND_URL}/order-history/${orderId}`;

    const addressText = address 
        ? `${address.fullNameOfReceiver || fullName}, ${address.phone || guestInfo?.phone}<br>${address.addressLine || guestInfo?.addressLine}`
        : `${fullName}, ${guestInfo?.phone}<br>${guestInfo?.addressLine}`;

    // Check if this is a new account with generated password
    const isNewAccount = guestInfo?.generatedPassword;
    const accountInfoHtml = isNewAccount ? `
            <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
                <h3 style="margin: 0 0 15px; color: #155724;">🔐 Thông tin tài khoản của bạn</h3>
                <p style="margin: 5px 0;">Chúng tôi đã tạo tài khoản để bạn có thể theo dõi đơn hàng:</p>
                <div style="background: white; padding: 15px; border-radius: 5px; margin-top: 10px;">
                    <p style="margin: 5px 0;"><strong>📧 Email:</strong> ${email}</p>
                    <p style="margin: 5px 0;"><strong>🔑 Mật khẩu:</strong> <code style="background: #f8f9fa; padding: 5px 10px; border-radius: 4px; font-size: 16px; color: #e83e8c;">${guestInfo.generatedPassword}</code></p>
                </div>
                <p style="margin: 10px 0 0; font-size: 13px; color: #155724;">💡 Vui lòng lưu lại mật khẩu này để đăng nhập và theo dõi đơn hàng!</p>
            </div>
    ` : `
            <div style="background: #d1ecf1; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0dcaf0;">
                <h3 style="margin: 0 0 15px; color: #0c5460;">✅ Email đã có tài khoản</h3>
                <p style="margin: 5px 0;">Email <strong>${email}</strong> đã được gắn với tài khoản trước đó.</p>
                <p style="margin: 10px 0 5px; color: #0c5460;">🔑 Bạn có thể <strong>đăng nhập ngay</strong> bằng email này để:</p>
                <ul style="margin: 5px 0; padding-left: 20px;">
                    <li>Theo dõi trạng thái đơn hàng</li>
                    <li>Xem lịch sử mua hàng</li>
                    <li>Quản lý địa chỉ giao hàng</li>
                </ul>
                <p style="margin: 10px 0 0; font-size: 13px; color: #0c5460;">💡 Nếu quên mật khẩu, hãy sử dụng chức năng "Quên mật khẩu" để đặt lại.</p>
            </div>
    `;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Đặt hàng thành công!</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Cảm ơn bạn đã mua sắm tại MilkyBloom</p>
        </div>
        
        <div style="background: #fff; padding: 30px; border: 1px solid #eee; border-top: none;">
            <p>Xin chào <strong>${fullName}</strong>,</p>
            <p>Đơn hàng của bạn đã được tiếp nhận và đang được xử lý.</p>
            
            ${accountInfoHtml}

            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px; color: #ff6b35;">📦 Thông tin đơn hàng #${orderIdShort}</h3>
                <p style="margin: 5px 0;"><strong>Ngày đặt:</strong> ${formatDate(order.createdAt)}</p>
                <p style="margin: 5px 0;"><strong>Phương thức thanh toán:</strong> ${getPaymentMethodText(order.paymentMethod)}</p>
                <p style="margin: 5px 0;"><strong>Hình thức giao hàng:</strong> ${getDeliveryTypeText(order.deliveryType)}</p>
            </div>

            <div style="margin: 20px 0;">
                <h3 style="color: #ff6b35;">📍 Địa chỉ giao hàng</h3>
                <p style="background: #f8f9fa; padding: 15px; border-radius: 8px;">${addressText}</p>
            </div>

            <h3 style="color: #ff6b35;">🛒 Chi tiết đơn hàng</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th style="padding: 12px; text-align: left;">Sản phẩm</th>
                        <th style="padding: 12px; text-align: center;">SL</th>
                        <th style="padding: 12px; text-align: right;">Đơn giá</th>
                        <th style="padding: 12px; text-align: right;">Thành tiền</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 20px;">
                <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 5px 0;">Phí vận chuyển:</td><td style="padding: 5px 0; text-align: right;">${shippingFee > 0 ? formatPrice(shippingFee) : 'Miễn phí'}</td></tr>
                </table>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 5px 0; font-size: 18px;"><strong>Tổng cộng:</strong></td><td style="padding: 5px 0; text-align: right; font-size: 18px;"><strong style="color: #ff6b35;">${formatPrice(totalAmount)}</strong></td></tr>
                </table>
            </div>

            <div style="text-align: center; margin-top: 30px;">
                <a href="${orderLink}" style="display: inline-block; background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%); color: white; text-decoration: none; padding: 15px 30px; border-radius: 8px; font-weight: bold;">Xem đơn hàng</a>
            </div>

            <p style="margin-top: 30px; color: #666; font-size: 14px;">
                Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi qua email hoặc hotline.
            </p>
        </div>

        <div style="background: #333; color: white; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
            <p style="margin: 0;">© 2024 MilkyBloom Toy Store</p>
            <p style="margin: 5px 0 0; font-size: 12px; color: #aaa;">Đồ chơi an toàn cho bé yêu của bạn</p>
        </div>
    </body>
    </html>
    `;

    try {
        await sendMail({
            to: email,
            subject: `✅ Đơn hàng #${orderIdShort} đã được tiếp nhận - MilkyBloom`,
            html
        });
    } catch (err) {
        console.error('[EMAIL ERROR] Failed to send guest order confirmation:', err?.message || err);
    }
}

/**
 * Send order status update email
 */
async function sendOrderStatusUpdateEmail(order, user, newStatus) {
    if (!user?.email) return;

    const orderId = order._id.toString();
    const orderIdShort = orderId.slice(-8).toUpperCase();
    const orderLink = `${FRONTEND_URL}/order-history/${orderId}`;

    const statusInfo = getStatusInfo(newStatus);

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: ${statusInfo.color}; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">${statusInfo.icon} ${statusInfo.title}</h1>
        </div>
        
        <div style="background: #fff; padding: 30px; border: 1px solid #eee; border-top: none;">
            <p>Xin chào <strong>${user.fullName || 'bạn'}</strong>,</p>
            <p>${statusInfo.message}</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Mã đơn hàng:</strong> #${orderIdShort}</p>
                <p style="margin: 5px 0;"><strong>Trạng thái mới:</strong> ${statusInfo.statusText}</p>
            </div>

            <div style="text-align: center; margin-top: 30px;">
                <a href="${orderLink}" style="display: inline-block; background: #ff6b35; color: white; text-decoration: none; padding: 15px 30px; border-radius: 8px; font-weight: bold;">Xem chi tiết đơn hàng</a>
            </div>
        </div>

        <div style="background: #333; color: white; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
            <p style="margin: 0;">© 2024 MilkyBloom Toy Store</p>
        </div>
    </body>
    </html>
    `;

    try {
        await sendMail({
            to: user.email,
            subject: `${statusInfo.icon} Đơn hàng #${orderIdShort} - ${statusInfo.statusText}`,
            html
        });
    } catch (err) {
        console.error('[EMAIL ERROR] Failed to send status update:', err?.message || err);
    }
}

/**
 * Helper functions
 */
function getPaymentMethodText(method) {
    const methods = {
        'momo': 'Ví MoMo',
        'zalopay': 'ZaloPay',
        'vietqr': 'Chuyển khoản (VietQR)',
        'cashondelivery': 'Thanh toán khi nhận hàng (COD)',
        'cod': 'Thanh toán khi nhận hàng (COD)',
        'cash': 'Thanh toán khi nhận hàng (COD)'
    };
    return methods[method?.toLowerCase()] || method || 'Chưa xác định';
}

function getDeliveryTypeText(type) {
    const types = {
        'economy': 'Tiết kiệm (5-7 ngày)',
        'standard': 'Tiêu chuẩn (3-5 ngày)',
        'express': 'Nhanh (1-2 ngày)',
        'expedited': 'Hỏa tốc (trong ngày)'
    };
    return types[type?.toLowerCase()] || type || 'Tiêu chuẩn';
}

function getStatusInfo(status) {
    const statusMap = {
        'pending': {
            icon: '⏳',
            title: 'Đơn hàng đang chờ xử lý',
            statusText: 'Chờ xác nhận',
            message: 'Đơn hàng của bạn đang chờ được xác nhận. Chúng tôi sẽ xử lý trong thời gian sớm nhất.',
            color: '#ffc107'
        },
        'confirmed': {
            icon: '✅',
            title: 'Đơn hàng đã được xác nhận',
            statusText: 'Đã xác nhận',
            message: 'Đơn hàng của bạn đã được xác nhận và đang được chuẩn bị.',
            color: '#28a745'
        },
        'shipping': {
            icon: '🚚',
            title: 'Đơn hàng đang được giao',
            statusText: 'Đang giao hàng',
            message: 'Đơn hàng của bạn đang trên đường giao đến bạn. Vui lòng chú ý điện thoại!',
            color: '#17a2b8'
        },
        'delivered': {
            icon: '📦',
            title: 'Đơn hàng đã được giao',
            statusText: 'Đã giao hàng',
            message: 'Đơn hàng của bạn đã được giao thành công. Cảm ơn bạn đã mua sắm tại MilkyBloom!',
            color: '#28a745'
        },
        'cancelled': {
            icon: '❌',
            title: 'Đơn hàng đã bị hủy',
            statusText: 'Đã hủy',
            message: 'Đơn hàng của bạn đã bị hủy. Nếu bạn có thắc mắc, vui lòng liên hệ với chúng tôi.',
            color: '#dc3545'
        },
        'returned': {
            icon: '↩️',
            title: 'Đơn hàng đã được hoàn trả',
            statusText: 'Đã hoàn trả',
            message: 'Đơn hàng của bạn đã được hoàn trả. Chúng tôi sẽ xử lý hoàn tiền trong thời gian sớm nhất.',
            color: '#6c757d'
        }
    };
    return statusMap[status?.toLowerCase()] || statusMap['pending'];
}

module.exports = {
    sendOrderConfirmationEmail,
    sendGuestOrderConfirmationEmail,
    sendOrderStatusUpdateEmail
};
