require('dotenv').config();
const nodemailer = require('nodemailer');

const user = process.env.SMTP_USER || process.env.GMAIL_USER;
const pass = process.env.SMTP_PASS || process.env.GMAIL_PASS;
const host = process.env.SMTP_HOST || (user && pass ? 'smtp.gmail.com' : undefined);
let port;
if (process.env.SMTP_PORT) {
    port = parseInt(process.env.SMTP_PORT);
} else if (!process.env.SMTP_HOST && user && pass) {
    port = 587;
} else {
    port = 465;
}

console.log('Host:', host);
console.log('Port:', port);
console.log('User:', user ? `Defined (len=${user.length})` : 'Undefined');
console.log('Pass:', pass ? `Defined (len=${pass.length})` : 'Undefined');

if (!user || !pass || !host) {
    console.error('Missing SMTP config in .env');
    process.exit(1);
}

const transporter = nodemailer.createTransport({
    host: host,
    port: port,
    secure: port === 465,
    auth: {
        user: user,
        pass: pass
    }
});

const mailOptions = {
    from: `"Test Script" <${user}>`,
    to: 'contact.mprnl@gmail.com', // Envoi vers votre adresse perso
    subject: 'Test Email from Server (Gmail SMTP)',
    text: 'Si vous recevez ceci, la configuration SMTP Gmail fonctionne !'
};

transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        console.log('Error occurred:', error);
    } else {
        console.log('Email sent:', info.response);
    }
});
