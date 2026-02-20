const {Cart} = require('../models/cart');
const express = require('express');
const router = express.Router();

const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 1000,        // 1 second
    max: 15,                // allow 15 requests per second
    message: "Too many requests. Slow down.",
});



router.get('/', limiter, async (req, res) => {

    const forwarded = req.headers['x-forwarded-for'];
    const realIP = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;

    console.log("Client IP:", realIP);
    console.log("User Agent:", req.headers['user-agent']);
    console.log("Full URL:", req.url);

    return res.status(400).end(); // temporary
});

/*const cloudinary = require('cloudinary').v2;
const pLimit = require('p-limit');*/

// get full list
//router.get('/', limiter, async (req, res) => {

    /*const {...filterParams } = req.query;

    try {

        const cartList = await Cart.find(req.query)

        if(!cartList){
            res.status(500).json({success: false})
        }

        //res.send(categoryList);
        return res.status(200).json(cartList);
    } catch (error) {
        res.status(500).json({success : false})
    }*/

    /*try{
        if(req.query.userId !== undefined){
            const cartList = await Cart.find({userId: req.query.userId});

            if(!cartList){
                res.status(500).json({success: false})
            }

            return res.status(200).json(cartList);
        }
    } catch (error) {
        res.status(500).json({success : false})
    }
    
});*/


/* find by id
router.get("/:id", async (req, res) => {

    categoryEditId = req.params.id; 

    const category = await Category.findById(req.params.id);

    if(!category){
        res.status(500).json({messgae : 'The category with the given ID was not found.'})
    }

    return res.status(200).send(category);
})*/

// delete
router.delete('/:id',limiter, async (req, res) => {

    const cartItem = await Cart.findById(req.params.id);

    if(!cartItem){
        res.status(404).json({msg: "The cart item with the given Id is not found!"});
    }

    const deletedItem = await Cart.findByIdAndDelete(req.params.id); 

    if(!deletedItem) {
        res.status(404).json({
            message : 'Cart item not found!', 
            success : false
        })
    }

    res.status(200).json({
        success : true,
        message : 'Cart item Deleted!' 
    })
});


// create
router.post('/add',limiter, async (req, res) => {

    const cartItem = await Cart.find({productId: req.body.productId, userId: req.body.userId});

    if(cartItem.length === 0){
        let cartList = new Cart({
            productTitle: req.body.productTitle,
            image: req.body.image,
            price: req.body.price,
            quantity: req.body.quantity,
            subTotal: req.body.subTotal,
            productId: req.body.productId,
            userId: req.body.userId,
            typeCourse: req.body.typeCourse
        });

        if(!cartList) {
            res.status(500).json({
                error: err,
                success: false
            })
        }

        cartList = await cartList.save();

        res.status(201).json(cartList);
    }else{
        res.json({status: false, msg : "Product is already in the cart!"})
    }
})


// update
router.put('/:id',limiter, async (req, res) => {

    const cartList = await Cart.findByIdAndUpdate(
        req.params.id,
        {
            productTitle: req.body.productTitle,
            image: req.body.images,
            price: req.body.price,
            quantity: req.body.quantity,
            subTotal: req.body.subTotal,
            productId: req.body.productId,
            userId: req.body.userId,
            typeCourse: req.body.typeCourse
        },
        {new : true}
    )


    if(!cartList){
        return res.status(500).json({
            message : 'Cart item cannot be updated!',
            success : false
        })
    }

    res.send(cartList);

});




module.exports = router;