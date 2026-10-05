const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const { Cart } = require('../models/cart');
const { Course } = require('../models/course');
const { Product } = require('../models/products');
const { Client } = require('../models/client');
const Order = require('../models/order');
const Payment = require('../models/payment');
const requireAuth = require('../middleware/auth');
const sep = require('../utils/sep');

const router = express.Router();

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://ogenetech.com').replace(/\/$/, '');
const VERIFY_WINDOW_MS = 25 * 60 * 1000; // سامان بعد از ۳۰ دقیقه خودش برگشت می‌زند

const startLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 6,
    keyGenerator: (req) => String(req.user.id), // بعد از requireAuth اجرا می‌شود
    message: { success: false, message: 'درخواست‌های زیاد. کمی صبر کنید.' }
});

// بر اساس resNum (نه IP): پشت پروکسی PaaS ممکن است IP همه کاربران یکی دیده شود
const statusLimiter = rateLimit({
    windowMs: 10 * 1000,
    max: 12, // صفحه هر ۳ ثانیه یک بار می‌پرسد
    keyGenerator: (req) => String(req.params.resNum),
    message: { success: false, message: 'Too many requests.' }
});

// ------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------

/** سبد کاربر را می‌خواند و قیمت‌ها را از خود Course/Product دوباره محاسبه می‌کند (نه از فرانت) */
async function buildCheckoutFromCart(userId) {
    const cartItems = await Cart.find({ userId });
    if (cartItems.length === 0) {
        return { error: { status: 400, code: 'EMPTY_CART', message: 'سبد خرید شما خالی است!' } };
    }

    const items = [];
    let total = 0;
    let changed = false;

    for (const c of cartItems) {
        const Model = c.typeCourse ? Course : Product;
        let doc = null;
        try { doc = await Model.findById(c.productId).select('price').lean(); } catch (_) { /* id نامعتبر */ }

        if (!doc) {
            return {
                error: {
                    status: 409,
                    code: 'ITEM_UNAVAILABLE',
                    message: `«${c.productTitle}» دیگر در دسترس نیست. لطفاً آن را از سبد خرید حذف کنید.`
                }
            };
        }

        const price = Number(doc.price);
        const quantity = c.typeCourse ? 1 : Math.max(1, parseInt(c.quantity, 10) || 1);
        const subTotal = price * quantity;

        if (!Number.isSafeInteger(price) || price <= 0) {
            return { error: { status: 409, code: 'INVALID_PRICE', message: `قیمت «${c.productTitle}» نامعتبر است. با پشتیبانی تماس بگیرید.` } };
        }

        if (c.price !== price || c.quantity !== quantity || c.subTotal !== subTotal) {
            changed = true;
            await Cart.updateOne({ _id: c._id }, { $set: { price, quantity, subTotal } });
        }

        items.push({
            productId: c.productId,
            productTitle: c.productTitle,
            quantity,
            price,
            subTotal,
            typeCourse: c.typeCourse,
            image: c.image || ''
        });
        total += subTotal;
    }

    return { items, total, changed, cartItemIds: cartItems.map((c) => String(c._id)) };
}

/** 09123456789 -> 9123456789 (فرمت نمونه مستند) */
function toCellNumber(phone) {
    const p = String(phone || '').replace(/^0/, '');
    return /^9\d{9}$/.test(p) ? p : undefined;
}

/** ساخت سفارش (idempotent: برای هر پرداخت فقط یک سفارش) و خالی کردن همان آیتم‌های سبد */
async function createOrderFromPayment(payment) {
    let order = await Order.findOne({ paymentId: String(payment._id) });

    if (!order) {
        const client = await Client.findById(payment.userId).select('name lastName phone').lean();
        try {
            order = await Order.create({
                clientName: `${(client && client.name) || ''} ${(client && client.lastName) || ''}`.trim() || 'کاربر',
                clientId: payment.userId,
                clientPhoneNumber: (client && client.phone) || '-',
                totalPrice: payment.amountToman,
                totalItems: payment.items.length,
                status: 'در انتظار',
                items: payment.items,
                paymentId: String(payment._id),
                refNum: payment.refNum || '',
                traceNo: payment.traceNo || '',
                paidAt: payment.verifiedAt || new Date()
            });
        } catch (err) {
            if (err && err.code === 11000) {
                order = await Order.findOne({ paymentId: String(payment._id) }); // رقابت دو درخواست همزمان
            } else {
                throw err;
            }
        }
    }

    await Cart.deleteMany({ _id: { $in: payment.cartItemIds }, userId: payment.userId });

    payment.orderId = String(order._id);
    await payment.save();
    return order;
}

async function finalizePaid(payment, detail) {
    payment.status = 'paid';
    payment.verifiedAt = new Date();
    if (detail) {
        payment.rrn = detail.RRN;
        payment.traceNo = detail.StraceNo;
        payment.maskedPan = detail.MaskedPan;
        payment.hashedPan = detail.HashedPan;
    }
    await payment.save();

    try {
        await createOrderFromPayment(payment);
    } catch (err) {
        // پول گرفته شده؛ job بعدی دوباره تلاش می‌کند
        console.error('[payment] order creation failed, reconciler will retry:', payment.resNum, err.message);
    }
}

/**
 * وریفای + مقایسه مبلغ + تسویه.
 * برمی‌گرداند: 'paid' | 'failed' | 'pending'
 */
async function verifyAndSettle(payment) {
    const v = await sep.verifyWithRetry(payment.refNum);

    if (v.networkError) {
        payment.status = 'verify_pending';
        await payment.save();
        return 'pending';
    }

    if (v.success && v.detail) {
        const d = v.detail;
        const amountOk = Number(d.OrginalAmount) === payment.amountRial;
        const terminalOk = Number(d.TerminalNumber) === Number(process.env.SEP_TERMINAL_ID);

        if (!amountOk || !terminalOk) {
            console.error('[payment] MISMATCH', payment.resNum, { expected: payment.amountRial, got: d.OrginalAmount, terminal: d.TerminalNumber });
            await sep.reverseTransaction(payment.refNum); // طبق مستند: مبلغ باید به حساب مشتری برگردد
            payment.status = 'failed';
            payment.failReason = 'amount_or_terminal_mismatch';
            await payment.save();
            return 'failed';
        }

        await finalizePaid(payment, d);
        return 'paid';
    }

    if (v.success) { // موفق ولی بدون جزئیات: غیرمنتظره
        payment.status = 'needs_review';
        payment.failReason = 'verify_ok_without_detail';
        await payment.save();
        return 'pending';
    }

    if (v.resultCode === 2) { // «درخواست تکراری» - مبهم؛ خودکار سفارش نمی‌سازیم
        console.error('[payment] verify ResultCode=2, needs manual review:', payment.resNum, payment.refNum);
        payment.status = 'needs_review';
        payment.failReason = 'verify_duplicate';
        await payment.save();
        return 'pending';
    }

    // خطای قطعی (-2, -6, 5, -104, -105, -106, ...)
    if ([-104, -105, -106].includes(v.resultCode)) {
        console.error('[payment] CONFIG PROBLEM with SEP (terminal/IP):', v.resultCode, v.description);
    }
    payment.status = 'failed';
    payment.failReason = `verify_${v.resultCode}`;
    await payment.save();
    return 'failed';
}

function goFront(res, payment) {
    const failedLike = ['failed', 'canceled', 'expired'].includes(payment.status);
    const path = failedLike ? '/payment-failed' : '/payment-success';
    return res.redirect(303, `${FRONTEND_URL}${path}?resNum=${encodeURIComponent(payment.resNum)}`);
}

// ------------------------------------------------------------------
// 1) شروع پرداخت  (فرانت این را صدا می‌زند)
// ------------------------------------------------------------------
router.post('/start', requireAuth, startLimiter, async (req, res) => {
    try {
        const userId = String(req.user.id);

        const client = await Client.findById(userId).select('phone').lean();
        if (!client) return res.status(401).json({ success: false, message: 'کاربر پیدا نشد!' });

        const built = await buildCheckoutFromCart(userId);
        if (built.error) {
            return res.status(built.error.status).json({ success: false, code: built.error.code, message: built.error.message });
        }
        if (built.changed) {
            return res.status(409).json({
                success: false,
                code: 'PRICE_CHANGED',
                message: 'قیمت برخی آیتم‌ها تغییر کرده است. سبد خرید به‌روز شد؛ لطفاً دوباره بررسی و پرداخت کنید.'
            });
        }

        const resNum = crypto.randomBytes(8).toString('hex'); // 16 کاراکتر یکتا
        const amountRial = built.total * 10; // تومان -> ریال

        const payment = await Payment.create({
            userId,
            resNum,
            amountToman: built.total,
            amountRial,
            items: built.items,
            cartItemIds: built.cartItemIds
        });

        let tk;
        try {
            tk = await sep.requestToken({ amountRial, resNum, cellNumber: toCellNumber(client.phone) });
        } catch (err) {
            tk = { ok: false, errorDesc: err.message };
        }

        if (!tk.ok) {
            console.error('[payment] token request failed:', resNum, tk);
            payment.status = 'failed';
            payment.failReason = `token_${tk.errorCode || tk.httpStatus || 'error'}`;
            await payment.save();
            return res.status(502).json({ success: false, message: 'اتصال به درگاه پرداخت برقرار نشد. لطفاً چند دقیقه بعد دوباره تلاش کنید.' });
        }

        payment.token = tk.token;
        await payment.save();

        return res.json({ success: true, resNum, token: tk.token, paymentUrl: tk.paymentUrl });
    } catch (err) {
        console.error('[payment] /start error:', err);
        return res.status(500).json({ success: false, message: 'خطا در شروع پرداخت!' });
    }
});

// ------------------------------------------------------------------
// 2) بازگشت از درگاه (سامان کاربر را با POST به اینجا می‌فرستد)
//    این آدرس باید همان چیزی باشد که در PAYMENT_CALLBACK_URL گذاشته‌اید.
// ------------------------------------------------------------------
router.post('/callback', express.urlencoded({ extended: false }), async (req, res) => {
    const b = req.body || {};
    const resNum = String(b.ResNum || '').trim();
    const state = String(b.State || '').trim();
    const status = String(b.Status || '').trim();
    const refNum = String(b.RefNum || '').trim();

    try {
        const existing = resNum ? await Payment.findOne({ resNum }) : null;
        if (!existing) return res.redirect(303, `${FRONTEND_URL}/payment-failed`);

        // فقط یک درخواست می‌تواند این پرداخت را «بردارد» (جلوگیری از رفرش/دوبار callback)
        const payment = await Payment.findOneAndUpdate(
            { _id: existing._id, status: 'pending' },
            { $set: { status: 'verifying', callbackAt: new Date(), sepState: state, sepStatus: status } },
            { new: true }
        );
        if (!payment) return goFront(res, existing);

        const ok = state.toUpperCase() === 'OK' && refNum !== '';
        if (!ok) {
            const canceled = state.toLowerCase() === 'canceledbyuser' || status === '1';
            payment.status = canceled ? 'canceled' : 'failed';
            payment.failReason = state || `status_${status}`;
            await payment.save();
            return goFront(res, payment);
        }

        // یک RefNum فقط برای یک پرداخت (Double Spending)
        const dup = await Payment.findOne({ refNum, _id: { $ne: payment._id } }).select('_id').lean();
        if (dup) {
            payment.status = 'failed';
            payment.failReason = 'refnum_reused';
            await payment.save();
            return goFront(res, payment);
        }

        payment.refNum = refNum;
        payment.maskedPan = b.SecurePan ? String(b.SecurePan) : undefined;
        payment.verifyDeadline = new Date(Date.now() + VERIFY_WINDOW_MS);
        try {
            await payment.save();
        } catch (err) {
            if (err && err.code === 11000) {
                payment.refNum = undefined;
                payment.status = 'failed';
                payment.failReason = 'refnum_reused';
                await payment.save();
                return goFront(res, payment);
            }
            throw err;
        }

        await verifyAndSettle(payment);
        return goFront(res, payment);
    } catch (err) {
        console.error('[payment] /callback error:', err);
        // صفحه موفقیت وضعیت را از سرور می‌پرسد و در صورت نیاز خودش به failed می‌رود
        const to = resNum ? `/payment-success?resNum=${encodeURIComponent(resNum)}` : '/payment-failed';
        return res.redirect(303, `${FRONTEND_URL}${to}`);
    }
});

// ------------------------------------------------------------------
// 3) وضعیت پرداخت برای صفحه‌های /payment-success و /payment-failed
//    resNum یک مقدار تصادفی 64 بیتی است؛ اطلاعات حساسی برنمی‌گردد.
// ------------------------------------------------------------------
router.get('/status/:resNum', statusLimiter, async (req, res) => {
    try {
        const p = await Payment.findOne({ resNum: String(req.params.resNum) })
            .select('status failReason amountToman refNum traceNo orderId verifiedAt')
            .lean();
        if (!p) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'پرداخت پیدا نشد' });

        return res.json({
            success: true,
            status: p.status,
            reason: p.failReason,
            amount: p.amountToman,
            refNum: p.refNum || '',
            traceNo: p.traceNo || '',
            orderId: p.orderId || '',
            paidAt: p.verifiedAt || null
        });
    } catch (err) {
        return res.status(500).json({ success: false });
    }
});

// ------------------------------------------------------------------
// Reconciler: هر ۲ دقیقه کارهای نیمه‌تمام را جمع می‌کند
// ------------------------------------------------------------------
async function reconcile() {
    const now = Date.now();

    // الف) وریفایی که به خاطر شبکه انجام نشد (تا قبل از پایان مهلت ۳۰ دقیقه)
    const stuck = await Payment.find({
        status: { $in: ['verify_pending', 'verifying'] },
        refNum: { $exists: true, $ne: null },
        updatedAt: { $lt: new Date(now - 2 * 60 * 1000) }, // بیشتر از زمان یک verify زنده (حداکثر ~۵۰ ثانیه)
        verifyDeadline: { $gt: new Date(now) }
    }).limit(20);

    for (const p of stuck) {
        try { await verifyAndSettle(p); } catch (e) { console.error('[payment] reconcile verify error', p.resNum, e.message); }
    }

    // ب) مهلت وریفای تمام شد -> سامان خودش برگشت زده
    await Payment.updateMany(
        { status: { $in: ['verify_pending', 'verifying'] }, verifyDeadline: { $lte: new Date(now) } },
        { $set: { status: 'failed', failReason: 'verify_timeout' } }
    );

    // پ) callback شروع شد ولی RefNum هیچ‌وقت ذخیره نشد
    await Payment.updateMany(
        { status: 'verifying', refNum: { $exists: false }, updatedAt: { $lt: new Date(now - 10 * 60 * 1000) } },
        { $set: { status: 'failed', failReason: 'callback_incomplete' } }
    );

    // ت) پول گرفته شده ولی سفارش ساخته نشده
    const paidNoOrder = await Payment.find({
        status: 'paid',
        $or: [{ orderId: { $exists: false } }, { orderId: null }, { orderId: '' }]
    }).limit(20);

    for (const p of paidNoOrder) {
        try { await createOrderFromPayment(p); } catch (e) { console.error('[payment] reconcile order error', p.resNum, e.message); }
    }

    // ث) کاربر هیچ‌وقت از درگاه برنگشت
    await Payment.updateMany(
        { status: 'pending', createdAt: { $lt: new Date(now - 60 * 60 * 1000) } },
        { $set: { status: 'expired' } }
    );
}

function startReconciler() {
    sep.logOutboundIp();
    setInterval(() => reconcile().catch((e) => console.error('[payment] reconcile error', e)), 2 * 60 * 1000);
}

module.exports = router;
module.exports.startReconciler = startReconciler;
module.exports.reconcile = reconcile;