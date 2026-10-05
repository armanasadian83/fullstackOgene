const jwt = require('jsonwebtoken');

/**
 * توکن JWT را از هدر Authorization: Bearer <token> می‌خواند.
 * payload توکن شما (در signin) شامل id, phone, email, name, lastName است.
 * بعد از موفقیت: req.user.id = _id کاربر
 */
module.exports = function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

    if (!token) {
        return res.status(401).json({ success: false, message: 'لطفاً ابتدا وارد حساب کاربری خود شوید!' });
    }

    try {
        req.user = jwt.verify(token, process.env.JSON_WEB_TOKEN_SECRET_KEY);
        if (!req.user || !req.user.id) throw new Error('no id in token');
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'نشست شما نامعتبر است. دوباره وارد شوید.' });
    }
};
