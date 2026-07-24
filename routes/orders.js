const Order = require('./../models/order');
const express = require('express');
const router = express.Router();

const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 1000,
    max: 15,
    message: "Too many requests. Slow down.",
});

// Get all orders for a user
router.get('/', limiter, async (req, res) => {
    try {
        const { userId } = req.query;
        let query = {};
        
        if (userId) {
            query.clientId = userId;
        }
        
        const orders = await Order.find(query)
            .sort({ dateCreated: -1 })
            .limit(100);
        
        res.json(orders);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Get all orders (admin view - no auth required)
router.get('/all', limiter, async (req, res) => {
    try {
        const orders = await Order.find()
            .sort({ dateCreated: -1 })
            .limit(200);
        
        res.json({
            success: true,
            count: orders.length,
            orders
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Get order statistics
router.get('/stats', limiter, async (req, res) => {
    try {
        const totalOrders = await Order.countDocuments();
        
        const totalRevenue = await Order.aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: '$totalPrice' }
                }
            }
        ]);

        const totalItems = await Order.aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: '$totalItems' }
                }
            }
        ]);

        const byStatus = await Order.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalRevenue: { $sum: '$totalPrice' },
                    totalItems: { $sum: '$totalItems' }
                }
            }
        ]);

        res.json({
            success: true,
            stats: {
                totalOrders,
                totalRevenue: totalRevenue[0]?.total || 0,
                totalItems: totalItems[0]?.total || 0,
                byStatus
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Get single order by ID
router.get('/:id', limiter, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'سفارش یافت نشد' 
            });
        }
        res.json(order);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Create new order from cart
// Create new order from cart
router.post('/', limiter, async (req, res) => {
    try {
        const {
            clientName,
            clientId,
            clientPhoneNumber,
            totalPrice,
            items
        } = req.body;

        // Validate required fields
        if (!clientId || !items || items.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'اطلاعات کاربر و آیتم‌های سبد خرید الزامی است' 
            });
        }

        // Calculate total items (number of different items in the order)
        const totalItems = items.length;  // ← ADD THIS

        // Create new order
        const order = new Order({
            clientName,
            clientId,
            clientPhoneNumber,
            totalPrice,
            totalItems,  // ← ADD THIS
            status: 'در انتظار',
            items: items.map(item => ({
                productId: item.productId,
                productTitle: item.productTitle,
                quantity: item.quantity,
                price: item.price,
                subTotal: item.subTotal,
                typeCourse: item.typeCourse,
                image: item.image || ''
            }))
        });

        await order.save();
        
        res.status(201).json({ 
            success: true, 
            message: 'سفارش با موفقیت ثبت شد',
            order 
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Update order status
router.put('/:id', limiter, async (req, res) => {
    try {
        const { status } = req.body;
        
        // Validate status
        const validStatuses = ['در انتظار', 'در حال پردازش', 'تایید شده', 'لغو شده'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'وضعیت نامعتبر است'
            });
        }
        
        const d = new Date();
        const time = new Intl.DateTimeFormat('fa-IR', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: 'Asia/Tehran'
        }).format(d);
        
        // First get the current order to access items
        const currentOrder = await Order.findById(req.params.id);
        if (!currentOrder) {
            return res.status(404).json({ 
                success: false, 
                message: 'سفارش یافت نشد' 
            });
        }

        // Calculate totalItems from the existing items (or if items are being updated)
        let totalItems = currentOrder.items.length;
        
        // If items are being updated in the request body
        if (req.body.items && Array.isArray(req.body.items)) {
            totalItems = req.body.items.length;
        }

        const updateData = {
            status,
            dateEdited: time,
            totalItems  // Update totalItems
        };

        // If items are being updated, include them
        if (req.body.items && Array.isArray(req.body.items)) {
            updateData.items = req.body.items;
        }

        const order = await Order.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );
        
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'سفارش یافت نشد' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'وضعیت سفارش با موفقیت به‌روزرسانی شد', 
            order 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Delete order
router.delete('/:id', limiter, async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'سفارش یافت نشد' 
            });
        }
        res.json({ 
            success: true, 
            message: 'سفارش با موفقیت حذف شد' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

module.exports = router;