const {Service} = require('./../models/service');

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

    let serviceList = [];
        
    if(req.query.filterKey !== undefined){
        serviceList = await Service.find({field: req.query.filterKey});
    }
    else{
        serviceList = await Service.find();
    } 

    if(!serviceList){
        res.status(500).json({success: false})
    }
    res.send(serviceList);
})

// find by id
router.get("/:id", limiter, async (req, res) => {

    const serviceItem = await Service.findById(req.params.id);

    if(!serviceItem){
        res.status(500).json({messgae : 'The service with the given ID was not found.'})
    }

    return res.status(200).send(serviceItem);
})


// create
router.post('/add', limiter, async (req, res) => {

    let service = new Service({
        name: req.body.name,
        field: req.body.field
    });

    if(!service) {
        res.status(500).json({
            error: err,
            success: false
        })
    }

    service = await service.save();

    res.status(201).json(service);

})


// delete
router.delete('/:id', limiter, async (req, res) => {

    const deletedServiceItem = await Service.findByIdAndDelete(req.params.id); 

    if(!deletedServiceItem) {
        res.status(404).json({
            message : 'service not found!', 
            success : false
        })
    }

    res.status(200).json({
        success : true,
        message : 'service Deleted!' 
    })
})



// update
router.put('/:id', limiter, async (req, res) => {

    const serviceItem = await Service.findByIdAndUpdate(
        req.params.id,
        {
            name: req.body.name,
            field: req.body.field,
        },
        {new : true}
    )


    if(!serviceItem){
        return res.status(500).json({
            message : 'service cannot be updated!',
            success : false
        })
    }

    res.send(serviceItem);
})


module.exports = router; 