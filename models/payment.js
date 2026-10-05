const mongoose = require('mongoose');

/**
 * هر بار که کاربر روی «ثبت سفارش و پرداخت» می‌زند یک Payment ساخته می‌شود.
 * Order فقط بعد از وریفای موفق ساخته می‌شود.
 *
 * status:
 *  pending        توکن گرفته شد، کاربر رفته درگاه
 *  verifying      callback رسید و در حال وریفای است
 *  verify_pending وریفای به خاطر خطای شبکه انجام نشد؛ job دوباره تلاش می‌کند
 *  needs_review   جواب مبهم از سامان (مثلاً ResultCode=2)؛ باید دستی بررسی شود
 *  paid           وریفای موفق + مبلغ درست
 *  failed         ناموفق (سامان خودش ۳۰ دقیقه بعد برگشت می‌زند اگر پولی کم شده باشد)
 *  canceled       کاربر انصراف داد
 *  expired        کاربر هیچ‌وقت برنگشت
 */
const paymentSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    resNum: { type: String, required: true, unique: true },

    amountToman: { type: Number, required: true },
    amountRial: { type: Number, required: true },

    // snapshot دقیق چیزی که کاربر خریده (قیمت‌ها از دیتابیس محصول محاسبه شده)
    items: [{
        _id: false,
        productId: String,
        productTitle: String,
        quantity: Number,
        price: Number,
        subTotal: Number,
        typeCourse: Boolean,
        image: String
    }],
    cartItemIds: [String],

    status: {
        type: String,
        enum: ['pending', 'verifying', 'verify_pending', 'needs_review', 'paid', 'failed', 'canceled', 'expired'],
        default: 'pending',
        index: true
    },
    failReason: { type: String, default: '' },

    token: String,
    refNum: { type: String, unique: true, sparse: true }, // فقط وقتی مقدار دارد ست شود
    rrn: String,
    traceNo: String,
    maskedPan: String,
    hashedPan: String,
    sepState: String,
    sepStatus: String,

    orderId: String,

    callbackAt: Date,
    verifiedAt: Date,
    verifyDeadline: Date
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);