const mongoose = require('mongoose');

const clientSchema = mongoose.Schema({
    name:{
        type: String,
        required: true
    },
    lastName:{
        type: String,
    },
    phone:{
        type: String,
        required: true,
        unique: false
    },
    email:{
        type: String,
        required: true,
        unique: true
    }, 
    password:{
        type: String,
        required: true
    },
    isVerified:{
        type: Boolean,
        default: false
    },
    otp:{
        type: String
    },
    otpExpires:{
        type: Date
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