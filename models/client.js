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
        unique: true,  // ← phone is unique and required
        index: true
    },
    email: {
        type: String,
        required: false,  // ← email is optional
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

    // ============================================
    // NEW OPTIONAL FIELDS
    // ============================================
    nationalCode: {
        type: String,
        required: false,
        unique: true,
        sparse: true,     // ← IMPORTANT: allows multiple nulls (otherwise unique index conflicts)
        default: null
    },
    birthdate: {
        type: String,
        required: false,
        default: null
    },
    englishName: {
        type: String,
        required: false,
        default: null
    },
    englishLastName: {
        type: String,
        required: false,
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

// ✅ Restored — the `id` virtual that returns `_id` as a hex string
clientSchema.virtual('id').get(function () {
    return this._id.toHexString();
});

// ✅ Restored — ensures `id` shows up in JSON responses
clientSchema.set('toJSON', {
    virtuals: true,
});

const Client = mongoose.model('Client', clientSchema);

module.exports = { Client };