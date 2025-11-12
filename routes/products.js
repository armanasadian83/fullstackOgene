const {Product} = require('./../models/products');
const express = require('express');
const router = express.Router();

const fs = require("fs");
const multer  = require('multer');

const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 1000,        // 1 second
    max: 15,                // allow 15 requests per second
    message: "Too many requests. Slow down.",
});

const uploadPerMinuteLimiter = rateLimit({
    windowMs: 60_000, // 1 minute
    limit: 20,        // max 20 uploads/min per user
    message: { error: "Too many uploads per minute." },
});


var productEditId;
var imagesArr = [];

const storage = multer.diskStorage({ 

    destination: function (req, file, cb){
        cb(null, "uploads");
    },
    filename: function (req, file, cb){
        cb(null, `${Date.now()}_${file.originalname}`);
        //imagesArr.push(`${file.originalname}`)
    }
})

const upload = multer({storage: storage})

router.post('/upload', uploadPerMinuteLimiter, upload.array("images"), async (req, res) => {

    let images;
    if(productEditId !== undefined){
        const product = await Product.findById(productEditId);

        if(product){
            images = product.images;
        }

        if(images.length !== 0){
            for(image of images){
                try {
                    fs.unlinkSync(`uploads/${image}`);
                } catch (error) {
                    console.log(error);
                    break;
                }
            }
            productEditId = undefined;
        }
    }
    //to here

    imagesArr=[];
    const files = req.files;

    for(let i=0; i<files.length; i++){
        imagesArr.push(files[i].filename);
    }

    console.log(imagesArr);

    res.send(imagesArr);
})


router.get('/', limiter, async (req, res) => {

    let productList = [];
    
    if(req.query.filterKey !== undefined){
        productList = await Product.find({field: req.query.filterKey});
    }
    else{
        productList = await Product.find();
    } 
    
    if(!productList){
        res.status(500).json({success: false})
    }
    res.send(productList);

});



router.post('/create', limiter, async (req, res) => {

    let product = new Product({
        name: req.body.name,
        description: req.body.description,
        images: imagesArr,
        field: req.body.field,
        price: req.body.price,
        oldPrice: req.body.oldPrice,
        countInStock: req.body.countInStock,
        event: req.body.event,
        rating: req.body.rating,
        authorName: req.body.authorName,
        authorDescription: req.body.authorDescription,
    });

    product = await product.save();

    if(!product){
        res.status(500).json({
            error: err,
            success: false
        })
    }

    res.status(201).json(product);

    imagesArr=[];

});



router.get('/:id', limiter, async (req, res) => {

    productEditId = req.params.id;

    const product = await Product.findById(req.params.id)/*.populate("category subCat")*/;

    if(!product) {
        res.status(500).json({message : "The product with given ID was not found!"})
    }

    return res.status(200).send(product);
});



router.delete('/:id', limiter, async (req, res) => {

    const product = await Product.findById(req.params.id);
    const images = product.images;

    if(images.length !== 0){
        for(image of images){
            try {
                fs.unlinkSync(`uploads/${image}`);
            } catch (error) {
                console.log(error);
                break;
            }
        }
    }

    const deletedProduct = await Product.findByIdAndDelete(req.params.id);

    if(!deletedProduct){
        return res.status(404).json({
            message : "product not found!",
            status : false
        })
    } 

    res.status(200).json({
        message : "The product is deleted!",
        status : true
    })

    productEditId = undefined;

});





router.put('/:id', limiter, async (req, res) => {

    if(imagesArr.length === 0){
        imagesArr = req.body.images;
    }


    const d = new Date()
    const time = new Intl.DateTimeFormat('fa-IR', {dateStyle: 'short',timeStyle: 'short'}).format(d)


    const product = await Product.findByIdAndUpdate(
        req.params.id,
        {
            name: req.body.name,
            description: req.body.description,
            images: imagesArr,
            field: req.body.field,
            price: req.body.price,
            oldPrice: req.body.oldPrice,
            countInStock: req.body.countInStock,
            event: req.body.event,
            rating: req.body.rating,
            authorName: req.body.authorName,
            authorDescription: req.body.authorDescription,
            dateEdited: time
        },
        {new : true}
    )

    if(!product){
        res.status(404).json({
            message : "The product cannot be updated!",
            status : false
        })
    }

    res.status(200).json({
        message : 'The product is updated!',
        success : true
    })

    imagesArr=[];
    productEditId = undefined;
})



module.exports = router; 