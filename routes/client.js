const {Client} = require('./../models/client');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 1000,        // 1 second
    max: 15,                // allow 15 requests per second
    message: "Too many requests. Slow down.",
});

// otp
const {sendEmail} = require('../utils/emailService'); 


router.post(`/signup`, limiter, async (req, res) => {

    const {name, lastName, phone, email, password} = req.body;

    try {

        // Generate verification code
        const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
        let client;

        // If the user exists but is not verified, update the existing user
        
        const existingClient = await Client.findOne({email: email});
        //const existingClientByPh = await Client.findOne({phone: phone});

        /*if(existingClient){
            return res.json({ error: true, msg : "با این ایمیل قبلا حساب کاربری ساخته شده است!"});
        }*/

        if(existingClient){

            if(existingClient.isVerified === true){
                res.json({ error: true, isVerify: false, msg : "با این ایمیل قبلا حساب کاربری ساخته شده است!"});
            }else{
                //const hashPassword = await bcrypt.hash(password, 10);
                //existingClient.password = hashPassword;
                existingClient.otp = verifyCode;
                existingClient.otpExpires = Date.now() + 600000; // 10 minutes
                await existingClient.save();
                client = existingClient;
            }
        } else {
            // create a new user
            const hashPassword = await bcrypt.hash(password, 10);

            client = new Client({
                name,
                lastName,
                email,
                phone,
                password: hashPassword,
                otp: verifyCode,
                otpExpires: Date.now() + 600000, // 10 minutes
            });

            await client.save();
        }

        // send verification email
        const resp = sendEmailFun(email, "کد تایید", "", "کد ورود شما : " + verifyCode);

        // create a JWT token for verification purposes
        const token = jwt.sign(
            {email: client.email, id: client._id},
            process.env.JSON_WEB_TOKEN_SECRET_KEY
        ); 

        // send success response
        return res/*.status(200)*/.json({
            success: true,
            message: "کاربر با موفقیت ثبت نام شده است! لطفا ایمیل خود را تایید کنید.",
            token: token // optional : include this if needed for verification
        })

        /*
        const hashPassword = await bcrypt.hash(password, 10);
        

        const result = await Client.create({
            name: name,
            lastName: lastName,
            phone: phone,
            email: email,
            password: hashPassword
        });

        const token = jwt.sign({email: result.email, id: result._id}, process.env.JSON_WEB_TOKEN_SECRET_KEY);

        res.status(200).json({
            client: result,
            token: token
        })*/

    } catch (error) {
        console.log(error);
        res/*.status(500)*/.json({ error: true, msg: "مشکلی برای ورود وجود دارد!"});
    }

});


const sendEmailFun = async(to, subject, text, html) => {
    const result = await sendEmail(to, subject, text, html);
    if(result.success) {
        return true;
    }
    else{
        return false;
    }
}


router.post('/verifyemail', async (req, res) => {
    try{
        const {email, otp} = req.body;

        const client = await Client.findOne({email});

        if(!client){
            return res/*.status(400)*/.json({success: false, message: 'کاربر پیدا نشد!'})
        }

        const isCodeValid = client.otp === otp;
        const isNotExpired = client.otpExpires > Date.now();

        if(isCodeValid && isNotExpired){
            client.isVerified = true;
            client.otp = null;
            client.otpExpires = null;
            await client.save();
            return res/*.status(200)*/.json({success: true, message: "ایمیل با  موفقیت تایید شد!"});
        }else if(!isCodeValid){
            return res/*.status(400)*/.json({success: false, message: " کد ورود اشتباه است!"});
        }else{
            return res/*.status(400)*/.json({success: false, message: "رمز ورود منقضی شده است!"});
        }
    }catch (err) {
        console.log("Error in verifyEmail ", err);
        res/*.status(500)*/.json({success: false, message: "مشکلی در تایید ایمیل وجود دارد!"});
    }
});





router.post(`/signin`, limiter, async (req, res) => {
    const {email, password} = req.body;

    try {

        // Generate verification code
        const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        const existingClient = await Client.findOne({email : email});
        
        if(!existingClient){
            return res.json({ error: true, msg : "نام کاربری یا رمز عبور نادرست است!"})
        }

        const matchPassword = await bcrypt.compare(password, existingClient.password);

        if(!matchPassword){
            return res.json({ error: true, msg : "نام کاربری یا رمز عبور نادرست است!"});
        }

        if(existingClient.isVerified === false){

            existingClient.otp = verifyCode;
            existingClient.otpExpires = Date.now() + 600000; // 10 minutes
            await existingClient.save();
            
            const resp = sendEmailFun(email, "کد تایید", "", "کد ورود شما : " + verifyCode);
            return res.json({ error: true, verified: false, msg : "کد تایید برای شما ارسال شد!"})
        }

        const token = jwt.sign({email: existingClient, id: existingClient._id}, process.env.JSON_WEB_TOKEN_SECRET_KEY);

        res.status(200).json({
            user: existingClient,
            token: token,
            msg: "با موفقیت وارد شدید!"
        }) 

    } catch (error) {
        
        console.log(error);
        res.json({ error: true, msg : "مشکلی برای ورود وجود دارد!"});

    }
});


router.get('/', limiter, async (req, res) => {
    const clientList = await Client.find();

    if(!clientList){
        res.status(500).json({success: false})
    }

    res.send(clientList);
});


router.get('/:id', limiter, async (req, res) => {
    const client = await Client.findById(req.params.id);

    if(!client){
        res.status(500).json({message: 'The client with the given ID was not found'})
    }

    res.status(200).send(client);
});


router.delete('/:id', limiter, (req, res) => {
    Client.findByIdAndDelete(req.params.id).then(client => {
        if(client){
            return res.status(200).json({success: true, message: 'the client is deleted!'})
        }
        else{
            return res.status(404).json({success: false, message: "client not found!"})
        }
    }).catch(err => {
        return res.status(500).json({success: false, error: err})
    }) 
});


router.get('/get/count', limiter, async (req, res) => {
    const clientCount = await Client.countDocuments((count) => count)

    if(!clientCount){
        res.status(500).json({success: false})
    }

    res.send({
        clientCount: clientCount
    })
});


router.put('/:id', limiter, async (req, res) => {
    
    const {name, lastName, phone, email, password} = req.body;

    const d = new Date()
    const time = new Intl.DateTimeFormat('fa-IR', {dateStyle: 'short',timeStyle: 'short', timeZone: 'Asia/Tehran'}).format(d)

    const clientExist = await Client.findById(req.params.id);
    let newPassword
    if(req.body.password){
        newPassword = bcrypt.hashSync(req.body.password, 10) 
    }
    else{
        newPassword = clientExist.passwordHash;
    }

    const client = await Client.findByIdAndUpdate(
        req.params.id,
        {
            name: name,
            lastName: lastName,
            phone: phone,
            email: email,
            password: newPassword,
            dateEdited: time
        },
        {new: true}
    )

    if(!client){
        return res.status(400).send('the client cannot be updated!')
    }

    res.send(client);

});


// 1. FORGOT PASSWORD - Send Reset Code to Email
router.post('/forgot-password', limiter, async (req, res) => {
    try {
        const { email } = req.body;

        // Validate email
        if (!email) {
            return res.json({ 
                error: true, 
                msg: "ایمیل خود را وارد کنید!" 
            });
        }

        // Check if user exists
        const client = await Client.findOne({ email });
        if (!client) {
            return res.json({ 
                error: true, 
                msg: "کاربری با این ایمیل یافت نشد!" 
            });
        }

        // Check if user is verified
        if (!client.isVerified) {
            return res.json({ 
                error: true, 
                msg: "ایمیل شما تایید نشده است! لطفا ابتدا ایمیل خود را تایید کنید." 
            });
        }

        // Generate 6-digit reset code
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save reset code to user
        client.resetPasswordOTP = resetCode;
        client.resetPasswordOTPExpires = Date.now() + 600000; // 10 minutes
        await client.save();

        // Send reset code via email
        const emailSent = await sendEmailFun(
            email, 
            "بازیابی رمز عبور", 
            "", 
            `کد بازیابی رمز عبور شما: ${resetCode}`
        );

        if (emailSent) {
            return res.status(200).json({
                success: true,
                message: "کد بازیابی به ایمیل شما ارسال شد!",
                email: email // Send email back for OTP verification
            });
        } else {
            return res.json({
                error: true,
                msg: "مشکل در ارسال ایمیل! لطفا دوباره تلاش کنید."
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

// 2. VERIFY RESET OTP - Verify the Reset Code
router.post('/verify-reset-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        // Validate input
        if (!email || !otp) {
            return res.json({
                success: false,
                message: "ایمیل و کد را وارد کنید!"
            });
        }

        // Find user
        const client = await Client.findOne({ email });
        if (!client) {
            return res.json({
                success: false,
                message: "کاربر پیدا نشد!"
            });
        }

        // Check if reset code exists
        if (!client.resetPasswordOTP) {
            return res.json({
                success: false,
                message: "درخواست بازیابی رمز عبور ثبت نشده است!"
            });
        }

        // Verify code and expiry
        const isCodeValid = client.resetPasswordOTP === otp;
        const isNotExpired = client.resetPasswordOTPExpires > Date.now();

        if (isCodeValid && isNotExpired) {
            // Code is valid - allow password reset
            return res.status(200).json({
                success: true,
                message: "کد تایید شد!",
                email: email
            });
        } else if (!isCodeValid) {
            return res.json({
                success: false,
                message: "کد وارد شده اشتباه است!"
            });
        } else {
            return res.json({
                success: false,
                message: "کد منقضی شده است! لطفا دوباره درخواست کنید."
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

// 3. RESET PASSWORD - Set New Password
router.post('/reset-password', async (req, res) => {
    try {
        const { email, newPassword, confirmPassword } = req.body;

        // Validate passwords
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

        // Find user
        const client = await Client.findOne({ email });
        if (!client) {
            return res.json({
                error: true,
                msg: "کاربر پیدا نشد!"
            });
        }

        // 🔒 CRITICAL SECURITY CHECK - Add this!
        // Check if user has a valid reset OTP
        if (!client.resetPasswordOTP) {
            return res.json({
                error: true,
                msg: "درخواست بازیابی رمز عبور معتبر نیست!"
            });
        }

        // Check if OTP is expired
        if (client.resetPasswordOTPExpires < Date.now()) {
            return res.json({
                error: true,
                msg: "زمان درخواست بازیابی رمز عبور منقضی شده است! لطفا دوباره تلاش کنید."
            });
        }

        // Hash new password
        const hashPassword = await bcrypt.hash(newPassword, 10);
        
        // Update password and clear reset fields
        client.password = hashPassword;
        client.resetPasswordOTP = null;
        client.resetPasswordOTPExpires = null;
        
        // Update edit date
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

// CHANGE PASSWORD - Send OTP to logged-in user's email
router.post('/change-password-send-otp', limiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.json({
                error: true,
                msg: "ایمیل خود را وارد کنید!"
            });
        }

        // Find user
        const client = await Client.findOne({ email });
        if (!client) {
            return res.json({
                error: true,
                msg: "کاربر پیدا نشد!"
            });
        }

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save OTP (using existing resetPasswordOTP fields or create new ones)
        client.resetPasswordOTP = otp;
        client.resetPasswordOTPExpires = Date.now() + 600000; // 10 minutes
        await client.save();

        // Send email with OTP
        const emailSent = await sendEmailFun(
            email,
            "تغییر رمز عبور",
            "",
            `کد تایید برای تغییر رمز عبور: ${otp}`
        );

        if (emailSent) {
            return res.status(200).json({
                success: true,
                message: "کد تایید به ایمیل شما ارسال شد!",
                email: email
            });
        } else {
            return res.json({
                error: true,
                msg: "مشکل در ارسال ایمیل! لطفا دوباره تلاش کنید."
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

// CHANGE PASSWORD - Verify OTP
router.post('/change-password-verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.json({
                success: false,
                message: "ایمیل و کد را وارد کنید!"
            });
        }

        const client = await Client.findOne({ email });
        if (!client) {
            return res.json({
                success: false,
                message: "کاربر پیدا نشد!"
            });
        }

        // Verify code and expiry
        const isCodeValid = client.resetPasswordOTP === otp;
        const isNotExpired = client.resetPasswordOTPExpires > Date.now();

        if (isCodeValid && isNotExpired) {
            return res.status(200).json({
                success: true,
                message: "کد تایید شد!",
                email: email
            });
        } else if (!isCodeValid) {
            return res.json({
                success: false,
                message: "کد وارد شده اشتباه است!"
            });
        } else {
            return res.json({
                success: false,
                message: "کد منقضی شده است! لطفا دوباره درخواست کنید."
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

// CHANGE PASSWORD - Set New Password (After OTP Verification)
router.post('/change-password-final', async (req, res) => {
    try {
        const { email, newPassword, confirmPassword } = req.body;

        // Validate passwords
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

        const client = await Client.findOne({ email });
        if (!client) {
            return res.json({
                error: true,
                msg: "کاربر پیدا نشد!"
            });
        }

        // Check if OTP is verified (must exist and not expired)
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

        // Hash new password
        const hashPassword = await bcrypt.hash(newPassword, 10);
        
        // Update password and clear reset fields
        client.password = hashPassword;
        client.resetPasswordOTP = null;
        client.resetPasswordOTPExpires = null;
        
        // Update edit date
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


module.exports = router; 