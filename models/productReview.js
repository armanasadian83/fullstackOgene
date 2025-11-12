const mongoose = require('mongoose');

const productReviewsSchema = mongoose.Schema({
    productId: {
        type: String,
        required: true
    },
    customerName: {
        type: String,
        required: true
    },
    customerId: {
        type: String,
        required: true
    },
    review: {
        type: String,
        required: true,
        default: ""
    },
    customerRating: { 
        type: Number,
        required: true, 
        default: 1
    },
    dateCreated: {
        type: String,
        default: () => new Intl.DateTimeFormat('fa-IR', {
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(new Date())
    },
});

productReviewsSchema.virtual('id').get(function () {
    return this._id.toHexString(); 
})

productReviewsSchema.set('toJSON', {
    virtuals: true
})

exports.ProductReviews = mongoose.model('ProductReviews', productReviewsSchema); 
exports.productReviewsSchema = productReviewsSchema;