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
    totalItems: {  // ← ADD THIS FIELD
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

// Create indexes for better query performance
orderSchema.index({ clientId: 1, dateCreated: -1 });
orderSchema.index({ status: 1 });

module.exports = mongoose.model('Order', orderSchema);