const mongoose = require('mongoose');

const serviceSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    field: {
        type: String,
        required: true
    },
    dateCreated: {
        type: String,
        default: () => new Intl.DateTimeFormat('fa-IR', {
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(new Date())
    },
});

serviceSchema.virtual('id').get(function () {
    return this._id.toHexString(); 
});

serviceSchema.set('toJSON', { 
    virtuals: true,
});

exports.Service = mongoose.model('Service', serviceSchema);