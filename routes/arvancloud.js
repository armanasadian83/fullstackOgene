const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const multer = require("multer");

// تنظیمات ArvanCloud
const s3 = new S3Client({
  endpoint: process.env.ARVAN_ENDPOINT,
  region: process.env.ARVAN_REGION,
  credentials: {
    accessKeyId: process.env.ARVAN_ACCESS_KEY,
    secretAccessKey: process.env.ARVAN_SECRET_KEY,
  },
  forcePathStyle: true,
});

// تنظیمات multer برای ذخیره در حافظه (memory storage)
const storage = multer.memoryStorage();

// فیلتر کردن نوع فایل‌ها
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("فرمت فایل معتبر نیست. فقط JPEG، PNG و WEBP مجاز هستند."), false);
  }
};

// ساخت upload middleware
const upload = multer({
  storage: storage,
  limits: {
        fileSize: 20 * 1024 * 1024, // 20 MB
    },
  fileFilter: fileFilter,
});

// تابع آپلود مستقیم به ArvanCloud
const uploadToArvan = async (file, folder = "products") => {
  // ساخت نام یکتا برای فایل
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const key = `${folder}/${uniqueSuffix}_${file.originalname}`;
  
  // آماده سازی دستور آپلود
  const command = new PutObjectCommand({
    Bucket: process.env.ARVAN_BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: "public-read",
  });
  
  // اجرای آپلود
  await s3.send(command);
  
  // ساخت URL عمومی
  const url = `${process.env.ARVAN_ENDPOINT}/${process.env.ARVAN_BUCKET_NAME}/${key}`;
  
  return { url, key };
};

module.exports = { upload, uploadToArvan, s3 };