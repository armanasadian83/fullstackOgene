const mongoose = require("mongoose");

const requestSchema = mongoose.Schema({
    reqName: [
        {
            type: String,
            required: true
        }
    ],
    name: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    userId:{
        type: String,
        default: ''
    },
    dateCreated: {
        type: String,
        default: () => new Intl.DateTimeFormat('fa-IR', {
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(new Date())
    },
});

requestSchema.virtual('id').get(function (){
    return this._id.toHexString();
});

requestSchema.set('toJSON', {
    virtuals: true
})

exports.Request = mongoose.model('Request', requestSchema);