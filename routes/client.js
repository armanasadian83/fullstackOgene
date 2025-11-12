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

})


module.exports = router; 