const mongoose = require("mongoose");
const {format} = require('date-fns');

const courseSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true 
    },
    headline: {
        type: String,
        required: true 
    },
    images:[
        {
            type: String,
            required: true
        }
    ],
    field: {
        type: String,
        required: true 
    },
    price: {
        type: Number,
        required: true,
        default: 0
    },
    oldPrice: {
        type: Number, 
        default: 0
    },
    startingDate: {
        type: String,
        default: ''
    },
    EndingDate: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        required: true
    },
    aboutTeacher: {
        type: String,
        default: ''
    },
    event: [
        {
            type: String,
            default: null
        }
    ],
    rating: {
        type: Number,
        required: true,
        default: 5
    },
    capacity: {
        type: Number,
        default: 0
    },
    prerequisite: [
        {
            type: String,
            default: null
        }
    ],
    dateCreated: {
        type: String,
        default: () => new Intl.DateTimeFormat('fa-IR', {
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(new Date())
    },
    dateEdited: {
        type: String,
        default: ''
    }
});

courseSchema.virtual('id').get(function (){
    return this._id.toHexString();
});

courseSchema.set('toJSON', {
    virtuals: true
})

exports.Course = mongoose.model('Course', courseSchema);