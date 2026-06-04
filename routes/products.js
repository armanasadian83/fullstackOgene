const {Product} = require('./../models/products');
const express = require('express');
const router = express.Router();

/* img problem */
const {ImageUpload} = require('./../models/imageUpload');
//const { CloudinaryStorage } = require("multer-storage-cloudinary");
//const cloudinary = require("./cloudinary");

// new arwan cloud configuration
const { upload, uploadToArvan, s3 } = require('.//arvancloud');
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
//

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


/*const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "products",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    public_id: (req, file) => `${Date.now()}_${file.originalname}`
  }
});

const upload = multer({ storage });*/

/*router.post("/upload", upload.array("images"), async (req, res) => {
    try {
        const imagesArr = req.files.map(file => file.path);  
        // file.path = Cloudinary URL

        // Save to DB
        let imagesUploaded = new ImageUpload({
            images: imagesArr,
        });
        await imagesUploaded.save();

        return res.status(200).json(imagesArr);

    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Upload failed" });
    }
});*/

/*router.delete("/delete-image/:publicId", async (req, res) => {
    try {  
        const publicId = req.params.publicId;

        await cloudinary.uploader.destroy(publicId, { resource_type: "image" });

        res.json({
            success: true,
            msg: "Image deleted successfully"
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({
            success: false,
            error: "Cloudinary deletion failed"
        });
    }
});*/

// new arwan configuration
// Route آپلود تصاویر با ArvanCloud
router.post("/upload", upload.array("images", 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: "هیچ فایلی آپلود نشده است" });
        }

        const imagesArr = [];
        
        // آپلود تک تک فایل‌ها
        for (const file of req.files) {
            const { url, key } = await uploadToArvan(file, "products");
            imagesArr.push(url);
            // اگر نیاز داری key را برای حذف بعدی ذخیره کنی
            // می‌توانی یک آرایه جداگانه داشته باشی
        }
        
        // ذخیره URLها در دیتابیس
        let imagesUploaded = new ImageUpload({
            images: imagesArr,
        });
        await imagesUploaded.save();

        return res.status(200).json(imagesArr);

    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Upload failed: " + error.message });
    }
});

// ✅ جایگزین کن با این
router.delete("/delete-image/:fileKey", async (req, res) => {
    try {  
        const fileKey = req.params.fileKey;
        
        const deleteCommand = new DeleteObjectCommand({
            Bucket: process.env.ARVAN_BUCKET_NAME,
            Key: fileKey
        });
        
        await s3.send(deleteCommand);

        res.json({
            success: true,
            msg: "Image deleted successfully"
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({
            success: false,
            error: "ArvanCloud deletion failed: " + err.message
        });
    }
});







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
        images: req.body.images,
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

router.delete('/deleteImage', async (req, res) => {});



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
    const time = new Intl.DateTimeFormat('fa-IR', {dateStyle: 'short',timeStyle: 'short', timeZone: 'Asia/Tehran'}).format(d)


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