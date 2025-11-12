const mongoose = require("mongoose");
const {format} = require('date-fns');

//const d = new Date()
//const time = new Intl.DateTimeFormat('fa-IR', {dateStyle: 'short',timeStyle: 'short'}).format(d)

const productSchema = mongoose.Schema({ 
    name: {
        type: String,
        required: true
    },
    description: {
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
    countInStock: {
        type: Number,
        required: true
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
    authorName: {
        type: String,
        default: ''
    },
    authorDescription: {
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
    dateEdited: {
        type: String,
        default: ''
    }
});

productSchema.virtual('id').get(function (){
    return this._id.toHexString();
});

productSchema.set('toJSON', {
    virtuals: true
})

exports.Product = mongoose.model('Product', productSchema);