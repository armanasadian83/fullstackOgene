const {Course} = require('./../models/course');
const express = require('express');
const router = express.Router();

/* img problem */
const {ImageUpload} = require('./../models/imageUpload');
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("./cloudinary");

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


var courseEditId;
var imagesArr = [];

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "products",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    public_id: (req, file) => `${Date.now()}_${file.originalname}`
  }
});

const upload = multer({ storage });

router.post("/upload", upload.array("images"), async (req, res) => {
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
});

router.delete("/delete-image/:publicId", async (req, res) => {
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
});


router.get('/', limiter, async (req, res) => {

    let courseList = [];

    if(req.query.filterKey !== undefined){
        courseList = await Course.find({field: req.query.filterKey});
    }
    else{
        courseList = await Course.find();
    }
    
    if(!courseList){
        res.status(500).json({success: false})
    }
    res.send(courseList);

});



router.post('/create', limiter, async (req, res) => {

    let course = new Course({
        name: req.body.name,
        description: req.body.description,
        headline: req.body.headline,
        aboutTeacher: req.body.aboutTeacher,
        images: req.body.images,
        field: req.body.field,
        price: req.body.price,
        oldPrice: req.body.oldPrice,
        startingDate: req.body.startingDate,
        EndingDate: req.body.EndingDate,
        status: req.body.status,
        event: req.body.event,
        rating: req.body.rating,
        capacity: req.body.capacity,
        prerequisite: req.body.prerequisite,
    });

    course = await course.save();

    if(!course){
        res.status(500).json({
            error: err,
            success: false
        })
    }

    res.status(201).json(course);

    imagesArr=[];

});



router.get('/:id', limiter, async (req, res) => {

    courseEditId = req.params.id;

    const course = await Course.findById(req.params.id)/*.populate("category subCat")*/;

    if(!course) {
        res.status(500).json({message : "The course with given ID was not found!"})
    }

    return res.status(200).send(course);
});



router.delete('/:id', limiter, async (req, res) => {

    const course = await Course.findById(req.params.id);
    const images = course.images;

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

    const deletedCourse = await Course.findByIdAndDelete(req.params.id);

    if(!deletedCourse){
        return res.status(404).json({
            message : "course not found!",
            status : false
        })
    } 

    res.status(200).json({
        message : "The course is deleted!",
        status : true
    })

    courseEditId = undefined;

});





router.put('/:id', limiter, async (req, res) => {

    if(imagesArr.length === 0){
        imagesArr = req.body.images;
    }


    const d = new Date()
    const time = new Intl.DateTimeFormat('fa-IR', {dateStyle: 'short',timeStyle: 'short', timeZone: 'Asia/Tehran'}).format(d)


    const course = await Course.findByIdAndUpdate(
        req.params.id,
        {
            name: req.body.name,
            description: req.body.description,
            headline: req.body.headline,
            aboutTeacher: req.body.aboutTeacher,
            images: imagesArr,
            field: req.body.field,
            price: req.body.price,
            oldPrice: req.body.oldPrice,
            startingDate: req.body.startingDate,
            EndingDate: req.body.EndingDate,
            status: req.body.status,
            event: req.body.event,
            rating: req.body.rating,
            capacity: req.body.capacity,
            prerequisite: req.body.prerequisite,
            dateEdited: time
        },
        {new : true}
    )

    if(!course){
        res.status(404).json({
            message : "The course cannot be updated!",
            status : false
        })
    }

    res.status(200).json({
        message : 'The course is updated!',
        success : true
    })

    imagesArr=[];
    courseEditId = undefined;
})



module.exports = router; 