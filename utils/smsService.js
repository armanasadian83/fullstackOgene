// utils/smsService.js
//
// Talks to sms.ir directly via axios, following the official docs exactly:
// https://api.sms.ir/v1/send/verify
//
// We stopped using the "smsir-js" npm wrapper because it was returning a
// raw (circular) http request/response object instead of a parsed JSON
// body, which made real errors impossible to see. Calling the API
// directly avoids that bug entirely.

const axios = require('axios');

const BASE_URL = 'https://api.sms.ir/v1';

class SmsService {
    constructor() {
        this.apiKey = process.env.SMS_IR_API_KEY;
        this.lineNumber = process.env.SMS_IR_LINE_NUMBER; // not needed for /send/verify, kept for SendBulk fallback
        this.templateId = parseInt(process.env.SMS_IR_OTP_TEMPLATE_ID);

        if (!this.apiKey) {
            console.warn('⚠️  SMS_IR_API_KEY is missing from .env');
        }
        if (!this.templateId) {
            console.warn('⚠️  SMS_IR_OTP_TEMPLATE_ID is missing/invalid in .env');
        }
    }

    _headers() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'text/plain',
            'x-api-key': this.apiKey
        };
    }

    _normalizePhone(phone) {
        // sms.ir's /send/verify endpoint wants the mobile WITHOUT the
        // leading 0 and WITHOUT the country code, e.g. "9121234567".
        let p = phone.trim();
        if (p.startsWith('+98')) p = p.slice(3);
        else if (p.startsWith('0098')) p = p.slice(4);
        else if (p.startsWith('98') && p.length > 10) p = p.slice(2);
        if (p.startsWith('0')) p = p.slice(1);
        return p;
    }

    // Primary method: send OTP using the VERIFY template endpoint.
    // paramName defaults to "CODE" to match the template body shown in
    // the sms.ir panel ("#CODE#"). Change this if your template uses a
    // different variable name - it must match EXACTLY, including
    // capitalization.
    async sendOTP(phone, otp, paramName = 'CODE') {
        const mobile = this._normalizePhone(phone);

        const payload = {
            mobile: mobile,
            templateId: this.templateId,
            parameters: [
                { name: paramName, value: String(otp) }
            ]
        };

        console.log('📤 POST', `${BASE_URL}/send/verify`);
        console.log('📤 Payload:', JSON.stringify(payload, null, 2));

        try {
            const response = await axios.post(`${BASE_URL}/send/verify`, payload, {
                headers: this._headers(),
                timeout: 15000
            });

            console.log('📥 Response status (HTTP):', response.status);
            console.log('📥 Response body:', JSON.stringify(response.data, null, 2));

            const body = response.data;

            if (body && body.status === 1) {
                console.log('✅ SMS sent successfully!');
                return {
                    success: true,
                    messageId: body.data?.messageId,
                    phone: phone
                };
            } else {
                throw new Error(body?.message || `Unexpected status: ${body?.status}`);
            }

        } catch (error) {
            const errorMessage = extractErrorMessage(error);
            console.error('❌ SMS Error (sendOTP):', errorMessage);
            if (error.response) {
                console.error('❌ HTTP status:', error.response.status);
                console.error('❌ Response body:', JSON.stringify(error.response.data, null, 2));
            } else if (error.request) {
                console.error('❌ No response received (network/timeout issue). Check connectivity to api.sms.ir.');
            } else {
                console.error('❌ Stack:', error.stack);
            }
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    // Fallback: plain bulk SMS, no template required.
    async sendOTPFallback(phone, otp) {
        const mobile = this._normalizePhone(phone);
        const messageText = `به خانواده اوژن خوش آمدید\nکد ورود شما:\n${otp}`;

        const payload = {
            lineNumber: this.lineNumber,
            messageText: messageText,
            mobiles: [mobile],
            sendDateTime: null
        };

        console.log('📤 POST', `${BASE_URL}/send/bulk`);
        console.log('📤 Payload:', JSON.stringify(payload, null, 2));

        try {
            const response = await axios.post(`${BASE_URL}/send/bulk`, payload, {
                headers: this._headers(),
                timeout: 15000
            });

            console.log('📥 Response status (HTTP):', response.status);
            console.log('📥 Response body:', JSON.stringify(response.data, null, 2));

            const body = response.data;

            if (body && body.status === 1) {
                return {
                    success: true,
                    messageId: body.data?.messageIds?.[0],
                    phone: phone
                };
            } else {
                throw new Error(body?.message || `Unexpected status: ${body?.status}`);
            }

        } catch (error) {
            const errorMessage = extractErrorMessage(error);
            console.error('❌ SMS Error (sendOTPFallback):', errorMessage);
            if (error.response) {
                console.error('❌ HTTP status:', error.response.status);
                console.error('❌ Response body:', JSON.stringify(error.response.data, null, 2));
            } else if (error.request) {
                console.error('❌ No response received (network/timeout issue). Check connectivity to api.sms.ir.');
            } else {
                console.error('❌ Stack:', error.stack);
            }
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    // Quick sanity check: confirms the API key works and shows remaining credit.
    async checkCredit() {
        try {
            const response = await axios.get(`${BASE_URL}/credit`, {
                headers: this._headers(),
                timeout: 15000
            });
            console.log('💳 Credit response:', JSON.stringify(response.data, null, 2));
            return response.data;
        } catch (error) {
            const errorMessage = extractErrorMessage(error);
            console.error('❌ Credit check failed:', errorMessage);
            if (error.response) {
                console.error('❌ HTTP status:', error.response.status);
                console.error('❌ Response body:', JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }
}

function extractErrorMessage(error) {
    if (error.response && error.response.data) {
        const data = error.response.data;
        return data.message || data.error || JSON.stringify(data);
    }
    return error.message || 'Unknown error occurred';
}

module.exports = new SmsService();

