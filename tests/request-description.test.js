const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Request } = require('../models/request');

const baseRequest = {
    reqName: ['نصب و راه‌اندازی'], name: 'آرمان اسدیان', phone: '09123456789', userId: '111111111111111111111111'
};

describe('request description schema', () => {
    test('notes are optional for existing callers and new requests retain provided text', async () => {
        const legacy = new Request(baseRequest);
        await legacy.validate();
        assert.equal(legacy.description, '');
        const withNotes = new Request({ ...baseRequest, description: '  توضیحات درخواست\nخط دوم  ' });
        await withNotes.validate();
        assert.equal(withNotes.description, '  توضیحات درخواست\nخط دوم  ');
    });

    test('the schema enforces the 2000-character limit without a database', async () => {
        await new Request({ ...baseRequest, description: 'آ'.repeat(2000) }).validate();
        await assert.rejects(new Request({ ...baseRequest, description: 'آ'.repeat(2001) }).validate(), (error) => {
            assert.equal(error.name, 'ValidationError');
            assert.ok(error.errors.description);
            return true;
        });
    });
});

describe('request description routes with mocked database persistence', { concurrency: false }, () => {
    let server;
    let origin;
    let requestNumber = 0;

    before(async () => {
        const app = express();
        app.set('trust proxy', 1);
        app.use(express.json());
        app.use('/api/request', require('../routes/request'));
        server = await new Promise((resolve) => {
            const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        });
        origin = `http://127.0.0.1:${server.address().port}/api/request`;
    });

    after(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    beforeEach((context) => {
        context.mock.method(Request.prototype, 'save', async function () {
            await this.validate();
            return this;
        });
        context.mock.method(Request, 'findByIdAndUpdate', async () => new Request({ ...baseRequest, description: 'یادداشت ثبت‌شده' }));
    });

    async function request(path, body, method = 'POST') {
        const response = await fetch(`${origin}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${++requestNumber}` },
            body: JSON.stringify(body)
        });
        return { status: response.status, body: await response.json() };
    }

    test('POST persists provided notes with all existing request fields', async () => {
        const description = 'لطفاً قبل از مراجعه تماس بگیرید.\nساعت ۱۰ مناسب است.';
        const result = await request('/create', { ...baseRequest, description });
        assert.equal(result.status, 201);
        assert.equal(result.body.description, description);
        assert.deepEqual(result.body.reqName, baseRequest.reqName);
        assert.equal(result.body.name, baseRequest.name);
        assert.equal(result.body.phone, baseRequest.phone);
        assert.equal(result.body.userId, baseRequest.userId);
        assert.equal(Request.prototype.save.mock.callCount(), 1);
        assert.equal(Request.prototype.save.mock.calls[0].this.description, description);
    });

    test('POST remains compatible with omitted and empty notes', async () => {
        assert.equal((await request('/create', baseRequest)).body.description, '');
        const result = await request('/create', { ...baseRequest, description: '' });
        assert.equal(result.status, 201);
        assert.equal(result.body.description, '');
        assert.equal(Request.prototype.save.mock.callCount(), 2);
    });

    test('POST accepts the maximum length and rejects oversized notes before saving', async () => {
        const accepted = await request('/create', { ...baseRequest, description: 'آ'.repeat(2000) });
        assert.equal(accepted.status, 201);
        assert.equal(accepted.body.description.length, 2000);
        const rejected = await request('/create', { ...baseRequest, description: 'آ'.repeat(2001) });
        assert.equal(rejected.status, 400);
        assert.equal(rejected.body.code, 'INVALID_DESCRIPTION');
        assert.equal(rejected.body.success, false);
        assert.equal(rejected.body.error, true);
        assert.equal(rejected.body.msg, rejected.body.message);
        assert.equal(Request.prototype.save.mock.callCount(), 1);
    });

    test('POST rejects non-text notes without creating database records', async () => {
        for (const description of [{ text: 'یادداشت' }, ['یادداشت'], 123, false, null]) {
            const result = await request('/create', { ...baseRequest, description });
            assert.equal(result.status, 400);
            assert.equal(result.body.code, 'INVALID_DESCRIPTION');
        }
        assert.equal(Request.prototype.save.mock.callCount(), 0);
    });

    test('legacy PUT does not include notes in its partial update and preserves stored notes', async () => {
        const result = await request('/111111111111111111111111', { name: 'نام جدید' }, 'PUT');
        assert.equal(result.status, 200);
        assert.equal(result.body.description, 'یادداشت ثبت‌شده');
        const update = Request.findByIdAndUpdate.mock.calls[0].arguments[1];
        assert.equal(Object.hasOwn(update, 'description'), false);
        assert.equal(update.name, 'نام جدید');
    });
});
