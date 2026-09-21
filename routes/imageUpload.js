const {ImageUpload} = require('./../models/imageUpload');
const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const imageList = await ImageUpload.find();

        if (!imageList) { 
            return res.status(500).json({ success: false })
        }
        
        // پردازش برای نمایش بهتر metadata
        const sanitizedList = imageList.map(item => {
            const obj = item.toObject();
            // اگر metadata خالی است، یک Object خالی برگردان
            if (!obj.metadata || typeof obj.metadata !== 'object') {
                obj.metadata = {};
            }
            return obj;
        });
        
        res.send(sanitizedList);
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({ 
            success: false, 
            message: 'خطا در دریافت تصاویر' 
        });
    }
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