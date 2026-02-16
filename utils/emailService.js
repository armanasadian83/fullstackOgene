const http = require('http');
//const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// configure the SMTP transporter
/*const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // for Gmail
    port: 465,
    secure: true, // true for port 465
    auth: {
        user: process.env.EMAIL, // your SMTP username
        pass: process.env.EMAIL_PASS // your SMTP password
    },
});*/


// function to send email
async function sendEmail(to, subject, text, html){ 
    /*try{
        const info = await transporter.sendMail({
            from: process.env.EMAIL,  // sender address
            to,
            subject,
            text,
            html,
        });
        return {success: true, messageId: info.messageId};
    } catch (error) {
        console.error('Error sending email:', error);
        return {success: false, error: error.message};
    }*/
    try {
        const { data, error } = await resend.emails.send({
          from: process.env.MAIL_FROM,   // e.g. no-reply@yourdomain.com
          to,
          subject,
          text,
          html,
        });
        if (error) throw error;
        return { success: true, id: data?.id };
    } catch (err) {
        console.error('Email error:', err);
        return { success: false, error: err.message };
    }
}

module.exports = {sendEmail};