const {User} = require('./../models/user');
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



router.post(`/signup`, limiter, async (req, res) => { 

    const {name, phone, email, password, isAdmin} = req.body;

    try {
        
        const existingUser = await User.findOne({email: email});
        const existingUserByPh = await User.findOne({phone: phone});

        if(existingUser || existingUserByPh){
            return res.json({ error: true, msg : "با این ایمیل یا شماره تلفن قبلا اکانت ساخته شده است!"});
        }

        const hashPassword = await bcrypt.hash(password, 10);
        console.log(isAdmin);

        const result = await User.create({
            name: name,
            phone: phone,
            email: email,
            password: hashPassword,
            isAdmin: isAdmin
        });

        const token = jwt.sign({email: result.email, id: result._id}, process.env.JSON_WEB_TOKEN_SECRET_KEY);

        res.status(200).json({
            user: result,
            token: token
        })

    } catch (error) {
        console.log(error);
        res.status(500).json({ error: true, msg: "مشکلی برای ورود وجود دارد!"});
    }

});

router.post(`/signin`, limiter, async (req, res) => {
    const {email, password} = req.body;

    try {
        
        const existingUser = await User.findOne({email : email});
        
        if(!existingUser){
            return res.json({ error: true, msg : "نام کاربری یا رمز عبور نادرست است!"})
        }

        const matchPassword = await bcrypt.compare(password, existingUser.password);

        if(!matchPassword){
            return res.json({ error: true, msg : "نام کاربری یا رمز عبور نادرست است!"});
        }

        const token = jwt.sign({email: existingUser, id: existingUser._id}, process.env.JSON_WEB_TOKEN_SECRET_KEY);

        res.status(200).json({
            user: existingUser,
            token: token,
            msg: "با موفقیت وارد شدید!"
        }) 

    } catch (error) {
        
        console.log(error);
        res.json({ error: true, msg : "مشکلی برای ورود وجود دارد!"});

    }
});


router.get('/', limiter, async (req, res) => {
    const userList = await User.find();

    if(!userList){
        res.status(500).json({success: false})
    }

    res.send(userList);
});


router.get('/:id', async (req, res) => {
    const user = await User.findById(req.params.id);

    if(!user){
        res.status(500).json({message: 'The user with the given ID was not found'})
    }

    res.status(200).send(user);
});


router.delete('/:id', limiter, (req, res) => {
    User.findByIdAndDelete(req.params.id).then(user => {
        if(user){
            return res.status(200).json({success: true, message: 'the user is deleted!'})
        }
        else{
            return res.status(404).json({success: false, message: "user not found!"})
        }
    }).catch(err => {
        return res.status(500).json({success: false, error: err})
    }) 
});


router.get('/get/count', limiter, async (req, res) => {
    const userCount = await User.countDocuments((count) => count)

    if(!userCount){
        res.status(500).json({success: false})
    }

    res.send({
        userCount: userCount
    })
});


router.put('/:id', limiter, async (req, res) => {

    const {name, phone, email, password} = req.body;

    const d = new Date()
    const time = new Intl.DateTimeFormat('fa-IR', {dateStyle: 'short',timeStyle: 'short', timeZone: 'Asia/Tehran'}).format(d)

    if(req.params.id === '690a6b9d37e779a0abd74979'){
        return res.json({status: false, msg: 'دسترسی لازم برای ویرایش این ادمین را ندارید!'});
    }

    const userExist = await User.findById(req.params.id);

    let newPassword
    if(req.body.password){
        newPassword = bcrypt.hashSync(req.body.password, 10)
    }
    else{
        newPassword = userExist.passwordHash;
    }

    const user = await User.findByIdAndUpdate(
        req.params.id,
        {
            name: name,
            phone: phone,
            email: email,
            password: newPassword,
            dateEdited: time
        },
        {new: true}
    )

    if(!user){
        return res.status(400).send('the user cannot be updated!')
    }

    res.send(user);

})


module.exports = router; 