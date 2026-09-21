const express = require('express');
const router = express.Router();
const { listImagesFromArvan, s3 } = require('./arvancloud');
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Course } = require('./../models/course');
const { Product } = require('./../models/products');
const { ImageUpload } = require('./../models/imageUpload');
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 1000,
    max: 15,
    message: "Too many requests. Slow down.",
});

// Helper function to get all images used in courses with course details
const getCourseImagesWithIds = async () => {
    try {
        const courses = await Course.find({}, 'images name');
        const imageData = [];
        courses.forEach(course => {
            if (course.images && course.images.length > 0) {
                course.images.forEach(img => {
                    if (img) {
                        imageData.push({
                            url: img,
                            courseId: course._id.toString(),
                            courseName: course.name
                        });
                    }
                });
            }
        });
        return imageData;
    } catch (error) {
        console.error('Error fetching course images with IDs:', error);
        return [];
    }
};

// Helper function to get all images used in products with product details
const getProductImagesWithIds = async () => {
    try {
        const products = await Product.find({}, 'images name');
        const imageData = [];
        products.forEach(product => {
            if (product.images && product.images.length > 0) {
                product.images.forEach(img => {
                    if (img) {
                        imageData.push({
                            url: img,
                            productId: product._id.toString(),
                            productName: product.name
                        });
                    }
                });
            }
        });
        return imageData;
    } catch (error) {
        console.error('Error fetching product images with IDs:', error);
        return [];
    }
};

// Helper function to get all images used in courses (legacy - for stats)
const getCourseImages = async () => {
    try {
        const courses = await Course.find({}, 'images');
        const imageUrls = [];
        courses.forEach(course => {
            if (course.images && course.images.length > 0) {
                course.images.forEach(img => {
                    if (img) imageUrls.push(img);
                });
            }
        });
        return imageUrls;
    } catch (error) {
        console.error('Error fetching course images:', error);
        return [];
    }
};

// Helper function to get all images used in products (legacy - for stats)
const getProductImages = async () => {
    try {
        const products = await Product.find({}, 'images');
        const imageUrls = [];
        products.forEach(product => {
            if (product.images && product.images.length > 0) {
                product.images.forEach(img => {
                    if (img) imageUrls.push(img);
                });
            }
        });
        return imageUrls;
    } catch (error) {
        console.error('Error fetching product images:', error);
        return [];
    }
};

// ============================================
// Helper functions for ImageUpload metadata
// ============================================

// Get metadata from ImageUpload collection - با استفاده از URL به عنوان کلید اصلی
const getImageMetadataMap = async () => {
    try {
        const imageUploads = await ImageUpload.find({});
        const metadataMap = {};
        
        imageUploads.forEach(doc => {
            if (doc.metadata && typeof doc.metadata === 'object' && doc.images && doc.images.length > 0) {
                // از URL به عنوان کلید اصلی استفاده کن
                const imageUrl = doc.images[0];
                Object.keys(doc.metadata).forEach(key => {
                    metadataMap[key] = {
                        name: doc.metadata[key].name || '',
                        alt: doc.metadata[key].alt || '',
                        liked: doc.metadata[key].liked || false,
                        updatedAt: doc.metadata[key].updatedAt || null,
                        // ذخیره URL برای تطابق
                        url: imageUrl
                    };
                });
            }
        });
        
        return metadataMap;
    } catch (error) {
        console.error('Error fetching image metadata:', error);
        return {};
    }
};

// Save/update metadata in ImageUpload collection
const saveImageMetadata = async (imageKey, imageUrl, name, alt) => {
    try {
        let imageUpload = await ImageUpload.findOne({ images: imageUrl });
        
        if (!imageUpload) {
            imageUpload = new ImageUpload({
                images: [imageUrl],
                metadata: {}
            });
        }
        
        if (!imageUpload.metadata || typeof imageUpload.metadata !== 'object') {
            imageUpload.metadata = {};
        }
        
        const existingMetadata = imageUpload.metadata[imageKey] || {};
        imageUpload.metadata[imageKey] = {
            name: name || '',
            alt: alt || '',
            liked: existingMetadata.liked || false,
            updatedAt: new Date()
        };
        
        imageUpload.markModified('metadata');
        await imageUpload.save();
        return true;
    } catch (error) {
        console.error('Error saving image metadata:', error);
        return false;
    }
};

// ============================================
// GET /images
// ============================================

router.get('/images', limiter, async (req, res) => {
    try {
        const filterType = req.query.filter || 'all';
        const prefix = req.query.prefix || 'products/';
        
        const allImages = await listImagesFromArvan(prefix);
        const metadataMap = await getImageMetadataMap();
        
        const courseImagesData = await getCourseImagesWithIds();
        const productImagesData = await getProductImagesWithIds();
        
        const courseImageUrls = courseImagesData.map(data => data.url);
        const productImageUrls = productImagesData.map(data => data.url);
        
        let filteredImages = [];
        
        if (filterType === 'courses') {
            filteredImages = allImages.filter(img => {
                return courseImageUrls.some(url => url === img.url);
            });
        } else if (filterType === 'products') {
            filteredImages = allImages.filter(img => {
                return productImageUrls.some(url => url === img.url);
            });
        } else if (filterType === 'unused') {
            filteredImages = allImages.filter(img => {
                const usedInCourses = courseImageUrls.some(url => url === img.url);
                const usedInProducts = productImageUrls.some(url => url === img.url);
                return !usedInCourses && !usedInProducts;
            });
        } else {
            filteredImages = allImages;
        }
        
        const imagesWithUsage = filteredImages.map(img => {
            const usedInCourses = courseImagesData.filter(data => data.url === img.url);
            const usedInProducts = productImagesData.filter(data => data.url === img.url);
            
            const courseInfo = usedInCourses.length > 0 ? {
                id: usedInCourses[0].courseId,
                name: usedInCourses[0].courseName
            } : null;
            
            const productInfo = usedInProducts.length > 0 ? {
                id: usedInProducts[0].productId,
                name: usedInProducts[0].productName
            } : null;
            
            let linkedId = null;
            let linkedType = null;
            let linkedName = null;
            
            if (usedInCourses.length > 0) {
                linkedId = usedInCourses[0].courseId;
                linkedType = 'courses';
                linkedName = usedInCourses[0].courseName;
            } else if (usedInProducts.length > 0) {
                linkedId = usedInProducts[0].productId;
                linkedType = 'products';
                linkedName = usedInProducts[0].productName;
            }
            
            // Get metadata from database - استفاده از Object (با لایک)
            const metadata = metadataMap[img.key] || { name: '', alt: '', liked: false };
            
            return {
                ...img,
                usedInCourses: usedInCourses.length > 0,
                usedInProducts: usedInProducts.length > 0,
                usageCount: usedInCourses.length + usedInProducts.length,
                courseInfo: courseInfo,
                productInfo: productInfo,
                linkedId: linkedId,
                linkedType: linkedType,
                linkedName: linkedName,
                displayName: metadata.name || img.name,
                alt: metadata.alt || '',
                liked: metadata.liked || false,
                metadataUpdatedAt: metadata.updatedAt || null,
                usageDetails: {
                    courses: usedInCourses.map(c => ({ id: c.courseId, name: c.courseName })),
                    products: usedInProducts.map(p => ({ id: p.productId, name: p.productName }))
                }
            };
        });
        
        res.status(200).json({
            success: true,
            images: imagesWithUsage,
            total: imagesWithUsage.length,
            filter: filterType,
            stats: {
                totalImages: allImages.length,
                courseImages: courseImageUrls.length,
                productImages: productImageUrls.length,
                usedImages: allImages.filter(img => 
                    courseImageUrls.some(url => url === img.url) || 
                    productImageUrls.some(url => url === img.url)
                ).length,
                unusedImages: allImages.filter(img => 
                    !courseImageUrls.some(url => url === img.url) && 
                    !productImageUrls.some(url => url === img.url)
                ).length,
                likedImages: allImages.filter(img => {
                    const metadata = metadataMap[img.key] || {};
                    return metadata.liked === true;
                }).length
            }
        });
    } catch (error) {
        console.error('Error fetching gallery images:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در دریافت تصاویر گالری',
            error: error.message
        });
    }
});

// ============================================
// Update image metadata (name and alt)
// ============================================

router.put('/image/:imageKey/metadata', limiter, async (req, res) => {
    try {
        const { imageKey } = req.params;
        const { name, alt, imageUrl } = req.body;
        
        console.log('Received metadata update:', { imageKey, name, alt, imageUrl });
        
        if (!imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'آدرس تصویر الزامی است!'
            });
        }
        
        let imageUpload = await ImageUpload.findOne({ images: imageUrl });
        
        if (!imageUpload) {
            imageUpload = new ImageUpload({
                images: [imageUrl],
                metadata: {}
            });
        }
        
        if (!imageUpload.metadata || typeof imageUpload.metadata !== 'object') {
            imageUpload.metadata = {};
        }
        
        const existingMetadata = imageUpload.metadata[imageKey] || {};
        
        imageUpload.metadata[imageKey] = {
            name: name || '',
            alt: alt || '',
            liked: existingMetadata.liked || false,
            updatedAt: new Date()
        };
        
        imageUpload.markModified('metadata');
        await imageUpload.save();
        
        console.log('Metadata saved successfully for:', imageKey);
        
        res.status(200).json({
            success: true,
            message: 'اطلاعات تصویر با موفقیت به‌روزرسانی شد!',
            data: {
                imageKey: imageKey,
                name: name || '',
                alt: alt || ''
            }
        });
    } catch (error) {
        console.error('Error updating image metadata:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در به‌روزرسانی اطلاعات تصویر',
            error: error.message
        });
    }
});

// ============================================
// Get image metadata
// ============================================

router.get('/image/:imageKey/metadata', limiter, async (req, res) => {
    try {
        const { imageKey } = req.params;
        
        const imageUploads = await ImageUpload.find({});
        let metadata = null;
        
        for (const doc of imageUploads) {
            if (doc.metadata && typeof doc.metadata === 'object' && doc.metadata[imageKey]) {
                metadata = doc.metadata[imageKey];
                break;
            }
        }
        
        if (!metadata) {
            return res.status(404).json({
                success: false,
                message: 'اطلاعات تصویر یافت نشد'
            });
        }
        
        res.status(200).json({
            success: true,
            data: {
                imageKey: imageKey,
                name: metadata.name || '',
                alt: metadata.alt || '',
                liked: metadata.liked || false
            }
        });
    } catch (error) {
        console.error('Error fetching image metadata:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در دریافت اطلاعات تصویر',
            error: error.message
        });
    }
});

// ============================================
// Get images by specific folder
// ============================================

router.get('/images/folder/:folder', limiter, async (req, res) => {
    try {
        const folder = req.params.folder;
        const filter = req.query.filter || 'all';
        const prefix = `${folder}/`;
        
        const allImages = await listImagesFromArvan(prefix);
        const metadataMap = await getImageMetadataMap();
        
        const courseImagesData = await getCourseImagesWithIds();
        const productImagesData = await getProductImagesWithIds();
        
        const courseImageUrls = courseImagesData.map(data => data.url);
        const productImageUrls = productImagesData.map(data => data.url);
        
        let filteredImages = [];
        
        if (filter === 'courses') {
            filteredImages = allImages.filter(img => {
                return courseImageUrls.some(url => url === img.url);
            });
        } else if (filter === 'products') {
            filteredImages = allImages.filter(img => {
                return productImageUrls.some(url => url === img.url);
            });
        } else {
            filteredImages = allImages;
        }
        
        const imagesWithUsage = filteredImages.map(img => {
            const usedInCourses = courseImagesData.filter(data => data.url === img.url);
            const usedInProducts = productImagesData.filter(data => data.url === img.url);
            
            const courseInfo = usedInCourses.length > 0 ? {
                id: usedInCourses[0].courseId,
                name: usedInCourses[0].courseName
            } : null;
            
            const productInfo = usedInProducts.length > 0 ? {
                id: usedInProducts[0].productId,
                name: usedInProducts[0].productName
            } : null;
            
            let linkedId = null;
            let linkedType = null;
            let linkedName = null;
            
            if (usedInCourses.length > 0) {
                linkedId = usedInCourses[0].courseId;
                linkedType = 'courses';
                linkedName = usedInCourses[0].courseName;
            } else if (usedInProducts.length > 0) {
                linkedId = usedInProducts[0].productId;
                linkedType = 'products';
                linkedName = usedInProducts[0].productName;
            }
            
            const metadata = metadataMap[img.key] || { name: '', alt: '', liked: false };
            
            return {
                ...img,
                usedInCourses: usedInCourses.length > 0,
                usedInProducts: usedInProducts.length > 0,
                usageCount: usedInCourses.length + usedInProducts.length,
                courseInfo: courseInfo,
                productInfo: productInfo,
                linkedId: linkedId,
                linkedType: linkedType,
                linkedName: linkedName,
                displayName: metadata.name || img.name,
                alt: metadata.alt || '',
                liked: metadata.liked || false,
                metadataUpdatedAt: metadata.updatedAt || null,
                usageDetails: {
                    courses: usedInCourses.map(c => ({ id: c.courseId, name: c.courseName })),
                    products: usedInProducts.map(p => ({ id: p.productId, name: p.productName }))
                }
            };
        });
        
        res.status(200).json({
            success: true,
            images: imagesWithUsage,
            total: imagesWithUsage.length,
            folder: folder,
            filter: filter
        });
    } catch (error) {
        console.error('Error fetching folder images:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در دریافت تصاویر',
            error: error.message
        });
    }
});

// ============================================
// Delete image from Arvan
// ============================================

router.delete('/image/:fileKey', limiter, async (req, res) => {
    try {
        const fileKey = decodeURIComponent(req.params.fileKey);
        
        const allImages = await listImagesFromArvan('products/');
        const imageExists = allImages.some(img => img.key === fileKey);
        
        if (!imageExists) {
            return res.status(404).json({
                success: false,
                message: 'تصویر پیدا نشد!'
            });
        }
        
        const courseImageUrls = await getCourseImages();
        const productImageUrls = await getProductImages();
        
        const image = allImages.find(img => img.key === fileKey);
        const imageUrl = image ? image.url : null;
        
        if (imageUrl) {
            const usedInCourses = courseImageUrls.some(url => url === imageUrl);
            const usedInProducts = productImageUrls.some(url => url === imageUrl);
            
            if (usedInCourses || usedInProducts) {
                return res.status(400).json({
                    success: false,
                    message: 'این تصویر در یک یا چند دوره یا محصول استفاده شده است! ابتدا آن را از دوره/محصول حذف کنید.',
                    usedInCourses,
                    usedInProducts
                });
            }
        }
        
        const deleteCommand = new DeleteObjectCommand({
            Bucket: process.env.ARVAN_BUCKET_NAME,
            Key: fileKey
        });
        
        await s3.send(deleteCommand);
        
        res.json({
            success: true,
            message: 'تصویر با موفقیت حذف شد!'
        });
        
    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در حذف تصویر: ' + error.message
        });
    }
});

// ============================================
// Get image statistics
// ============================================

router.get('/stats', limiter, async (req, res) => {
    try {
        const allImages = await listImagesFromArvan('products/');
        const courseImageUrls = await getCourseImages();
        const productImageUrls = await getProductImages();
        const metadataMap = await getImageMetadataMap();
        
        const totalSize = allImages.reduce((sum, img) => sum + (img.size || 0), 0);
        const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
        
        const folders = [...new Set(allImages.map(img => {
            const parts = img.key.split('/');
            return parts.length > 1 ? parts[0] : 'root';
        }))];
        
        const usedImages = allImages.filter(img => {
            return courseImageUrls.some(url => url === img.url) || 
                   productImageUrls.some(url => url === img.url);
        });
        
        const unusedImages = allImages.filter(img => {
            return !courseImageUrls.some(url => url === img.url) && 
                   !productImageUrls.some(url => url === img.url);
        });
        
        const likedImages = allImages.filter(img => {
            const metadata = metadataMap[img.key] || {};
            return metadata.liked === true;
        });
        
        res.status(200).json({
            success: true,
            stats: {
                totalImages: allImages.length,
                totalSize: totalSizeMB + ' MB',
                folders: folders,
                imagesByFolder: folders.map(folder => ({
                    folder: folder,
                    count: allImages.filter(img => img.key.startsWith(folder + '/')).length
                })),
                usage: {
                    courseImages: courseImageUrls.length,
                    productImages: productImageUrls.length,
                    usedImages: usedImages.length,
                    unusedImages: unusedImages.length
                },
                liked: {
                    total: likedImages.length
                }
            }
        });
    } catch (error) {
        console.error('Error getting image stats:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در دریافت آمار تصاویر'
        });
    }
});

// ============================================
// Validate and get course/product by ID
// ============================================

router.get('/validate/:type/:id', limiter, async (req, res) => {
    try {
        const { type, id } = req.params;
        let item = null;

        if (type === 'course') {
            item = await Course.findById(id);
        } else if (type === 'product') {
            item = await Product.findById(id);
        } else {
            return res.status(400).json({
                success: false,
                message: 'نوع نامعتبر است!'
            });
        }

        if (!item) {
            return res.status(404).json({
                success: false,
                message: '0 یافت شد',
                found: false
            });
        }

        res.status(200).json({
            success: true,
            found: true,
            item: {
                id: item._id,
                name: item.name,
                images: item.images || []
            }
        });
    } catch (error) {
        console.error('Error validating ID:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در بررسی شناسه',
            error: error.message
        });
    }
});

// ============================================
// Link image to course or product
// ============================================

router.post('/link-image', limiter, async (req, res) => {
    try {
        const { imageUrl, type, id } = req.body;

        if (!imageUrl || !type || !id) {
            return res.status(400).json({
                success: false,
                message: 'اطلاعات کامل نیست!'
            });
        }

        let item = null;
        let itemType = '';

        if (type === 'course') {
            item = await Course.findById(id);
            itemType = 'دوره';
        } else if (type === 'product') {
            item = await Product.findById(id);
            itemType = 'محصول';
        } else {
            return res.status(400).json({
                success: false,
                message: 'نوع نامعتبر است!'
            });
        }

        if (!item) {
            return res.status(404).json({
                success: false,
                message: `${itemType} پیدا نشد!`
            });
        }

        if (item.images && item.images.includes(imageUrl)) {
            return res.status(400).json({
                success: false,
                message: `این تصویر قبلاً به این ${itemType} اضافه شده است!`
            });
        }

        await item.updateOne({
            $push: { images: imageUrl }
        });

        const updated = await (type === 'course' ? Course : Product).findById(id);

        res.status(200).json({
            success: true,
            message: `تصویر با موفقیت به ${itemType} اضافه شد!`,
            item: {
                id: updated._id,
                name: updated.name,
                images: updated.images || []
            }
        });
    } catch (error) {
        console.error('Error linking image:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در اتصال تصویر به آیتم',
            error: error.message
        });
    }
});

// ============================================
// Unlink image from course or product
// ============================================

router.post('/unlink-image', limiter, async (req, res) => {
    try {
        const { imageUrl, type, id } = req.body;

        if (!imageUrl || !type || !id) {
            return res.status(400).json({
                success: false,
                message: 'اطلاعات کامل نیست!'
            });
        }

        let item = null;
        let itemType = '';

        if (type === 'course') {
            item = await Course.findById(id);
            itemType = 'دوره';
        } else if (type === 'product') {
            item = await Product.findById(id);
            itemType = 'محصول';
        } else {
            return res.status(400).json({
                success: false,
                message: 'نوع نامعتبر است!'
            });
        }

        if (!item) {
            return res.status(404).json({
                success: false,
                message: `${itemType} پیدا نشد!`
            });
        }

        if (!item.images || !item.images.includes(imageUrl)) {
            return res.status(400).json({
                success: false,
                message: `این تصویر در این ${itemType} وجود ندارد!`
            });
        }

        if (item.images.length === 1) {
            return res.status(400).json({
                success: false,
                message: `این ${itemType} فقط یک عکس دارد! برای جلوگیری از خالی بودن، حداقل یک عکس باید وجود داشته باشد.`,
                isOnlyImage: true
            });
        }

        await item.updateOne({
            $pull: { images: imageUrl }
        });

        const updated = await (type === 'course' ? Course : Product).findById(id);

        res.status(200).json({
            success: true,
            message: `تصویر با موفقیت از ${itemType} حذف شد!`,
            item: {
                id: updated._id,
                name: updated.name,
                images: updated.images || []
            }
        });
    } catch (error) {
        console.error('Error unlinking image:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در حذف اتصال تصویر از آیتم',
            error: error.message
        });
    }
});

// ============================================
// Toggle like/unlike image
// ============================================

router.post('/toggle-like', limiter, async (req, res) => {
    try {
        const { imageKey, imageUrl } = req.body;
        
        if (!imageKey || !imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'اطلاعات کامل نیست!'
            });
        }
        
        let imageUpload = await ImageUpload.findOne({ images: imageUrl });
        
        if (!imageUpload) {
            imageUpload = new ImageUpload({
                images: [imageUrl],
                metadata: {}
            });
        }
        
        if (!imageUpload.metadata || typeof imageUpload.metadata !== 'object') {
            imageUpload.metadata = {};
        }
        
        if (!imageUpload.metadata[imageKey]) {
            imageUpload.metadata[imageKey] = {
                name: '',
                alt: '',
                liked: false,
                updatedAt: new Date()
            };
        }
        
        const currentLikeStatus = imageUpload.metadata[imageKey].liked || false;
        imageUpload.metadata[imageKey].liked = !currentLikeStatus;
        imageUpload.metadata[imageKey].updatedAt = new Date();
        
        imageUpload.markModified('metadata');
        await imageUpload.save();
        
        res.status(200).json({
            success: true,
            message: !currentLikeStatus ? 'تصویر لایک شد!' : 'لایک تصویر برداشته شد!',
            liked: !currentLikeStatus,
            imageKey: imageKey
        });
        
    } catch (error) {
        console.error('Error toggling like:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در تغییر وضعیت لایک',
            error: error.message
        });
    }
});

// ============================================
// Get liked images list
// ============================================

router.get('/liked', limiter, async (req, res) => {
    try {
        const imageUploads = await ImageUpload.find({});
        const likedImages = [];
        
        imageUploads.forEach(doc => {
            if (doc.metadata && typeof doc.metadata === 'object') {
                Object.keys(doc.metadata).forEach(key => {
                    if (doc.metadata[key].liked === true) {
                        likedImages.push({
                            imageKey: key,
                            imageUrl: doc.images && doc.images.length > 0 ? doc.images[0] : null,
                            metadata: doc.metadata[key]
                        });
                    }
                });
            }
        });
        
        res.status(200).json({
            success: true,
            likedImages: likedImages,
            count: likedImages.length
        });
        
    } catch (error) {
        console.error('Error fetching liked images:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در دریافت تصاویر لایک شده',
            error: error.message
        });
    }
});

// ============================================
// FORCE SYNC - همگام‌سازی اجباری متادیتا
// ============================================

router.post('/force-sync', limiter, async (req, res) => {
    try {
        const { imageKey, imageUrl, name, alt } = req.body;
        
        if (!imageKey || !imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'imageKey و imageUrl الزامی هستند!'
            });
        }
        
        let imageUpload = await ImageUpload.findOne({ images: imageUrl });
        
        if (!imageUpload) {
            imageUpload = new ImageUpload({
                images: [imageUrl],
                metadata: {}
            });
        }
        
        if (!imageUpload.metadata || typeof imageUpload.metadata !== 'object') {
            imageUpload.metadata = {};
        }
        
        imageUpload.metadata[imageKey] = {
            name: name || '',
            alt: alt || '',
            liked: imageUpload.metadata[imageKey]?.liked || false,
            updatedAt: new Date()
        };
        
        imageUpload.markModified('metadata');
        await imageUpload.save();
        
        // بررسی اینکه ذخیره شده
        const verify = await ImageUpload.findOne({ images: imageUrl });
        
        res.json({
            success: true,
            message: 'Metadata synced successfully!',
            saved: verify?.metadata?.[imageKey],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Force sync error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;