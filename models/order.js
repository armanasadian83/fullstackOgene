const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    clientName: {
        type: String,
        required: true
    },
    clientId: {
        type: String,
        required: true,
        index: true
    },
    clientPhoneNumber: {
        type: String,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    },
    totalItems: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['در انتظار', 'در حال پردازش', 'تایید شده', 'لغو شده'],
        default: 'در انتظار'
    },
    items: [{
        productId: {
            type: String,
            required: true
        },
        productTitle: {
            type: String,
            required: true
        },
        quantity: {
            type: Number,
            default: 1,
            required: true
        },
        price: {
            type: Number,
            required: true
        },
        subTotal: {
            type: Number,
            required: true
        },
        typeCourse: {
            type: Boolean,
            required: true
        },
        image: String
    }],

    // ---- فیلدهای جدید مربوط به پرداخت ----
    // unique + sparse: سفارش‌های قدیمی (بدون paymentId) مشکلی ایجاد نمی‌کنند
    // و برای هر پرداخت حداکثر یک سفارش ساخته می‌شود.
    paymentId: { type: String, unique: true, sparse: true },
    refNum: { type: String, default: '' },
    traceNo: { type: String, default: '' },
    paidAt: { type: Date },

    dateCreated: {
        type: String,
        default: () => new Intl.DateTimeFormat('fa-IR', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: 'Asia/Tehran'
        }).format(new Date())
    },
    dateEdited: {
        type: String,
        default: ''
    }
});

orderSchema.index({ clientId: 1, dateCreated: -1 });
orderSchema.index({ status: 1 });

module.exports = mongoose.model('Order', orderSchema);
