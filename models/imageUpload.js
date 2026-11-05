const mongoose = require('mongoose');

// Schema for individual image metadata
const imageMetadataSchema = new mongoose.Schema({
    name: { 
        type: String, 
        default: '' 
    },
    alt: { 
        type: String, 
        default: '' 
    },
    nameEn: { type: String, default: '', maxlength: 500 },
    altEn: { type: String, default: '', maxlength: 2000 },
    liked: {
        type: Boolean,
        default: false
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    }
});

const imageUploadSchema = mongoose.Schema({
    images: [
        {
            type: String,
            required: true
        }
    ],
    // Store metadata for each image URL
    metadata: {
        type: Object,
        default: {}
    }
});

imageUploadSchema.virtual('id').get(function () {
    return this._id.toHexString();
});

imageUploadSchema.set('toJSON', {
    virtuals: true,
});

exports.ImageUpload = mongoose.model('ImageUpload', imageUploadSchema);
exports.imageUploadSchema = imageUploadSchema;
