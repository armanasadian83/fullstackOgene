const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const Checkout = require('../models/checkout');
const { Client } = require('../models/client');
const { Cart } = require('../models/cart');
const { Course } = require('../models/course');
const { Product } = require('../models/products');
const Payment = require('../models/payment');
const { validateCheckoutDetails, snapshotsMatch } = require('../utils/checkout');

const userId = '111111111111111111111111';
const otherUserId = '222222222222222222222222';
const checkoutId = '333333333333333333333333';
const paymentId = '444444444444444444444444';
const resNum = '0123456789abcdef';
const details = {
    firstName: 'آرمان', lastName: 'اسدیان', firstNameLatin: 'Arman', lastNameLatin: 'Asadian',
    nationalId: '0012345678', phone: '09123456789', address: 'تهران، خیابان ولیعصر، پلاک ۸۳',
    postalCode: '1234567890', city: 'تهران', notes: 'زنگ واحد ۴'
};
const cartFixture = [{
    _id: '555555555555555555555555', userId, productId: '666666666666666666666666',
    productTitle: 'دوره آموزشی', quantity: 3, price: 1, subTotal: 3, typeCourse: true, image: '/course.png'
}, {
    _id: '777777777777777777777777', userId, productId: '888888888888888888888888',
    productTitle: 'محصول', quantity: 2, price: 1, subTotal: 2, typeCourse: false, image: '/product.png'
}];
const savedSnapshot = {
    _id: checkoutId, userId, ...details, createdAt: new Date('2026-01-01T00:00:00Z'),
    cartItemIds: cartFixture.map((item) => item._id), totalToman: 1700000,
    items: cartFixture.map((item) => ({
        productId: item.productId, productTitle: item.productTitle,
        quantity: item.typeCourse ? 1 : 2, price: item.typeCourse ? 1000000 : 350000,
        subTotal: item.typeCourse ? 1000000 : 700000, typeCourse: item.typeCourse, image: item.image
    }))
};
const paymentFixture = {
    _id: paymentId, userId, resNum, amountToman: savedSnapshot.totalToman,
    items: savedSnapshot.items, cartItemIds: savedSnapshot.cartItemIds
};

function query(value) {
    return { select() { return this; }, sort() { return this; }, lean: async () => value };
}

describe('checkout validation', () => {
    test('normalizes Persian and Arabic digits, preserving leading zeros', () => {
        const result = validateCheckoutDetails({
            ...details, nationalId: '۰۰۱۲۳۴۵۶۷۸', phone: '٠٩١٢ ٣٤٥ ٦٧٨٩', postalCode: '۱۲۳۴۵-۶۷۸۹۰'
        });
        assert.deepEqual(result.errors, {});
        assert.equal(result.details.nationalId, '0012345678');
        assert.equal(result.details.phone, '09123456789');
        assert.equal(result.details.postalCode, '1234567890');
    });

    test('rejects absent, malformed, and oversized fields without coercing objects', () => {
        const result = validateCheckoutDetails({
            ...details, firstName: { $gt: '' }, firstNameLatin: 'آرمان', nationalId: 1234567890,
            phone: '12345678901', postalCode: '123', address: 'x'.repeat(2001)
        });
        assert.deepEqual(Object.keys(result.errors).sort(), ['address', 'firstName', 'firstNameLatin', 'nationalId', 'phone', 'postalCode'].sort());
        assert.equal(Object.keys(validateCheckoutDetails({}).errors).length, 9);
    });

    test('accepts compound names, optional notes, and ignores client-supplied trusted fields', () => {
        const result = validateCheckoutDetails({
            ...details, lastName: 'حسین‌زاده', lastNameLatin: "O'Neil-Smith", notes: undefined,
            userId: otherUserId, totalToman: 1, paymentId
        });
        assert.deepEqual(result.errors, {});
        assert.equal(result.details.notes, '');
        assert.equal(result.details.userId, undefined);
        assert.equal(result.details.totalToman, undefined);
        assert.equal(result.details.paymentId, undefined);
    });

    test('payment comparison checks complete items, amount, and cart ids independently of ordering', () => {
        assert.equal(snapshotsMatch(savedSnapshot, { ...paymentFixture, items: [...paymentFixture.items].reverse(), cartItemIds: [...paymentFixture.cartItemIds].reverse() }), true);
        assert.equal(snapshotsMatch(savedSnapshot, { ...paymentFixture, amountToman: 1 }), false);
        assert.equal(snapshotsMatch(savedSnapshot, { ...paymentFixture, cartItemIds: ['other'] }), false);
        assert.equal(snapshotsMatch(savedSnapshot, { ...paymentFixture, items: paymentFixture.items.map((item) => ({ ...item, quantity: 99 })) }), false);
    });
});

describe('checkout routes with mocked database models', { concurrency: false }, () => {
    let server;
    let origin;
    let previousSecret;
    let token;

    before(async () => {
        previousSecret = process.env.JSON_WEB_TOKEN_SECRET_KEY;
        process.env.JSON_WEB_TOKEN_SECRET_KEY = 'checkout-tests-only-secret';
        token = jwt.sign({ id: userId }, process.env.JSON_WEB_TOKEN_SECRET_KEY);
        const app = express();
        app.use(express.json());
        app.use('/api/checkout', require('../routes/checkout'));
        server = await new Promise((resolve) => {
            const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        });
        origin = `http://127.0.0.1:${server.address().port}/api/checkout`;
    });

    after(async () => {
        await new Promise((resolve) => server.close(resolve));
        if (previousSecret === undefined) delete process.env.JSON_WEB_TOKEN_SECRET_KEY;
        else process.env.JSON_WEB_TOKEN_SECRET_KEY = previousSecret;
    });

    beforeEach((context) => {
        context.mock.method(Client, 'findById', () => query({ name: details.firstName, lastName: details.lastName, phone: details.phone }));
        context.mock.method(Cart, 'find', () => query(structuredClone(cartFixture)));
        context.mock.method(Course, 'findById', () => query({ price: 1000000 }));
        context.mock.method(Product, 'findById', () => query({ price: 350000 }));
        context.mock.method(Course, 'find', () => query([]));
        context.mock.method(Product, 'find', () => query([]));
        context.mock.method(Checkout, 'findOne', () => query(null));
        context.mock.method(Checkout, 'create', async (data) => {
            const document = new Checkout({ ...data, _id: checkoutId });
            await document.validate();
            return document;
        });
        context.mock.method(Checkout, 'findOneAndUpdate', () => query(null));
        context.mock.method(Payment, 'findOne', () => query(null));
    });

    async function request(path = '', body, authorization = token) {
        const response = await fetch(`${origin}${path}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}), 'Content-Type': 'application/json' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        return { status: response.status, body: await response.json() };
    }

    test('requires authentication before reading or writing database records', async () => {
        assert.equal((await request('', undefined, '')).status, 401);
        assert.equal((await request('', details, 'invalid-token')).status, 401);
        assert.equal(Client.findById.mock.callCount(), 0);
        assert.equal(Checkout.create.mock.callCount(), 0);
    });

    test('GET reads only authenticated cart and latest checkout and selects safe profile fields', async () => {
        Checkout.findOne.mock.mockImplementation((filter) => {
            assert.deepEqual(filter, { userId });
            return query(savedSnapshot);
        });
        const result = await request(`?userId=${otherUserId}`);
        assert.equal(result.status, 200);
        assert.equal(result.body.checkout.id, checkoutId);
        assert.equal(result.body.checkout.phone, details.phone);
        assert.deepEqual(result.body.cart, cartFixture);
        assert.equal(result.body.profile.firstName, details.firstName);
        assert.equal(result.body.checkout.userId, undefined);
        assert.deepEqual(Cart.find.mock.calls[0].arguments, [{ userId }]);
        assert.deepEqual(Client.findById.mock.calls[0].arguments, [userId]);
    });

    test('POST stores fields against JWT user and calculates snapshot from catalog prices', async () => {
        const result = await request('', { ...details, userId: otherUserId, items: [], totalToman: 1 });
        assert.equal(result.status, 201);
        assert.equal(result.body.checkout.totalToman, 1700000);
        assert.equal(result.body.checkout.items[0].quantity, 1);
        assert.equal(result.body.checkout.items[1].quantity, 2);
        const written = Checkout.create.mock.calls[0].arguments[0];
        assert.equal(written.userId, userId);
        assert.deepEqual(written.cartItemIds, savedSnapshot.cartItemIds);
        assert.deepEqual(written.items, savedSnapshot.items);
        assert.equal(written.phone, details.phone);
    });

    test('invalid details fail before catalog reads or saving', async () => {
        const result = await request('', { ...details, phone: 'bad' });
        assert.equal(result.status, 400);
        assert.equal(result.body.code, 'VALIDATION_ERROR');
        assert.ok(result.body.errors.phone);
        assert.equal(Cart.find.mock.callCount(), 0);
        assert.equal(Checkout.create.mock.callCount(), 0);
    });

    test('empty and unavailable carts cannot create checkout snapshots', async () => {
        Cart.find.mock.mockImplementation(() => query([]));
        const empty = await request('', details);
        assert.equal(empty.status, 400);
        assert.equal(empty.body.code, 'EMPTY_CART');
        Cart.find.mock.mockImplementation(() => query(cartFixture));
        Course.findById.mock.mockImplementation(() => query(null));
        const unavailable = await request('', details);
        assert.equal(unavailable.status, 409);
        assert.equal(unavailable.body.code, 'ITEM_UNAVAILABLE');
        assert.equal(Checkout.create.mock.callCount(), 0);
    });

    test('rejects invalid catalog price and arithmetic overflow', async () => {
        Course.findById.mock.mockImplementation(() => query({ price: -1 }));
        assert.equal((await request('', details)).body.code, 'INVALID_PRICE');
        Course.findById.mock.mockImplementation(() => query({ price: Number.MAX_SAFE_INTEGER }));
        assert.equal((await request('', details)).body.code, 'INVALID_PRICE');
        assert.equal(Checkout.create.mock.callCount(), 0);
    });

    test('association scopes checkout and payment reads to authenticated user', async () => {
        Checkout.findOne.mock.mockImplementation((filter) => {
            assert.deepEqual(filter, { _id: checkoutId, userId });
            return query(null);
        });
        Payment.findOne.mock.mockImplementation((filter) => {
            assert.deepEqual(filter, { resNum, userId });
            return query(null);
        });
        assert.equal((await request(`/${checkoutId}/payment`, { resNum, userId: otherUserId })).status, 404);
        assert.equal(Checkout.findOneAndUpdate.mock.callCount(), 0);
    });

    test('association rejects mismatched payment snapshot without a write', async () => {
        Checkout.findOne.mock.mockImplementation(() => query(savedSnapshot));
        Payment.findOne.mock.mockImplementation(() => query({ ...paymentFixture, amountToman: 1 }));
        const result = await request(`/${checkoutId}/payment`, { resNum });
        assert.equal(result.status, 409);
        assert.equal(result.body.code, 'CHECKOUT_MISMATCH');
        assert.equal(Checkout.findOneAndUpdate.mock.callCount(), 0);
    });

    test('association links only Checkout and uses a compare-and-set ownership condition', async () => {
        Checkout.findOne.mock.mockImplementation(() => query(savedSnapshot));
        Payment.findOne.mock.mockImplementation(() => query(paymentFixture));
        Checkout.findOneAndUpdate.mock.mockImplementation((filter, update, options) => {
            assert.deepEqual(filter, { _id: checkoutId, userId, paymentId: { $exists: false } });
            assert.deepEqual(update, { $set: { paymentId, resNum } });
            assert.deepEqual(options, { new: true, runValidators: true });
            return query({ ...savedSnapshot, paymentId, resNum });
        });
        const result = await request(`/${checkoutId}/payment`, { resNum });
        assert.equal(result.status, 200);
        assert.equal(result.body.checkout.paymentId, paymentId);
        assert.equal(result.body.checkout.resNum, resNum);
    });

    test('exact repeated association succeeds without another write; another payment is rejected', async () => {
        Checkout.findOne.mock.mockImplementation(() => query({ ...savedSnapshot, paymentId, resNum }));
        Payment.findOne.mock.mockImplementation(() => query(paymentFixture));
        assert.equal((await request(`/${checkoutId}/payment`, { resNum })).status, 200);
        assert.equal(Checkout.findOneAndUpdate.mock.callCount(), 0);
        Payment.findOne.mock.mockImplementation(() => query({ ...paymentFixture, _id: otherUserId }));
        assert.equal((await request(`/${checkoutId}/payment`, { resNum })).status, 409);
        assert.equal(Checkout.findOneAndUpdate.mock.callCount(), 0);
    });

    test('concurrent identical association resolves idempotently after losing compare-and-set', async () => {
        let reads = 0;
        Checkout.findOne.mock.mockImplementation(() => query(++reads === 1 ? savedSnapshot : { ...savedSnapshot, paymentId, resNum }));
        Payment.findOne.mock.mockImplementation(() => query(paymentFixture));
        const result = await request(`/${checkoutId}/payment`, { resNum });
        assert.equal(result.status, 200);
        assert.equal(result.body.checkout.paymentId, paymentId);
        assert.equal(Checkout.findOneAndUpdate.mock.callCount(), 1);
    });

    test('duplicate payment association returns a conflict', async () => {
        Checkout.findOne.mock.mockImplementation(() => query(savedSnapshot));
        Payment.findOne.mock.mockImplementation(() => query(paymentFixture));
        Checkout.findOneAndUpdate.mock.mockImplementation(() => ({ lean: async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); } }));
        const result = await request(`/${checkoutId}/payment`, { resNum });
        assert.equal(result.status, 409);
        assert.equal(result.body.code, 'CHECKOUT_MISMATCH');
    });
});
