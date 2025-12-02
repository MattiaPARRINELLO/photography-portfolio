require('dotenv').config();
const nodemailer = require('nodemailer');

const user = process.env.GMAIL_USER;
const pass = process.env.GMAIL_PASS;

console.log('User:', user ? `Defined (len=${user.length})` : 'Undefined');
console.log('Pass:', pass ? `Defined (len=${pass.length})` : 'Undefined');

if (!user || !pass) {
    console.error('Missing GMAIL_USER or GMAIL_PASS in .env');
    process.exit(1);
}

// Tentative sur le port 465 (SSL implicite) pour voir si ça contourne le proxy
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: user,
        pass: pass
    },
    tls: {
        rejectUnauthorized: false // Toujours nécessaire si interception
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
