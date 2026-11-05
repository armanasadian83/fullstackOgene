const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcrypt');
const { Client } = require('../models/client');

const clientId = '111111111111111111111111';
const credentialFields = ['password', 'otp', 'otpExpires', 'resetPasswordOTP', 'resetPasswordOTPExpires'];
const profile = {
    _id: clientId, name: 'آرمان', lastName: 'اسدیان', phone: '09123456789', email: 'client@example.test',
    englishName: 'Arman', englishLastName: 'Asadian', nationalCode: '0012345678', birthdate: '1370/01/01',
    password: 'private-password-hash', otp: 'private-otp', otpExpires: new Date('2030-01-01'),
    resetPasswordOTP: 'private-reset-otp', resetPasswordOTPExpires: new Date('2030-01-01')
};

// Model methods remain mocked: this query records the projection and supplies a projected
// Mongoose document without opening a database connection.
function profileQuery(value) {
    let projection;
    return {
        select(fields) {
            projection = fields;
            return this;
        },
        then(resolve, reject) {
            return Promise.resolve().then(() => {
                const project = (record) => {
                    if (!record) return record;
                    const selected = { ...record };
                    const fields = (projection || '').split(' ').filter(Boolean);
                    if (fields.some((field) => !field.startsWith('-'))) {
                        return Object.fromEntries(fields.filter((field) => Object.hasOwn(record, field)).map((field) => [field, record[field]]));
                    }
                    for (const field of fields) delete selected[field.slice(1)];
                    return Client.hydrate(selected, Object.fromEntries(fields.map((field) => [field.slice(1), 0])));
                };
                return Array.isArray(value) ? value.map(project) : project(value);
            }).then(resolve, reject);
        },
        getProjection: () => projection
    };
}

function failedQuery(error) {
    return { select() { return this; }, then(resolve, reject) { return Promise.reject(error).then(resolve, reject); } };
}

function assertSafeProfile(body) {
    assert.equal(body.id, clientId);
    assert.equal(body.name, profile.name);
    assert.equal(body.phone, profile.phone);
    for (const field of credentialFields) assert.equal(Object.hasOwn(body, field), false, `${field} must be excluded`);
}

function assertSafeError(result, status, code) {
    assert.equal(result.status, status);
    assert.equal(result.body.error, true);
    assert.equal(result.body.success, false);
    assert.equal(result.body.code, code);
    assert.equal(typeof result.body.message, 'string');
    assert.equal(result.body.msg, result.body.message);
    assert.equal(JSON.stringify(result.body).includes('private'), false);
    assert.equal(result.body.stack, undefined);
}

describe('client profile routes with mocked database models', { concurrency: false }, () => {
    let server;
    let origin;
    let requestNumber = 0;
    let readQuery;
    let listQuery;
    let updateQuery;

    before(async () => {
        const app = express();
        // Give each request a documentation-only IP so the shared production limiter
        // does not throttle the independent test cases.
        app.set('trust proxy', 1);
        app.use(express.json());
        app.use('/api/client', require('../routes/client'));
        server = await new Promise((resolve) => {
            const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        });
        origin = `http://127.0.0.1:${server.address().port}/api/client`;
    });

    after(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    beforeEach((context) => {
        context.mock.method(console, 'error', () => {});
        context.mock.method(Client, 'findById', () => {
            readQuery = profileQuery(profile);
            return readQuery;
        });
        context.mock.method(Client, 'find', () => {
            listQuery = profileQuery([profile]);
            return listQuery;
        });
        context.mock.method(Client, 'findByIdAndUpdate', () => {
            updateQuery = profileQuery(profile);
            return updateQuery;
        });
    });

    async function request(path, body) {
        const response = await fetch(`${origin}${path}`, {
            method: body === undefined ? 'GET' : 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${++requestNumber}` },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        return { status: response.status, body: await response.json() };
    }

    test('GET rejects malformed ids before a database lookup', async () => {
        assertSafeError(await request('/invalid-id'), 400, 'INVALID_CLIENT_ID');
        assert.equal(Client.findById.mock.callCount(), 0);
    });

    test('GET returns one JSON 404 response for a missing client', async () => {
        Client.findById.mock.mockImplementation(() => profileQuery(null));
        assertSafeError(await request(`/${clientId}`), 404, 'CLIENT_NOT_FOUND');
        assert.equal(Client.findById.mock.callCount(), 1);
    });

    test('GET reports database failures without leaking their details', async () => {
        Client.findById.mock.mockImplementation(() => failedQuery(new Error('private database connection details')));
        assertSafeError(await request(`/${clientId}`), 500, 'CLIENT_READ_FAILED');
    });

    test('GET retains profile shape and virtual id while excluding credentials', async () => {
        const result = await request(`/${clientId}`);
        assert.equal(result.status, 200);
        assertSafeProfile(result.body);
        for (const field of credentialFields) assert.ok(readQuery.getProjection().split(' ').includes(`-${field}`));
        assert.deepEqual(Client.findById.mock.calls[0].arguments, [clientId]);
    });

    test('GET list excludes credentials while preserving the existing array response', async () => {
        const result = await request('');
        assert.equal(result.status, 200);
        assert.equal(result.body.length, 1);
        assertSafeProfile(result.body[0]);
        for (const field of credentialFields) assert.ok(listQuery.getProjection().split(' ').includes(`-${field}`));
    });

    test('PUT rejects malformed ids and array bodies before querying the database', async () => {
        assertSafeError(await request('/invalid-id', { name: 'Name' }), 400, 'INVALID_CLIENT_ID');
        assertSafeError(await request(`/${clientId}`, []), 400, 'CLIENT_VALIDATION_FAILED');
        assert.equal(Client.findById.mock.callCount(), 0);
        assert.equal(Client.findByIdAndUpdate.mock.callCount(), 0);
    });

    test('PUT missing client returns JSON 404 without attempting an update', async () => {
        Client.findById.mock.mockImplementation(() => profileQuery(null));
        assertSafeError(await request(`/${clientId}`, { name: 'Name' }), 404, 'CLIENT_NOT_FOUND');
        assert.equal(Client.findByIdAndUpdate.mock.callCount(), 0);
    });

    test('PUT maps duplicate email, phone, and national code to field-specific conflicts', async () => {
        const messages = new Set();
        for (const field of ['email', 'phone', 'nationalCode']) {
            Client.findByIdAndUpdate.mock.mockImplementation(() => failedQuery(Object.assign(new Error('private duplicate value'), {
                code: 11000, keyPattern: { [field]: 1 }, keyValue: { [field]: 'private duplicate value' }
            })));
            const result = await request(`/${clientId}`, { [field]: 'value' });
            assertSafeError(result, 409, 'DUPLICATE_FIELD');
            assert.equal(result.body.field, field);
            messages.add(result.body.message);
        }
        assert.equal(messages.size, 3);
    });

    test('PUT supports duplicate errors containing only keyValue metadata', async () => {
        Client.findByIdAndUpdate.mock.mockImplementation(() => failedQuery(Object.assign(new Error('private duplicate'), {
            code: 11000, keyValue: { email: 'private@example.test' }
        })));
        const result = await request(`/${clientId}`, { email: 'client@example.test' });
        assertSafeError(result, 409, 'DUPLICATE_FIELD');
        assert.equal(result.body.field, 'email');
    });

    test('PUT enables model validators, omits unsent password, and projects its response', async () => {
        const result = await request(`/${clientId}`, { name: profile.name, englishName: profile.englishName });
        assert.equal(result.status, 200);
        assertSafeProfile(result.body);
        const [id, update, options] = Client.findByIdAndUpdate.mock.calls[0].arguments;
        assert.equal(id, clientId);
        assert.deepEqual(options, { new: true, runValidators: true });
        assert.equal(update.$set.name, profile.name);
        assert.equal(update.$set.englishName, profile.englishName);
        assert.equal(Object.hasOwn(update.$set, 'password'), false);
        assert.equal(Object.hasOwn(update.$set, 'phone'), false);
        assert.equal(Object.hasOwn(update.$set, 'email'), false);
        assert.equal(readQuery.getProjection(), '_id');
        for (const field of credentialFields) assert.ok(updateQuery.getProjection().split(' ').includes(`-${field}`));
    });

    test('PUT hashes an explicitly supplied new password and still excludes it from the response', async () => {
        const result = await request(`/${clientId}`, { password: 'new-test-password' });
        assert.equal(result.status, 200);
        assertSafeProfile(result.body);
        const update = Client.findByIdAndUpdate.mock.calls[0].arguments[1];
        assert.notEqual(update.$set.password, 'new-test-password');
        assert.equal(await bcrypt.compare('new-test-password', update.$set.password), true);
    });

    test('PUT maps schema validation and cast failures to safe JSON 400 responses', async () => {
        for (const name of ['ValidationError', 'CastError']) {
            Client.findByIdAndUpdate.mock.mockImplementation(() => failedQuery(Object.assign(new Error('private invalid value'), { name })));
            assertSafeError(await request(`/${clientId}`, { name: '' }), 400, 'CLIENT_VALIDATION_FAILED');
        }
    });

    test('PUT maps lookup and update database failures to safe JSON 500 responses', async () => {
        Client.findById.mock.mockImplementation(() => failedQuery(new Error('private database failure')));
        assertSafeError(await request(`/${clientId}`, { name: 'Name' }), 500, 'CLIENT_UPDATE_FAILED');
        assert.equal(Client.findByIdAndUpdate.mock.callCount(), 0);
        Client.findById.mock.mockImplementation(() => profileQuery(profile));
        Client.findByIdAndUpdate.mock.mockImplementation(() => failedQuery(new Error('private database failure')));
        assertSafeError(await request(`/${clientId}`, { name: 'Name' }), 500, 'CLIENT_UPDATE_FAILED');
    });

    test('PUT handles a client disappearing between lookup and update as a JSON 404', async () => {
        Client.findByIdAndUpdate.mock.mockImplementation(() => profileQuery(null));
        assertSafeError(await request(`/${clientId}`, { name: 'Name' }), 404, 'CLIENT_NOT_FOUND');
    });
});
