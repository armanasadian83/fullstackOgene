const CHECKOUT_LIMITS = Object.freeze({
    firstName: 80,
    lastName: 80,
    firstNameLatin: 100,
    lastNameLatin: 100,
    nationalId: 10,
    phone: 11,
    address: 2000,
    postalCode: 10,
    city: 100,
    notes: 2000
});

function normalizeDigits(value) {
    return value.replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : 0x6f0)));
}

function validateCheckoutDetails(body) {
    const details = {};
    const errors = {};
    const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};

    for (const [field, maxLength] of Object.entries(CHECKOUT_LIMITS)) {
        const raw = source[field];
        if (field === 'notes' && (raw === undefined || raw === null)) {
            details[field] = '';
            continue;
        }
        if (typeof raw !== 'string') {
            errors[field] = 'این فیلد را به صورت متن وارد کنید.';
            continue;
        }

        let value = raw.trim();
        if (['nationalId', 'phone', 'postalCode'].includes(field)) {
            value = normalizeDigits(value).replace(/[\s-]/g, '');
        }
        details[field] = value;
        if (field !== 'notes' && !value) {
            errors[field] = 'تکمیل این فیلد الزامی است.';
        } else if (value.length > maxLength) {
            errors[field] = `حداکثر ${maxLength} کاراکتر مجاز است.`;
        } else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
            errors[field] = 'متن واردشده معتبر نیست.';
        }
    }

    for (const field of ['firstName', 'lastName']) {
        if (!errors[field] && !/^[\p{L}\p{M}]+(?:[ \u200c'’\-][\p{L}\p{M}]+)*$/u.test(details[field])) {
            errors[field] = 'نام را فقط با حروف وارد کنید.';
        }
    }
    for (const field of ['firstNameLatin', 'lastNameLatin']) {
        if (!errors[field] && !/^[A-Za-z]+(?:[ '’\-][A-Za-z]+)*$/.test(details[field])) {
            errors[field] = 'نام را با حروف لاتین وارد کنید.';
        }
    }
    if (!errors.nationalId && !/^\d{10}$/.test(details.nationalId)) {
        errors.nationalId = 'کد ملی باید ۱۰ رقم باشد.';
    }
    if (!errors.phone && !/^09\d{9}$/.test(details.phone)) {
        errors.phone = 'شماره تماس معتبر با ۰۹ وارد کنید.';
    }
    if (!errors.postalCode && !/^\d{10}$/.test(details.postalCode)) {
        errors.postalCode = 'کد پستی باید ۱۰ رقم باشد.';
    }

    return { details, errors };
}

function snapshotsMatch(checkout, payment) {
    const sortedIds = (ids) => (ids || []).map(String).sort();
    const sortedItems = (items) => (items || []).map((item) => JSON.stringify({
        productId: String(item.productId),
        productTitle: item.productTitle,
        quantity: item.quantity,
        price: item.price,
        subTotal: item.subTotal,
        typeCourse: item.typeCourse,
        image: item.image || ''
    })).sort();

    return checkout.totalToman === payment.amountToman
        && JSON.stringify(sortedIds(checkout.cartItemIds)) === JSON.stringify(sortedIds(payment.cartItemIds))
        && JSON.stringify(sortedItems(checkout.items)) === JSON.stringify(sortedItems(payment.items));
}

module.exports = { CHECKOUT_LIMITS, normalizeDigits, validateCheckoutDetails, snapshotsMatch };
