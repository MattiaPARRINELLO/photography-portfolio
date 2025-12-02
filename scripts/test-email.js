require('dotenv').config();
const nodemailer = require('nodemailer');

const user = process.env.GMAIL_USER;
const pass = process.env.GMAIL_PASS;

console.log('User:', user ? 'Defined' : 'Undefined');
console.log('Pass:', pass ? 'Defined' : 'Undefined');

if (!user || !pass) {
    console.error('Missing GMAIL_USER or GMAIL_PASS in .env');
    process.exit(1);
}

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: user,
        pass: pass
    },
    tls: {
        // Nécessaire car l'hébergeur intercepte la connexion SSL et présente son propre certificat
        rejectUnauthorized: false
    }
});

const mailOptions = {
    from: user,
    to: user, // Send to self
    subject: 'Test Email from Server',
    text: 'If you receive this, sending emails works from the server.'
};

transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        console.log('Error occurred:', error);
    } else {
        console.log('Email sent:', info.response);
    }
});
