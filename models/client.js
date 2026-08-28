const mongoose = require('mongoose');

const clientSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
    },
    phone: {
        type: String,
        required: true,
        unique: true,  // ← CHANGED: phone is now unique and required
        index: true
    },
    email: {
        type: String,
        required: false,  // ← CHANGED: email is now optional
        unique: true,
        sparse: true,     // ← Allows multiple null/undefined values
        default: null
    },
    password: {
        type: String,
        required: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    otp: {
        type: String
    },
    otpExpires: {
        type: Date
    },
    resetPasswordOTP: {
        type: String,
        default: null
    },
    resetPasswordOTPExpires: {
        type: Date,
        default: null
    },
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

clientSchema.virtual('id').get(function () {
    return this._id.toHexString();
});

clientSchema.set('toJSON', {
    virtuals: true,
});

exports.Client = mongoose.model('Client', clientSchema);
exports.clientSchema = clientSchema;