// ============================================================
//  Stone Delivery Capture — Backend Server
//  Node.js + Express + Nodemailer
//  Receives photo from driver app, emails head office
// ============================================================

const express    = require('express');
const nodemailer = require('nodemailer');
const multer     = require('multer');
const path       = require('path');
const cors       = require('cors');
require('dotenv').config();

const app    = express();
const upload = multer({
  storage: multer.memoryStorage(),   // keep photo in RAM, don't save to disk
  limits: { fileSize: 20 * 1024 * 1024 }  // 20 MB max
});

app.use(cors());
app.use(express.json());

// Serve the front-end (index.html) as a static file
app.use(express.static(path.join(__dirname, 'public')));

// ── Email transporter ────────────────────────────────────────
// Uses SMTP credentials from .env file.
// Works with Gmail, Outlook 365, or any SMTP provider.
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_PORT === '465',   // true for port 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ── Main delivery endpoint ───────────────────────────────────
app.post('/send-delivery', upload.single('photo'), async (req, res) => {
  try {
    const { orderNumber, photoType, timestamp } = req.body;

    // Basic validation
    if (!orderNumber || !req.file) {
      return res.status(400).json({ ok: false, error: 'Missing order number or photo.' });
    }

    const typeLabel    = photoType === 'signed' ? 'Signed Docket' : 'Items on Site (Unattended)';
    const deliveryTime = timestamp || new Date().toLocaleString('en-IE');
    const fileExt      = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
    const fileName     = `delivery-${orderNumber.toUpperCase()}-${Date.now()}.${fileExt}`;

    const mailOptions = {
      from:    `"Delivery Capture" <${process.env.SMTP_USER}>`,
      to:      process.env.HEAD_OFFICE_EMAIL,
      subject: `Delivery Confirmed — Order ${orderNumber.toUpperCase()} — ${typeLabel}`,
      text: [
        'DELIVERY CONFIRMATION',
        '='.repeat(40),
        '',
        `Order Number : ${orderNumber.toUpperCase()}`,
        `Photo Type   : ${typeLabel}`,
        `Date / Time  : ${deliveryTime}`,
        '',
        'Delivery photo is attached to this email.',
        '',
        '— Stone Delivery Capture System',
      ].join('\n'),
      html: `
        <div style="font-family:sans-serif;max-width:540px;margin:0 auto;">
          <div style="background:#2a2520;padding:20px 24px;display:flex;align-items:center;gap:14px;">
            <div style="background:#c8733a;width:36px;height:36px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span style="color:white;font-size:18px;">◆</span>
            </div>
            <div>
              <h1 style="color:#f5f0eb;font-size:18px;margin:0;letter-spacing:1px;text-transform:uppercase;">Delivery Confirmed</h1>
              <p style="color:#c9bdb3;font-size:11px;margin:2px 0 0;letter-spacing:2px;text-transform:uppercase;">Natural Stone Deliveries</p>
            </div>
          </div>
          <div style="background:#f5f0eb;padding:24px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #c9bdb3;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#8c7b6b;width:130px;">Order Number</td>
                <td style="padding:10px 0;border-bottom:1px solid #c9bdb3;font-size:18px;font-weight:700;color:#2a2520;letter-spacing:1px;">${orderNumber.toUpperCase()}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #c9bdb3;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#8c7b6b;">Photo Type</td>
                <td style="padding:10px 0;border-bottom:1px solid #c9bdb3;font-size:15px;font-weight:600;color:#2a2520;">${typeLabel}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#8c7b6b;">Date &amp; Time</td>
                <td style="padding:10px 0;font-size:15px;color:#2a2520;">${deliveryTime}</td>
              </tr>
            </table>
            <p style="margin:20px 0 0;font-size:12px;color:#8c7b6b;">Delivery photo attached — see below.</p>
          </div>
          <div style="background:#5c4f43;padding:12px 24px;text-align:center;">
            <p style="color:#c9bdb3;font-size:11px;margin:0;letter-spacing:1px;">Stone Delivery Capture System</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename:    fileName,
          content:     req.file.buffer,
          contentType: req.file.mimetype,
        }
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log(`✓ Delivery email sent | Order: ${orderNumber} | Type: ${typeLabel}`);
    res.json({ ok: true, message: 'Delivery confirmed and emailed to head office.' });

  } catch (err) {
    console.error('Email send error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to send email. Please try again or call head office.' });
  }
});

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🪨  Stone Delivery Capture server running on port ${PORT}`);
  console.log(`   Head office email: ${process.env.HEAD_OFFICE_EMAIL || '(not set — check .env)'}\n`);
});
