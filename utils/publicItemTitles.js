const { Course } = require('../models/course');
const { Product } = require('../models/products');
const { Event } = require('../models/event');

const plain = (value) => value && typeof value.toJSON === 'function' ? value.toJSON() : { ...value };

async function enrichItemTitles(items = []) {
    const result = items.map(plain);
    const ids = (typeCourse) => [...new Set(result.filter((item) => Boolean(item.typeCourse) === typeCourse
        && /^[a-f\d]{24}$/i.test(String(item.productId))).map((item) => String(item.productId)))];
    const courseIds = ids(true);
    const productIds = ids(false);
    try {
        const [courses, products] = await Promise.all([
            courseIds.length ? Course.find({ _id: { $in: courseIds } }).select('_id nameEn').lean() : [],
            productIds.length ? Product.find({ _id: { $in: productIds } }).select('_id nameEn').lean() : []
        ]);
        const courseNames = new Map(courses.map((item) => [String(item._id), item.nameEn]));
        const productNames = new Map(products.map((item) => [String(item._id), item.nameEn]));
        for (const item of result) {
            const nameEn = (item.typeCourse ? courseNames : productNames).get(String(item.productId));
            if (typeof nameEn === 'string' && nameEn.trim()) item.productTitleEn = nameEn;
        }
    } catch (error) {
        // Translation display must not prevent cart/checkout/order reads.
        console.error('[content] English item titles unavailable:', error.name);
    }
    return result;
}

async function enrichOrderTitles(orders = []) {
    const result = orders.map(plain);
    const titles = await enrichItemTitles(result.flatMap((order) => order.items || []));
    let offset = 0;
    return result.map((order) => {
        const length = (order.items || []).length;
        const items = titles.slice(offset, offset + length);
        offset += length;
        return { ...order, items };
    });
}

async function enrichCatalogEvents(records = []) {
    const result = records.map(plain);
    const names = [...new Set(result.flatMap((record) => record.event || []).filter((name) => typeof name === 'string' && name))];
    if (!names.length) return result;
    try {
        const events = await Event.find({ name: { $in: names } }).select('name nameEn').lean();
        const translations = new Map(events.map((event) => [event.name, event.nameEn]));
        for (const record of result) {
            const eventEn = (record.event || []).map((name) => translations.get(name) || '');
            if (eventEn.some((name) => name.trim())) record.eventEn = eventEn;
        }
    } catch (error) {
        console.error('[content] English event labels unavailable:', error.name);
    }
    return result;
}

module.exports = { enrichItemTitles, enrichOrderTitles, enrichCatalogEvents };
