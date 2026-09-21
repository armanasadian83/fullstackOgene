const express = require('express');
const router = express.Router();
const { upload, uploadToArvan } = require('./arvancloud');
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 1000,
    max: 15,
    message: "Too many requests. Slow down.",
});

// آپلود تصاویر به Arvan
router.post('/images', upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'هیچ فایلی آپلود نشده است'
            });
        }

        const imageUrls = [];
        
        for (const file of req.files) {
            const { url } = await uploadToArvan(file, 'products');
            imageUrls.push(url);
        }
        
        res.status(200).json({
            success: true,
            message: `${imageUrls.length} تصویر با موفقیت آپلود شد!`,
            imageUrls: imageUrls
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در آپلود تصاویر: ' + error.message
        });
    }
});

module.exports = router;