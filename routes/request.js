const {Request} = require('./../models/request');

const express = require('express');
const router = express.Router();

const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 1000,        // 1 second
    max: 15,                // allow 15 requests per second
    message: "Too many requests. Slow down.",
});



// get
router.get('/', limiter, async (req, res) => {
    const requestList = await Request.find();

    if(!requestList){
        res.status(500).json({success: false})
    }
    res.send(requestList);
})


// find by id
router.get("/:id", async (req, res) => {

    const requestItem = await Request.findById(req.params.id);

    if(!requestItem){
        res.status(500).json({messgae : 'The request with the given ID was not found.'})
    }

    return res.status(200).send(requestItem);
})


// create
router.post('/create', limiter, async (req, res) => {

    let request = new Request({
        reqName: req.body.reqName,
        name: req.body.name,
        phone: req.body.phone,
        userId: req.body.userId
    });

    if(!request) {
        res.status(500).json({
            error: err,
            success: false
        })
    }

    request = await request.save();

    res.status(201).json(request);

})


// delete
router.delete('/:id', limiter, async (req, res) => {

    const deletedRequestItem = await Request.findByIdAndDelete(req.params.id); 

    if(!deletedRequestItem) {
        res.status(404).json({
            message : 'request not found!', 
            success : false
        })
    }

    res.status(200).json({
        success : true,
        message : 'request Deleted!' 
    })
})


// update
router.put('/:id', limiter, async (req, res) => {

    const requestItem = await Request.findByIdAndUpdate(
        req.params.id,
        {
            reqName: req.body.reqName,
            name: req.body.name,
            phone: req.body.phone,
            userId: req.body.userId
        },
        {new : true}
    )


    if(!requestItem){
        return res.status(500).json({
            message : 'request cannot be updated!',
            success : false
        })
    }

    res.send(requestItem);
})


module.exports = router; 