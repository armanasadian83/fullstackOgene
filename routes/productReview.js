const {ProductReviews} = require('./../models/productReview');
const express = require('express');
const router = express.Router();

const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 1000,        // 1 second
    max: 15,                // allow 15 requests per second
    message: "Too many requests. Slow down.",
});



router.get(`/`, limiter, async (req, res) => {

    let reviews = [];

    try {
        if(req.query.productId !== undefined && req.query.productId !== null && req.query.productId !== ''){
            reviews = await ProductReviews.find({productId: req.query.productId});
            /*
            if(req.query.userId !== undefined && req.query.userId !== null && req.query.userId !== ''){
                reviews = await ProductReviews.find({customerId : req.query.userId, productId: req.query.productId});

                if(reviews.length > 0){
                    return res.json({msg: 'you have commented once'});
                }
                else{
                    reviews = await ProductReviews.find({productId: req.query.productId}); 
                }*/
        }
        else{
            reviews = await ProductReviews.find();
        }

        if(!reviews){
            res.status(500).json({success : false});
        }

        return res.status(200).json(reviews);

    } catch (error) {
        
        res.status(500).json({success: false});

    }
});


router.get('/:id', limiter, async (req, res) => {
    
    const review = await ProductReviews.findById(req.params.id);

    if(!review) {
        res.status(500).json({message: 'The review with the given ID was not found!'});
    }

    return res.status(200).send(review);

});


router.post('/add', limiter, async (req, res) => {

    const checkedReview = await ProductReviews.find({customerId: req.body.customerId, productId: req.body.productId});

    if(checkedReview.length > 0){
        return res.json({status: false, msg : "برای این محصول/دوره قبلا دیدگاه ثبت کرده اید!"})
    }

    let review = new ProductReviews({
        customerId: req.body.customerId,
        customerName: req.body.customerName, 
        review: req.body.review,
        customerRating: req.body.customerRating,
        productId: req.body.productId
    });

    if(!review){
        res.status(500).json({error: err, success: false});
    }

    review = await review.save();

    res.status(201).json(review);

});


router.delete('/:id', limiter, async (req, res) => {

    const review = await ProductReviews.findById(req.params.id);

    if(!review){
        res.status(404).json({msg: "The review with the given Id is not found!"});
    }

    const deletedItem = await ProductReviews.findByIdAndDelete(req.params.id); 

    if(!deletedItem) {
        res.status(404).json({
            message : 'review not found!', 
            success : false
        })
    }

    res.status(200).json({
        success : true,
        message : 'review Deleted!' 
    })
});

module.exports = router;