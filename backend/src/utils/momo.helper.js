// src/utils/momo.helper.js
const crypto = require('crypto');

function createMomoSignatureForCreatePayment({
    accessKey,
    amount,
    extraData,
    ipnUrl,
    orderId,
    orderInfo,
    partnerCode,
    redirectUrl,
    requestId,
    requestType,
    secretKey,
}) {
    const rawSignature =
        "accessKey=" +
        accessKey +
        "&amount=" +
        amount +
        "&extraData=" +
        extraData +
        "&ipnUrl=" +
        ipnUrl +
        "&orderId=" +
        orderId +
        "&orderInfo=" +
        orderInfo +
        "&partnerCode=" +
        partnerCode +
        "&redirectUrl=" +
        redirectUrl +
        "&requestId=" +
        requestId +
        "&requestType=" +
        requestType;

    const signature = crypto
        .createHmac("sha256", secretKey)
        .update(rawSignature, "utf8")
        .digest("hex");

    return { rawSignature, signature };
}

function buildRawSignature(params) {
    return createMomoSignatureForCreatePayment({
        ...params,
        secretKey: '',
    }).rawSignature;
}

function generateSignature(rawSignature, secretKey) {
    return crypto
        .createHmac("sha256", secretKey)
        .update(rawSignature, "utf8")
        .digest("hex");
}

// IPN: ở dev mình có thể bỏ verify, nhưng vẫn chuẩn bị hàm sẵn
function createMomoSignatureForIpn(params, secretKey) {
    const {
        accessKey,
        amount,
        extraData,
        message,
        orderId,
        orderInfo,
        orderType,
        partnerCode,
        payType,
        requestId,
        responseTime,
        resultCode,
        transId,
    } = params;

    const rawSignature =
        "accessKey=" +
        accessKey +
        "&amount=" +
        amount +
        "&extraData=" +
        extraData +
        "&message=" +
        message +
        "&orderId=" +
        orderId +
        "&orderInfo=" +
        orderInfo +
        "&orderType=" +
        orderType +
        "&partnerCode=" +
        partnerCode +
        "&payType=" +
        payType +
        "&requestId=" +
        requestId +
        "&responseTime=" +
        responseTime +
        "&resultCode=" +
        resultCode +
        "&transId=" +
        transId;

    const signature = crypto
        .createHmac("sha256", secretKey)
        .update(rawSignature, "utf8")
        .digest("hex");

    return { rawSignature, signature };
}

module.exports = {
    buildRawSignature,
    createMomoSignatureForCreatePayment,
    createMomoSignatureForIpn,
    generateSignature,
};
