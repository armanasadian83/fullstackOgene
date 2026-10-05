/**
 * کلاینت درگاه سامان (SEP) - مستند نگارش 3.6
 * نیاز به Node 18+ (fetch داخلی)
 *
 * متغیرهای محیطی:
 *   SEP_TERMINAL_ID       (اجباری)
 *   PAYMENT_CALLBACK_URL  (اجباری) آدرس کامل endpoint بک‌اند که سامان کاربر را با POST به آن برمی‌گرداند
 *   SEP_TOKEN_URL         (اختیاری)
 *   SEP_PAYMENT_URL       (اختیاری) آدرس صفحه پرداخت. اگر ترمینال neo-pg باشد از هدر X-IPG-Url خوانده می‌شود
 *   SEP_VERIFY_URL        (اختیاری)
 *   SEP_REVERSE_URL       (اختیاری)
 */

const cfg = () => ({
    terminalId: process.env.SEP_TERMINAL_ID,
    callbackUrl: process.env.PAYMENT_CALLBACK_URL,
    tokenUrl: process.env.SEP_TOKEN_URL || 'https://sep.shaparak.ir/onlinepg/onlinepg',
    paymentUrl: process.env.SEP_PAYMENT_URL || 'https://sep.shaparak.ir/OnlinePG/OnlinePG',
    verifyUrl: process.env.SEP_VERIFY_URL || 'https://sep.shaparak.ir/verifyTxnRandomSessionkey/ipg/VerifyTransaction',
    reverseUrl: process.env.SEP_REVERSE_URL || 'https://sep.shaparak.ir/verifyTxnRandomSessionkey/ipg/ReverseTransaction'
});

async function postJson(url, body, timeoutMs = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctrl.signal
        });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch (_) { /* غیر JSON */ }
        return { httpStatus: res.status, headers: res.headers, data, text };
    } finally {
        clearTimeout(timer);
    }
}

/** مرحله ۱: دریافت توکن. مبلغ باید «ریال» و عدد صحیح باشد. */
async function requestToken({ amountRial, resNum, cellNumber }) {
    const c = cfg();
    const body = {
        action: 'token',
        TerminalId: String(c.terminalId),
        Amount: amountRial,
        ResNum: resNum,
        RedirectUrl: c.callbackUrl
    };
    if (cellNumber) body.CellNumber = cellNumber;

    const r = await postJson(c.tokenUrl, body);

    if (r.data && r.data.status === 1 && r.data.token) {
        return {
            ok: true,
            token: r.data.token,
            // ترمینال neo-pg: آدرس درگاه در هدر پاسخ می‌آید
            paymentUrl: r.headers.get('x-ipg-url') || c.paymentUrl
        };
    }
    return {
        ok: false,
        httpStatus: r.httpStatus,
        errorCode: r.data && r.data.errorCode,
        errorDesc: r.data && r.data.errorDesc,
        raw: r.text && r.text.slice(0, 300)
    };
}

/**
 * verify و reverse هر دو یک بدنه دارند.
 * networkError=true یعنی «جواب سامان به دست ما نرسید» (timeout/شبکه/5xx)
 * فقط در این حالت تلاش مجدد مجاز است؛ ResultCode منفی خطای قطعی است.
 */
async function callTxn(url, refNum) {
    const c = cfg();
    try {
        const r = await postJson(url, { RefNum: refNum, TerminalNumber: Number(c.terminalId) });
        if (!r.data || r.httpStatus >= 500) {
            return { networkError: true, error: `http_${r.httpStatus}` };
        }
        const d = r.data;
        return {
            networkError: false,
            resultCode: d.ResultCode,
            description: d.ResultDescription,
            success: d.Success === true && d.ResultCode === 0,
            detail: d.TransactionDetail || null
        };
    } catch (err) {
        return { networkError: true, error: err.name === 'AbortError' ? 'timeout' : err.message };
    }
}

const verifyTransaction = (refNum) => callTxn(cfg().verifyUrl, refNum);
const reverseTransaction = (refNum) => callTxn(cfg().reverseUrl, refNum);

async function verifyWithRetry(refNum, attempts = 3, delayMs = 2000) {
    let last;
    for (let i = 0; i < attempts; i++) {
        last = await verifyTransaction(refNum);
        if (!last.networkError) return last;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    return last;
}

/** برای اینکه بدانید کدام IP را باید نزد سامان ثبت کنید (در لاگ سرور چاپ می‌شود) */
async function logOutboundIp() {
    try {
        const r = await fetch('https://api.ipify.org?format=json');
        const j = await r.json();
        console.log('[payment] outbound IP of this server:', j.ip);
    } catch (_) {
        console.log('[payment] could not detect outbound IP');
    }
}

module.exports = { requestToken, verifyTransaction, reverseTransaction, verifyWithRetry, logOutboundIp };
