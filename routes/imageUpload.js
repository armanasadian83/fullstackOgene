const {ImageUpload} = require('./../models/imageUpload');
const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
    const imageList = await ImageUpload.find();

    if(!imageList){ 
        res.status(500).json({success: false})
    }
    res.send(imageList);
});


router.delete("/deleteAllImages", async (req, res) => {
    try {
        await ImageUpload.deleteMany({});

        res.status(200).json({
            success: true,
            message: "All images removed from ImageUpload collection"
        });
        
    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({
            success: false,
            message: "Server error while deleting images",
            error: err
        });
    }
});


module.exports = router; 