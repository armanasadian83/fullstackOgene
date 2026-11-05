const { Client } = require('./../models/client');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

// Import SMS service (NOT email)
const smsService = require('../utils/smsService');

const limiter = rateLimit({
    windowMs: 1000,
    max: 15,
    message: "Too many requests. Slow down.",
});

// ============================================
// HELPER FUNCTIONS
// ============================================

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const isOTPValid = (storedOTP, storedExpiry, providedOTP) => {
    if (!storedOTP || !storedExpiry) return { valid: false, reason: 'no_otp' };
    if (storedOTP !== providedOTP) return { valid: false, reason: 'invalid_code' };
    if (storedExpiry < Date.now()) return { valid: false, reason: 'expired' };
    return { valid: true };
};

// ============================================
// SIGNUP - Register with SMS verification
// ============================================

router.post(`/signup`, limiter, async (req, res) => {
    const {
        name,
        lastName,
        phone,
        email,
        password,
        nationalCode,
        birthdate,
        englishName,
        englishLastName
    } = req.body;

    try {
        // Validate phone number (Iranian format)
        if (!phone || !/^09[0-9]{9}$/.test(phone)) {
            return res.json({
                error: true,
                msg: "شماره تلفن معتبر نیست! (مثال: 09123456789)"
            });
        }

        // Validate password
        if (!password || password.length < 7) {
            return res.json({
                error: true,
                msg: "رمز عبور حداقل باید ۷ کاراکتر باشد!"
            });
        }

        if (password.includes(" ")) {
            return res.json({
                error: true,
                msg: "فاصله در رمز عبور مجاز نیست!"
            });
        }

        const verifyCode = generateOTP();
        let client;

        // Check if user exists by phone (primary) or email (optional)
        const existingClient = await Client.findOne({
            $or: [
                { phone: phone },
                ...(email ? [{ email: email }] : [])
            ]
        });

        if (existingClient) {
            if (existingClient.isVerified === true) {
                const field = existingClient.phone === phone ? 'شماره تلفن' : 'ایمیل';
                return res.json({
                    error: true,
                    isVerify: false,
                    msg: `این ${field} قبلا ثبت شده است!`
                });
            } else {
                // User exists but not verified - update OTP
                existingClient.otp = verifyCode;
                existingClient.otpExpires = Date.now() + 600000;
                if (existingClient.phone !== phone) {
                    existingClient.phone = phone;
                }
                if (email && existingClient.email !== email) {
                    existingClient.email = email;
                }

                // Update new optional fields only if provided
                if (nationalCode !== undefined) existingClient.nationalCode = nationalCode || null;
                if (birthdate !== undefined) existingClient.birthdate = birthdate || null;
                if (englishName !== undefined) existingClient.englishName = englishName || null;
                if (englishLastName !== undefined) existingClient.englishLastName = englishLastName || null;

                await existingClient.save();
                client = existingClient;
            }
        } else {
            // Create new user
            const hashPassword = await bcrypt.hash(password, 10);
            client = new Client({
                name,
                lastName,
                phone,
                email: email || null,
                password: hashPassword,
                otp: verifyCode,
                otpExpires: Date.now() + 600000,
                nationalCode: nationalCode || null,
                birthdate: birthdate || null,
                englishName: englishName || null,
                englishLastName: englishLastName || null
            });
            await client.save();
        }

        // Send OTP via SMS
        const smsSent = await smsService.sendOTP(phone, verifyCode);

        if (!smsSent.success) {
            return res.json({
                error: true,
                msg: "مشکل در ارسال پیامک! لطفا دوباره تلاش کنید."
            });
        }

        // Create JWT token
        const token = jwt.sign(
            { phone: client.phone, id: client._id, email: client.email },
            process.env.JSON_WEB_TOKEN_SECRET_KEY
        );

        return res.json({
            success: true,
            message: "کد تایید به شماره تلفن شما ارسال شد! لطفا شماره خود را تایید کنید.",
            token: token,
            phone: phone
        });

    } catch (error) {
        console.log(error);
        res.json({ error: true, msg: "مشکلی برای ثبت نام وجود دارد!" });
    }
});

// ============================================
// VERIFY PHONE - Verify user's phone with OTP
// ============================================

router.post('/verify-phone', async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.json({
                success: false,
                message: 'شماره تلفن و کد را وارد کنید!'
            });
        }

        const client = await Client.findOne({ phone });

        if (!client) {
            return res.json({
                success: false,
                message: 'کاربر پیدا نشد!'
            });
        }

        const otpCheck = isOTPValid(client.otp, client.otpExpires, otp);

        if (otpCheck.valid) {
            client.isVerified = true;
            client.otp = null;
            client.otpExpires = null;
            await client.save();

            return res.json({
                success: true,
                message: "شماره تلفن با موفقیت تایید شد!"
            });
        } else {
            const messages = {
                'invalid_code': "کد وارد شده اشتباه است!",
                'expired': "کد منقضی شده است! لطفا دوباره درخواست کنید.",
                'no_otp': "کد تایید یافت نشد! لطفا دوباره ثبت نام کنید."
            };

            return res.json({
                success: false,
                message: messages[otpCheck.reason] || "کد نامعتبر است!"
            });
        }
    } catch (err) {
        console.log("Error in verifyPhone: ", err);
        res.json({
            success: false,
            message: "مشکلی در تایید شماره تلفن وجود دارد!"
        });
    }
});

// ============================================
// SIGNIN - Login with phone or email
// ============================================

router.post(`/signin`, limiter, async (req, res) => {
    const { email, password } = req.body;

    try {
        const verifyCode = generateOTP();

        // Find by phone OR email
        const existingClient = await Client.findOne({
            $or: [
                { phone: email },
                { email: email }
            ]
        });

        if (!existingClient) {
            return res.json({
                error: true,
                msg: "نام کاربری یا رمز عبور نادرست است!"
            });
        }

        const matchPassword = await bcrypt.compare(password, existingClient.password);

        if (!matchPassword) {
            return res.json({
                error: true,
                msg: "نام کاربری یا رمز عبور نادرست است!"
            });
        }

        // Check if user is verified
        if (existingClient.isVerified === false) {
            existingClient.otp = verifyCode;
            existingClient.otpExpires = Date.now() + 600000;
            await existingClient.save();

            const smsSent = await smsService.sendOTP(existingClient.phone, verifyCode);

            if (!smsSent.success) {
                return res.json({
                    error: true,
                    msg: "مشکل در ارسال پیامک! لطفا دوباره تلاش کنید."
                });
            }

            return res.json({
                error: true,
                verified: false,
                msg: "کد تایید به شماره تلفن شما ارسال شد!",
                phone: existingClient.phone
            });
        }

        const token = jwt.sign(
            {
                phone: existingClient.phone,
                id: existingClient._id,
                email: existingClient.email,
                name: existingClient.name,
                lastName: existingClient.lastName
            },
            process.env.JSON_WEB_TOKEN_SECRET_KEY
        );

        res.status(200).json({
            user: {
                id: existingClient._id,
                name: existingClient.name,
                lastName: existingClient.lastName,
                email: existingClient.email,
                phone: existingClient.phone,
                isVerified: existingClient.isVerified
            },
            token: token,
            msg: "با موفقیت وارد شدید!"
        });

    } catch (error) {
        console.log(error);
        res.json({ error: true, msg: "مشکلی برای ورود وجود دارد!" });
    }
});

// ============================================
// FORGOT PASSWORD - Send reset code via SMS
// ============================================

router.post('/forgot-password', limiter, async (req, res) => {
    try {
        const { email } = req.body; // Can be phone OR email

        if (!email) {
            return res.json({
                error: true,
                msg: "ایمیل یا شماره تلفن خود را وارد کنید!"
            });
        }

        // Find user by phone OR email
        const client = await Client.findOne({
            $or: [
                { phone: email },
                { email: email }
            ]
        });

        if (!client) {
            return res.json({
                error: true,
                msg: "کاربری با این اطلاعات یافت نشد!"
            });
        }

        if (!client.isVerified) {
            return res.json({
                error: true,
                msg: "شماره تلفن شما تایید نشده است! لطفا ابتدا شماره خود را تایید کنید."
            });
        }

        const resetCode = generateOTP();

        client.resetPasswordOTP = resetCode;
        client.resetPasswordOTPExpires = Date.now() + 600000;
        await client.save();

        // Send reset code via SMS
        const smsSent = await smsService.sendOTP(client.phone, resetCode);

        if (smsSent.success) {
            return res.status(200).json({
                success: true,
                message: "کد بازیابی به شماره تلفن شما ارسال شد!",
                phone: client.phone
            });
        } else {
            return res.json({
                error: true,
                msg: "مشکل در ارسال پیامک! لطفا دوباره تلاش کنید."
            });
        }

    } catch (error) {
        console.log('Error in forgot-password:', error);
        res.json({
            error: true,
            msg: "مشکلی در ارسال کد بازیابی وجود دارد!"
        });
    }
});

// ============================================
// VERIFY RESET OTP - Verify reset code via SMS
// ============================================

router.post('/verify-reset-otp', async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.json({
                success: false,
                message: "شماره تلفن و کد را وارد کنید!"
            });
        }

        const client = await Client.findOne({ phone });
        if (!client) {
            return res.json({
                success: false,
                message: "کاربر پیدا نشد!"
            });
        }

        const otpCheck = isOTPValid(
            client.resetPasswordOTP,
            client.resetPasswordOTPExpires,
            otp
        );

        if (otpCheck.valid) {
            return res.status(200).json({
                success: true,
                message: "کد تایید شد!",
                phone: phone
            });
        } else {
            const messages = {
                'invalid_code': "کد وارد شده اشتباه است!",
                'expired': "کد منقضی شده است! لطفا دوباره درخواست کنید.",
                'no_otp': "درخواست بازیابی رمز عبور ثبت نشده است!"
            };
            return res.json({
                success: false,
                message: messages[otpCheck.reason] || "کد نامعتبر است!"
            });
        }

    } catch (error) {
        console.log("Error in verify-reset-otp:", error);
        res.json({
            success: false,
            message: "مشکلی در تایید کد وجود دارد!"
        });
    }
});

// ============================================
// RESET PASSWORD - Set new password
// ============================================

router.post('/reset-password', async (req, res) => {
    try {
        const { phone, newPassword, confirmPassword } = req.body;

        if (!newPassword || !confirmPassword) {
            return res.json({
                error: true,
                msg: "لطفا رمز عبور جدید و تکرار آن را وارد کنید!"
            });
        }

        if (newPassword !== confirmPassword) {
            return res.json({
                error: true,
                msg: "رمز عبور ها باهم تطابق ندارند!"
            });
        }

        if (newPassword.length < 7) {
            return res.json({
                error: true,
                msg: "رمز عبور حداقل باید 7 حرف/عدد باشد!"
            });
        }

        if (newPassword.includes(" ")) {
            return res.json({
                error: true,
                msg: "فاصله در رمز عبور مجاز نیست!"
            });
        }

        const client = await Client.findOne({ phone });
        if (!client) {
            return res.json({
                error: true,
                msg: "کاربر پیدا نشد!"
            });
        }

        if (!client.resetPasswordOTP) {
            return res.json({
                error: true,
                msg: "درخواست بازیابی رمز عبور معتبر نیست!"
            });
        }

        if (client.resetPasswordOTPExpires < Date.now()) {
            return res.json({
                error: true,
                msg: "زمان درخواست بازیابی رمز عبور منقضی شده است! لطفا دوباره تلاش کنید."
            });
        }

        const hashPassword = await bcrypt.hash(newPassword, 10);

        client.password = hashPassword;
        client.resetPasswordOTP = null;
        client.resetPasswordOTPExpires = null;

        const d = new Date();
        client.dateEdited = new Intl.DateTimeFormat('fa-IR', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: 'Asia/Tehran'
        }).format(d);

        await client.save();

        return res.status(200).json({
            success: true,
            message: "رمز عبور با موفقیت تغییر یافت!"
        });

    } catch (error) {
        console.log("Error in reset-password:", error);
        res.json({
            error: true,
            msg: "مشکلی در تغییر رمز عبور وجود دارد!"
        });
    }
});

// ============================================
// CHANGE PASSWORD - Send OTP via SMS
// ============================================

router.post('/change-password-send-otp', limiter, async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.json({
                error: true,
                msg: "شماره تلفن خود را وارد کنید!"
            });
        }

        const client = await Client.findOne({ phone });
        if (!client) {
            return res.json({
                error: true,
                msg: "کاربر پیدا نشد!"
            });
        }

        const otp = generateOTP();

        client.resetPasswordOTP = otp;
        client.resetPasswordOTPExpires = Date.now() + 600000;
        await client.save();

        const smsSent = await smsService.sendOTP(client.phone, otp);

        if (smsSent.success) {
            return res.status(200).json({
                success: true,
                message: "کد تایید به شماره تلفن شما ارسال شد!",
                phone: phone
            });
        } else {
            return res.json({
                error: true,
                msg: "مشکل در ارسال پیامک! لطفا دوباره تلاش کنید."
            });
        }

    } catch (error) {
        console.log('Error in change-password-send-otp:', error);
        res.json({
            error: true,
            msg: "مشکلی در ارسال کد وجود دارد!"
        });
    }
});

// ============================================
// CHANGE PASSWORD - Verify OTP
// ============================================

router.post('/change-password-verify-otp', async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.json({
                success: false,
                message: "شماره تلفن و کد را وارد کنید!"
            });
        }

        const client = await Client.findOne({ phone });
        if (!client) {
            return res.json({
                success: false,
                message: "کاربر پیدا نشد!"
            });
        }

        const otpCheck = isOTPValid(
            client.resetPasswordOTP,
            client.resetPasswordOTPExpires,
            otp
        );

        if (otpCheck.valid) {
            return res.status(200).json({
                success: true,
                message: "کد تایید شد!",
                phone: phone
            });
        } else {
            const messages = {
                'invalid_code': "کد وارد شده اشتباه است!",
                'expired': "کد منقضی شده است! لطفا دوباره درخواست کنید.",
                'no_otp': "کد تایید یافت نشد!"
            };
            return res.json({
                success: false,
                message: messages[otpCheck.reason] || "کد نامعتبر است!"
            });
        }

    } catch (error) {
        console.log("Error in change-password-verify-otp:", error);
        res.json({
            success: false,
            message: "مشکلی در تایید کد وجود دارد!"
        });
    }
});

// ============================================
// CHANGE PASSWORD - Set new password
// ============================================

router.post('/change-password-final', async (req, res) => {
    try {
        const { phone, newPassword, confirmPassword } = req.body;

        if (!newPassword || !confirmPassword) {
            return res.json({
                error: true,
                msg: "لطفا رمز عبور جدید و تکرار آن را وارد کنید!"
            });
        }

        if (newPassword !== confirmPassword) {
            return res.json({
                error: true,
                msg: "رمز عبور ها باهم تطابق ندارند!"
            });
        }

        if (newPassword.length < 7) {
            return res.json({
                error: true,
                msg: "رمز عبور حداقل باید 7 حرف/عدد باشد!"
            });
        }

        if (newPassword.includes(" ")) {
            return res.json({
                error: true,
                msg: "فاصله در رمز عبور مجاز نیست!"
            });
        }

        const client = await Client.findOne({ phone });
        if (!client) {
            return res.json({
                error: true,
                msg: "کاربر پیدا نشد!"
            });
        }

        if (!client.resetPasswordOTP) {
            return res.json({
                error: true,
                msg: "کد تایید نشده است! لطفا ابتدا کد را تایید کنید."
            });
        }

        if (client.resetPasswordOTPExpires < Date.now()) {
            return res.json({
                error: true,
                msg: "زمان کد تایید منقضی شده است! لطفا دوباره تلاش کنید."
            });
        }

        const hashPassword = await bcrypt.hash(newPassword, 10);

        client.password = hashPassword;
        client.resetPasswordOTP = null;
        client.resetPasswordOTPExpires = null;

        const d = new Date();
        client.dateEdited = new Intl.DateTimeFormat('fa-IR', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: 'Asia/Tehran'
        }).format(d);

        await client.save();

        return res.status(200).json({
            success: true,
            message: "رمز عبور با موفقیت تغییر یافت!"
        });

    } catch (error) {
        console.log("Error in change-password-final:", error);
        res.json({
            error: true,
            msg: "مشکلی در تغییر رمز عبور وجود دارد!"
        });
    }
});

// ============================================
// GET / COUNT / DELETE / UPDATE (Existing routes)
// ============================================

const CLIENT_PROFILE_PROJECTION = '-password -otp -otpExpires -resetPasswordOTP -resetPasswordOTPExpires';

const sendClientProfileError = (res, status, code, message, field) => res.status(status).json({
    error: true,
    success: false,
    code,
    msg: message,
    message,
    ...(field ? { field } : {})
});

router.get('/', limiter, async (req, res) => {
    const clientList = await Client.find().select(CLIENT_PROFILE_PROJECTION);
    if (!clientList) {
        res.status(500).json({ success: false });
    }
    res.send(clientList);
});

router.get('/:id', limiter, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return sendClientProfileError(res, 400, 'INVALID_CLIENT_ID', 'شناسه حساب کاربری معتبر نیست.');
    }
    try {
        const client = await Client.findById(req.params.id).select(CLIENT_PROFILE_PROJECTION);
        if (!client) {
            return sendClientProfileError(res, 404, 'CLIENT_NOT_FOUND', 'حساب کاربری پیدا نشد. لطفاً دوباره وارد شوید.');
        }
        return res.status(200).send(client);
    } catch (error) {
        console.error('Error in GET /api/client/:id:', error.name);
        return sendClientProfileError(res, 500, 'CLIENT_READ_FAILED', 'دریافت اطلاعات حساب کاربری انجام نشد. دوباره تلاش کنید.');
    }
});

router.delete('/:id', limiter, (req, res) => {
    Client.findByIdAndDelete(req.params.id).then(client => {
        if (client) {
            return res.status(200).json({ success: true, message: 'the client is deleted!' });
        } else {
            return res.status(404).json({ success: false, message: "client not found!" });
        }
    }).catch(err => {
        return res.status(500).json({ success: false, error: err });
    });
});

router.get('/get/count', limiter, async (req, res) => {
    const clientCount = await Client.countDocuments((count) => count);
    if (!clientCount) {
        res.status(500).json({ success: false });
    }
    res.send({ clientCount: clientCount });
});

// ============================================
// UPDATE CLIENT — SAFE PARTIAL UPDATE
// ============================================
// ✅ Only updates fields that are actually sent.
// ✅ Never wipes `password` unless a new one is sent.
// ✅ Fixes the old `clientExist.passwordHash` typo.
// ✅ Works with both the account-page edit form and the CompleteInfo page.
// ============================================
router.put('/:id', limiter, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return sendClientProfileError(res, 400, 'INVALID_CLIENT_ID', 'شناسه حساب کاربری معتبر نیست.');
    }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return sendClientProfileError(res, 400, 'CLIENT_VALIDATION_FAILED', 'اطلاعات واردشده معتبر نیست.');
    }
    try {
        const {
            name,
            lastName,
            phone,
            email,
            password,
            nationalCode,
            birthdate,
            englishName,
            englishLastName
        } = req.body;

        const d = new Date();
        const time = new Intl.DateTimeFormat('fa-IR', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: 'Asia/Tehran'
        }).format(d);

        const clientExist = await Client.findById(req.params.id).select('_id');
        if (!clientExist) {
            return sendClientProfileError(res, 404, 'CLIENT_NOT_FOUND', 'حساب کاربری پیدا نشد. لطفاً دوباره وارد شوید.');
        }

        // Build update object — only include fields actually sent.
        const update = { dateEdited: time };

        if (name !== undefined) update.name = name;
        if (lastName !== undefined) update.lastName = lastName;
        if (phone !== undefined) update.phone = phone;
        if (email !== undefined) update.email = email || null;

        // Password: only re-hash if a new password is provided.
        // Otherwise, leave the existing hash untouched.
        if (password) {
            update.password = await bcrypt.hash(password, 10);
        }

        // New optional fields — only update when present.
        if (nationalCode !== undefined) update.nationalCode = nationalCode || null;
        if (birthdate !== undefined) update.birthdate = birthdate || null;
        if (englishName !== undefined) update.englishName = englishName || null;
        if (englishLastName !== undefined) update.englishLastName = englishLastName || null;

        const client = await Client.findByIdAndUpdate(
            req.params.id,
            { $set: update },
            { new: true, runValidators: true }
        ).select(CLIENT_PROFILE_PROJECTION);

        if (!client) {
            return sendClientProfileError(res, 404, 'CLIENT_NOT_FOUND', 'حساب کاربری پیدا نشد. لطفاً دوباره وارد شوید.');
        }

        return res.send(client);
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern || error.keyValue || {})
                .find((key) => ['email', 'phone', 'nationalCode'].includes(key));
            const messages = {
                email: 'این ایمیل قبلاً ثبت شده است.',
                phone: 'این شماره تلفن قبلاً ثبت شده است.',
                nationalCode: 'این کد ملی قبلاً ثبت شده است.'
            };
            return sendClientProfileError(res, 409, 'DUPLICATE_FIELD', messages[field] || 'این اطلاعات قبلاً ثبت شده است.', field);
        }
        if (error.name === 'ValidationError' || error.name === 'CastError') {
            return sendClientProfileError(res, 400, 'CLIENT_VALIDATION_FAILED', 'اطلاعات واردشده معتبر نیست.');
        }
        console.error('Error in PUT /api/client/:id:', error.name);
        return sendClientProfileError(res, 500, 'CLIENT_UPDATE_FAILED', 'مشکلی در بروزرسانی اطلاعات کاربر وجود دارد!');
    }
});

// ============================================
// FORCE RE-VERIFY - Admin only
// Resets user verification status and clears all OTP fields
// ============================================
router.put('/force-reverify/:id', async (req, res) => {
    try {
        const client = await Client.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    isVerified: false,
                    otp: null,
                    otpExpires: null,
                    resetPasswordOTP: null,
                    resetPasswordOTPExpires: null
                }
            },
            { new: true }
        );

        if (!client) {
            return res.status(404).json({
                error: true,
                msg: 'کاربر پیدا نشد!'
            });
        }

        res.json({
            success: true,
            message: 'وضعیت کاربر با موفقیت به‌روزرسانی شد! کاربر در ورود بعدی مجبور به تایید شماره تلفن خواهد شد.',
            user: {
                id: client._id,
                name: client.name,
                lastName: client.lastName,
                phone: client.phone,
                email: client.email,
                isVerified: client.isVerified,
                otp: client.otp,
                otpExpires: client.otpExpires,
                resetPasswordOTP: client.resetPasswordOTP,
                resetPasswordOTPExpires: client.resetPasswordOTPExpires
            }
        });
    } catch (error) {
        console.error('Error in force-reverify:', error);
        res.status(500).json({
            error: true,
            msg: 'خطا در بروزرسانی وضعیت کاربر! لطفاً دوباره تلاش کنید.'
        });
    }
});

// ============================================
// VERIFY PHONE - Admin manually verifies user's phone
// ============================================
router.put('/verify-phone/:id', async (req, res) => {
    try {
        const client = await Client.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    isVerified: true,
                    otp: null,
                    otpExpires: null,
                    resetPasswordOTP: null,
                    resetPasswordOTPExpires: null
                }
            },
            { new: true }
        );

        if (!client) {
            return res.status(404).json({
                error: true,
                msg: 'کاربر پیدا نشد!'
            });
        }

        res.json({
            success: true,
            message: 'شماره تلفن کاربر با موفقیت تایید شد!',
            user: {
                id: client._id,
                name: client.name,
                lastName: client.lastName,
                phone: client.phone,
                isVerified: client.isVerified
            }
        });
    } catch (error) {
        console.error('Error in verify-phone:', error);
        res.status(500).json({
            error: true,
            msg: 'خطا در تایید شماره تلفن کاربر!'
        });
    }
});

module.exports = router;
