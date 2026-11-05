const express = require('express');
const mongoose = require('mongoose');
const requireAuth = require('../middleware/auth');
const Checkout = require('../models/checkout');
const { Client } = require('../models/client');
const { Cart } = require('../models/cart');
const { Course } = require('../models/course');
const { Product } = require('../models/products');
const Payment = require('../models/payment');
const { CHECKOUT_LIMITS, validateCheckoutDetails, snapshotsMatch } = require('../utils/checkout');
const { enrichItemTitles } = require('../utils/publicItemTitles');

const router = express.Router();

router.use(requireAuth);
router.use(async (req, res, next) => {
    if (typeof req.user.id !== 'string' || !mongoose.isValidObjectId(req.user.id)) {
        return res.status(401).json({ success: false, message: 'حساب کاربری معتبر نیست.' });
    }
    try {
        const client = await Client.findById(req.user.id)
            .select('name lastName phone nationalCode englishName englishLastName').lean();
        if (!client) {
            return res.status(401).json({ success: false, message: 'حساب کاربری پیدا نشد.' });
        }
        req.checkoutClient = client;
        next();
    } catch (err) {
        console.error('[checkout] client lookup failed:', err.message);
        return res.status(500).json({ success: false, message: 'دریافت اطلاعات کاربر انجام نشد.' });
    }
});

function publicCheckout(checkout, items = checkout && checkout.items) {
    if (!checkout) return null;
    const result = {
        id: String(checkout._id),
        items,
        cartItemIds: checkout.cartItemIds,
        totalToman: checkout.totalToman,
        createdAt: checkout.createdAt
    };
    for (const field of Object.keys(CHECKOUT_LIMITS)) result[field] = checkout[field] || '';
    if (checkout.paymentId) result.paymentId = checkout.paymentId;
    if (checkout.resNum) result.resNum = checkout.resNum;
    return result;
}

async function checkoutWithTitles(checkout) {
    return publicCheckout(checkout, await enrichItemTitles(checkout.items));
}

router.get('/', async (req, res) => {
    try {
        const [checkout, cart] = await Promise.all([
            Checkout.findOne({ userId: req.user.id }).sort({ createdAt: -1, _id: -1 }).lean(),
            Cart.find({ userId: req.user.id }).lean()
        ]);
        const client = req.checkoutClient;
        const titledItems = await enrichItemTitles([...cart, ...((checkout && checkout.items) || [])]);
        return res.json({
            success: true,
            checkout: publicCheckout(checkout, titledItems.slice(cart.length)),
            cart: titledItems.slice(0, cart.length),
            profile: {
                firstName: client.name || '',
                lastName: client.lastName || '',
                firstNameLatin: client.englishName || '',
                lastNameLatin: client.englishLastName || '',
                nationalId: client.nationalCode || '',
                phone: client.phone || ''
            }
        });
    } catch (err) {
        console.error('[checkout] read failed:', err.message);
        return res.status(500).json({ success: false, message: 'دریافت اطلاعات صورتحساب انجام نشد.' });
    }
});

router.post('/', async (req, res) => {
    const { details, errors } = validateCheckoutDetails(req.body);
    if (Object.keys(errors).length) {
        return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'اطلاعات فرم را بررسی کنید.', errors });
    }

    try {
        const cart = await Cart.find({ userId: req.user.id }).lean();
        if (!cart.length) {
            return res.status(400).json({ success: false, code: 'EMPTY_CART', message: 'سبد خرید شما خالی است.' });
        }

        const items = [];
        let totalToman = 0;
        for (const cartItem of cart) {
            const Model = cartItem.typeCourse ? Course : Product;
            const product = mongoose.isValidObjectId(cartItem.productId)
                ? await Model.findById(cartItem.productId).select('price').lean()
                : null;
            if (!product) {
                return res.status(409).json({ success: false, code: 'ITEM_UNAVAILABLE', message: 'یکی از اقلام سبد خرید دیگر در دسترس نیست. سبد خرید را بررسی کنید.' });
            }
            // Match the existing payment route's price and quantity calculation without changing the cart.
            const price = Number(product.price);
            const quantity = cartItem.typeCourse ? 1 : Math.max(1, parseInt(cartItem.quantity, 10) || 1);
            const subTotal = price * quantity;
            if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(subTotal) || !Number.isSafeInteger(totalToman + subTotal)) {
                return res.status(409).json({ success: false, code: 'INVALID_PRICE', message: 'قیمت یکی از اقلام سبد خرید معتبر نیست.' });
            }
            items.push({
                productId: cartItem.productId,
                productTitle: cartItem.productTitle,
                quantity,
                price,
                subTotal,
                typeCourse: cartItem.typeCourse,
                image: cartItem.image || ''
            });
            totalToman += subTotal;
        }

        const checkout = await Checkout.create({
            userId: req.user.id,
            ...details,
            items,
            cartItemIds: cart.map((item) => String(item._id)),
            totalToman
        });
        return res.status(201).json({ success: true, checkout: await checkoutWithTitles(checkout) });
    } catch (err) {
        console.error('[checkout] save failed:', err.message);
        return res.status(500).json({ success: false, message: 'ذخیره اطلاعات صورتحساب انجام نشد. دوباره تلاش کنید.' });
    }
});

router.post('/:id/payment', async (req, res) => {
    const { resNum } = req.body || {};
    if (!mongoose.isValidObjectId(req.params.id) || typeof resNum !== 'string' || !/^[a-f0-9]{16}$/.test(resNum)) {
        return res.status(400).json({ success: false, message: 'شناسه صورتحساب یا پرداخت معتبر نیست.' });
    }
    try {
        const checkout = await Checkout.findOne({ _id: req.params.id, userId: req.user.id }).lean();
        const payment = await Payment.findOne({ resNum, userId: req.user.id })
            .select('_id resNum amountToman items cartItemIds').lean();
        if (!checkout || !payment) {
            return res.status(404).json({ success: false, message: 'صورتحساب یا پرداخت پیدا نشد.' });
        }
        if (!snapshotsMatch(checkout, payment) || (checkout.paymentId && (checkout.paymentId !== String(payment._id) || checkout.resNum !== resNum))) {
            return res.status(409).json({ success: false, code: 'CHECKOUT_MISMATCH', message: 'اطلاعات سبد خرید تغییر کرده است. دوباره سبد خرید را بررسی کنید.' });
        }
        if (checkout.paymentId) return res.json({ success: true, checkout: await checkoutWithTitles(checkout) });

        const linked = await Checkout.findOneAndUpdate(
            { _id: checkout._id, userId: req.user.id, paymentId: { $exists: false } },
            { $set: { paymentId: String(payment._id), resNum } },
            { new: true, runValidators: true }
        ).lean();
        if (linked) return res.json({ success: true, checkout: await checkoutWithTitles(linked) });

        const existing = await Checkout.findOne({ _id: checkout._id, userId: req.user.id }).lean();
        if (existing && existing.paymentId === String(payment._id) && existing.resNum === resNum) {
            return res.json({ success: true, checkout: await checkoutWithTitles(existing) });
        }
        return res.status(409).json({ success: false, code: 'CHECKOUT_MISMATCH', message: 'این صورتحساب به پرداخت دیگری متصل شده است. دوباره تلاش کنید.' });
    } catch (err) {
        if (err && err.code === 11000) {
            return res.status(409).json({ success: false, code: 'CHECKOUT_MISMATCH', message: 'این پرداخت قبلاً به صورتحساب دیگری متصل شده است.' });
        }
        console.error('[checkout] payment association failed:', err.message);
        return res.status(500).json({ success: false, message: 'ثبت ارتباط صورتحساب و پرداخت انجام نشد. دوباره تلاش کنید.' });
    }
});

module.exports = router;
