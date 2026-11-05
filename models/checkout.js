const mongoose = require('mongoose');
const { CHECKOUT_LIMITS } = require('../utils/checkout');

const detailsFields = Object.fromEntries(Object.entries(CHECKOUT_LIMITS).map(([field, maxlength]) => [field, {
    type: String,
    required: field !== 'notes',
    maxlength,
    immutable: true,
    ...(field === 'notes' ? { default: '' } : {})
}]));

const checkoutSchema = new mongoose.Schema({
    userId: { type: String, required: true, immutable: true },
    ...detailsFields,
    items: {
        type: [new mongoose.Schema({
            productId: { type: String, required: true },
            productTitle: { type: String, required: true },
            quantity: { type: Number, required: true },
            price: { type: Number, required: true },
            subTotal: { type: Number, required: true },
            typeCourse: { type: Boolean, required: true },
            image: { type: String, default: '' }
        }, { _id: false })],
        required: true,
        immutable: true
    },
    cartItemIds: { type: [String], required: true, immutable: true },
    totalToman: { type: Number, required: true, min: 1, immutable: true },
    // Only the checkout association endpoint sets these after the existing payment starts.
    paymentId: { type: String, unique: true, sparse: true },
    resNum: { type: String }
}, { timestamps: { createdAt: true, updatedAt: false } });

checkoutSchema.index({ userId: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('Checkout', checkoutSchema);
