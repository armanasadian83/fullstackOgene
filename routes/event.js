const {Event} = require('./../models/event');

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
    const eventList = await Event.find();

    if(!eventList){
        res.status(500).json({success: false})
    }
    res.send(eventList);
})


// find by id
router.get("/:id", limiter, async (req, res) => {

    const eventItem = await Event.findById(req.params.id);

    if(!eventItem){
        res.status(500).json({messgae : 'The event with the given ID was not found.'})
    }

    return res.status(200).send(eventItem);
})


// create
router.post('/create', limiter, async (req, res) => {

    let event = new Event({
        name: req.body.name
    });

    if(!event) {
        res.status(500).json({
            error: err,
            success: false
        })
    }

    event = await event.save();

    res.status(201).json(event);

})


// delete
router.delete('/:id', limiter, async (req, res) => {

    const deletedEventItem = await Event.findByIdAndDelete(req.params.id); 

    if(!deletedEventItem) {
        res.status(404).json({
            message : 'event not found!', 
            success : false
        })
    }

    res.status(200).json({
        success : true,
        message : 'Event Deleted!' 
    })
})


// update
router.put('/:id', limiter, async (req, res) => {

    const eventItem = await Event.findByIdAndUpdate(
        req.params.id,
        {
            name: req.body.name
        },
        {new : true}
    )


    if(!eventItem){
        return res.status(500).json({
            message : 'event cannot be updated!',
            success : false
        })
    }

    res.send(eventItem);
})


module.exports = router; 