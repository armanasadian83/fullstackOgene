const mongoose = require('mongoose');

const eventSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    }
});

eventSchema.virtual('id').get(function () {
    return this._id.toHexString(); 
});

eventSchema.set('toJSON', {
    virtuals: true,
});

exports.Event = mongoose.model('Event', eventSchema);
exports.eventSchema = eventSchema;