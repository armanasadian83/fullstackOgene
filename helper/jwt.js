var { expressjwt: jwt } = require("express-jwt");

function authJwt() {
    const secret = process.env.JSON_WEB_TOKEN_SECRET_KEY;
    return jwt({ secret: secret, algorithms: ["HS256"]}).unless({
        path: [
            // Public routes that don't need authentication
            '/api/user/signup',
            '/api/user/signin',
            '/api/user',
            /\/api\/user\/.*/, 

        ]
    });
}

module.exports = authJwt