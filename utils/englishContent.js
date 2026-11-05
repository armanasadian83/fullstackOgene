const ENGLISH_FIELDS = Object.freeze({
    product: { nameEn: 500, descriptionEn: 100000, fieldEn: 200, authorNameEn: 500, authorDescriptionEn: 50000 },
    course: { nameEn: 500, descriptionEn: 100000, headlineEn: 50000, aboutTeacherEn: 50000, fieldEn: 200 },
    service: { nameEn: 500, fieldEn: 200 },
    event: { nameEn: 500 },
    gallery: { nameEn: 500, altEn: 2000 }
});

function englishSchemaFields(resource) {
    return Object.fromEntries(Object.entries(ENGLISH_FIELDS[resource]).map(([field, limit]) => [field,
        { type: String, default: '', maxlength: limit }
    ]));
}

// Only supplied English fields participate in an update. Legacy editors cannot
// erase an existing translation by omitting the new fields.
function pickEnglishFields(resource, body = {}) {
    const result = {};
    for (const [field, limit] of Object.entries(ENGLISH_FIELDS[resource])) {
        if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
        const value = body[field];
        const valid = typeof value === 'string' && value.length <= limit;
        if (!valid) {
            const error = new Error('Invalid optional English content');
            error.field = field;
            throw error;
        }
        result[field] = value.trim();
    }
    return result;
}

function validateEnglishContent(resource) {
    return (req, res, next) => {
        try {
            req.englishContent = pickEnglishFields(resource, req.body || {});
            next();
        } catch (error) {
            const message = 'مقدار یا طول یکی از فیلدهای اختیاری انگلیسی معتبر نیست.';
            return res.status(400).json({ success: false, error: true, code: 'INVALID_ENGLISH_CONTENT', field: error.field, message, msg: message });
        }
    };
}

module.exports = { ENGLISH_FIELDS, englishSchemaFields, pickEnglishFields, validateEnglishContent };
