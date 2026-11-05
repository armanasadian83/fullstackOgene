const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Product } = require('../models/products');
const { Course } = require('../models/course');
const { Service } = require('../models/service');
const { Event } = require('../models/event');
const { ImageUpload } = require('../models/imageUpload');
const { ENGLISH_FIELDS, pickEnglishFields } = require('../utils/englishContent');
const { enrichItemTitles, enrichOrderTitles, enrichCatalogEvents } = require('../utils/publicItemTitles');

const id = '111111111111111111111111';
const productId = '222222222222222222222222';
const cases = [
    { resource: 'product', Model: Product, path: '/product', create: '/create', fixture: { name: 'محصول', description: 'توضیحات', field: 'بلاگ', images: ['image.png'], price: 500, countInStock: 1 } },
    { resource: 'course', Model: Course, path: '/course', create: '/create', fixture: { name: 'دوره', description: 'درباره دوره', headline: 'سرفصل', field: 'ژنتیک', status: 'فعال', images: ['image.png'], price: 1000, prerequisite: [id] } },
    { resource: 'service', Model: Service, path: '/service', create: '/add', fixture: { name: 'خدمت', field: 'ژنتیک' } },
    { resource: 'event', Model: Event, path: '/event', create: '/create', fixture: { name: 'رخداد' } }
];
const query = (value) => ({ select() { return this; }, lean: async () => value });

describe('optional English content schema and update contract', () => {
    for (const { resource, Model, fixture } of cases) {
        test(`${resource} accepts legacy Persian records and retains English fields in public JSON`, async () => {
            const oldRecord = new Model(fixture);
            await oldRecord.validate();
            assert.equal(oldRecord.name, fixture.name);
            assert.equal(oldRecord.nameEn, '');
            const english = Object.fromEntries(Object.keys(ENGLISH_FIELDS[resource]).map((field) => [field, `English ${field}`]));
            const record = new Model({ ...fixture, ...english });
            await record.validate();
            for (const [field, text] of Object.entries(english)) assert.equal(record.toJSON()[field], text);
            assert.equal(record.field, fixture.field);
            if (resource === 'course') {
                assert.deepEqual(record.prerequisite.toObject(), [id]);
                assert.equal(Model.schema.path('prerequisiteEn'), undefined);
            }
        });
    }

    test('only supplied English fields update; blank strings explicitly clear a translation', () => {
        assert.deepEqual(pickEnglishFields('product', { name: 'فارسی', price: 1 }), {});
        assert.deepEqual(pickEnglishFields('product', { nameEn: '  English  ', field: 'ژنتیک' }), { nameEn: 'English' });
        assert.deepEqual(pickEnglishFields('product', { nameEn: '   ' }), { nameEn: '' });
        for (const bad of [null, 1, false, {}, []]) assert.throws(() => pickEnglishFields('product', { nameEn: bad }));
        assert.throws(() => pickEnglishFields('product', { nameEn: 'x'.repeat(501) }));
    });
});

describe('English create/update endpoints with mocked persistence', { concurrency: false }, () => {
    let server;
    let origin;
    let requestNumber = 0;

    before(async () => {
        const app = express();
        app.set('trust proxy', 1);
        app.use(express.json());
        for (const entry of cases) app.use(entry.path, require(`../routes/${entry.resource === 'product' ? 'products' : entry.resource}`));
        app.use('/gallery', require('../routes/gallery'));
        server = await new Promise((resolve) => {
            const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        });
        origin = `http://127.0.0.1:${server.address().port}`;
    });
    after(async () => { await new Promise((resolve) => server.close(resolve)); });
    beforeEach((context) => {
        for (const { Model, fixture } of cases) {
            context.mock.method(Model.prototype, 'save', async function () { await this.validate(); return this; });
            context.mock.method(Model, 'findByIdAndUpdate', async (_id, update) => new Model({ ...fixture, nameEn: 'Existing English', ...update }));
        }
        context.mock.method(ImageUpload, 'findOne', async () => null);
        context.mock.method(ImageUpload.prototype, 'save', async function () { return this; });
        context.mock.method(console, 'log', () => {});
    });
    async function request(path, body, method = 'POST') {
        const response = await fetch(`${origin}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${++requestNumber}` }, body: JSON.stringify(body) });
        return { status: response.status, body: await response.json() };
    }

    for (const entry of cases) {
        test(`${entry.resource} creates translations and preserves omitted translations during legacy updates`, async () => {
            const english = Object.fromEntries(Object.keys(ENGLISH_FIELDS[entry.resource]).map((field) => [field, `English ${field}`]));
            const created = await request(`${entry.path}${entry.create}`, { ...entry.fixture, ...english });
            assert.equal(created.status, 201);
            for (const [field, text] of Object.entries(english)) assert.equal(created.body[field], text);
            assert.equal(created.body.name, entry.fixture.name);
            const updated = await request(`${entry.path}/${id}`, entry.fixture, 'PUT');
            assert.equal(updated.status, 200);
            assert.equal((await entry.Model.findByIdAndUpdate.mock.calls[0].result).nameEn, 'Existing English');
            const update = entry.Model.findByIdAndUpdate.mock.calls[0].arguments[1];
            assert.equal(Object.hasOwn(update, 'nameEn'), false);
            const cleared = await request(`${entry.path}/${id}`, { ...entry.fixture, nameEn: '' }, 'PUT');
            assert.equal(cleared.status, 200);
            assert.equal((await entry.Model.findByIdAndUpdate.mock.calls[1].result).nameEn, '');
        });
        test(`${entry.resource} rejects malformed English input before writes`, async () => {
            const result = await request(`${entry.path}${entry.create}`, { ...entry.fixture, nameEn: { $gt: '' } });
            assert.equal(result.status, 400);
            assert.equal(result.body.code, 'INVALID_ENGLISH_CONTENT');
            assert.equal(result.body.field, 'nameEn');
            assert.equal(entry.Model.prototype.save.mock.callCount(), 0);
        });
    }

    test('gallery metadata persists optional translations and retains them on Persian-only edits', async () => {
        const stored = new ImageUpload({ images: ['image.png'], metadata: { key: { name: 'نام', nameEn: 'Original name', altEn: 'Original alt', liked: true } } });
        ImageUpload.findOne.mock.mockImplementation(async () => stored);
        const updated = await request('/gallery/image/key/metadata', { imageUrl: 'image.png', name: 'نام جدید', alt: 'توضیح', nameEn: 'New name', altEn: 'New alt' }, 'PUT');
        assert.equal(updated.status, 200);
        assert.equal(stored.metadata.key.nameEn, 'New name');
        assert.equal(stored.metadata.key.altEn, 'New alt');
        assert.equal(stored.metadata.key.liked, true);
        await request('/gallery/image/key/metadata', { imageUrl: 'image.png', name: 'نام دیگر', alt: 'توضیح دیگر' }, 'PUT');
        assert.equal(stored.metadata.key.nameEn, 'New name');
        assert.equal(stored.metadata.key.altEn, 'New alt');
        const bad = await request('/gallery/image/key/metadata', { imageUrl: 'image.png', nameEn: {} }, 'PUT');
        assert.equal(bad.status, 400);
    });
});

describe('read-only English titles for existing carts and orders', { concurrency: false }, () => {
    beforeEach((context) => {
        context.mock.method(Course, 'find', () => query([{ _id: id, nameEn: 'English course' }]));
        context.mock.method(Product, 'find', () => query([{ _id: productId, nameEn: 'English product' }]));
    });
    const items = [
        { productId: id, productTitle: 'دوره قبلی', typeCourse: true, quantity: 1, price: 1000, subTotal: 1000 },
        { productId, productTitle: 'محصول قبلی', typeCourse: false, quantity: 2, price: 500, subTotal: 1000 },
        { productId: id, productTitle: 'دوره قبلی', typeCourse: true, quantity: 1, price: 1000, subTotal: 1000 }
    ];
    test('uses one batch per catalog type and never mutates canonical item snapshots', async () => {
        const enriched = await enrichItemTitles(items);
        assert.equal(enriched[0].productTitleEn, 'English course');
        assert.equal(enriched[1].productTitleEn, 'English product');
        assert.equal(enriched[0].productTitle, items[0].productTitle);
        assert.equal(enriched[1].subTotal, 1000);
        assert.equal(items[0].productTitleEn, undefined);
        assert.equal(Course.find.mock.callCount(), 1);
        assert.equal(Product.find.mock.callCount(), 1);
        assert.deepEqual(Course.find.mock.calls[0].arguments[0], { _id: { $in: [id] } });
    });
    test('orders batch across all items and fall back to historical Persian when catalog entries disappear', async () => {
        Product.find.mock.mockImplementation(() => query([]));
        const orders = await enrichOrderTitles([{ totalPrice: 2000, items: items.slice(0, 2) }, { totalPrice: 1000, items: items.slice(2) }]);
        assert.equal(orders[0].items[0].productTitleEn, 'English course');
        assert.equal(orders[0].items[1].productTitleEn, undefined);
        assert.equal(orders[0].items[1].productTitle, 'محصول قبلی');
        assert.equal(orders[0].totalPrice, 2000);
        assert.equal(Course.find.mock.callCount(), 1);
        assert.equal(Product.find.mock.callCount(), 1);
    });
    test('course/product event labels batch by Persian name and retain per-index fallback', async (context) => {
        context.mock.method(Event, 'find', () => query([{ name: 'رخداد', nameEn: 'Event' }]));
        const records = [{ name: 'دوره', event: ['رخداد', 'بدون ترجمه'] }, { name: 'محصول', event: ['رخداد'] }];
        const enriched = await enrichCatalogEvents(records);
        assert.deepEqual(enriched[0].eventEn, ['Event', '']);
        assert.deepEqual(enriched[0].event, records[0].event);
        assert.equal(records[0].eventEn, undefined);
        assert.equal(Event.find.mock.callCount(), 1);
        assert.deepEqual(Event.find.mock.calls[0].arguments[0], { name: { $in: ['رخداد', 'بدون ترجمه'] } });
    });
});
