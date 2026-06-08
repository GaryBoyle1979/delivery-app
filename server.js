const express = require('express');
const multer  = require('multer');
const path    = require('path');
const cors    = require('cors');
const https   = require('https');
require('dotenv').config();

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const uploadFields = upload.any();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function sendViaSendGrid(toEmail, fromEmail, subject, htmlBody, textBody, attachmentBuffer, attachmentName, mimeType) {
  const attachmentB64 = attachmentBuffer.toString('base64');

  const payload = JSON.stringify({
    personalizations: [{ to: [{ email: toEmail }] }],
    from: { email: fromEmail, name: 'McMonagle Deliveries' },
    subject: subject,
    content: [
      { type: 'text/plain', value: textBody },
      { type: 'text/html',  value: htmlBody  }
    ],
    attachments: [{
      content:     attachmentB64,
      filename:    attachmentName,
      type:        mimeType,
      disposition: 'attachment'
    }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.sendgrid.com',
      port: 443,
      path: '/v3/mail/send',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`SendGrid error ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

app.post('/send-delivery', uploadFields, async (req, res) => {
  try {
    const { orderNumber, timestamp } = req.body;
    const allFiles = req.files || [];
    const photoSigned     = allFiles.find(f => f.fieldname === 'photoSigned')     || null;
    const photoUnattended = allFiles.find(f => f.fieldname === 'photoUnattended') || null;
    const photoSingle     = allFiles.find(f => f.fieldname === 'photo')           || allFiles[0] || null;
    const anyPhoto = photoSigned || photoUnattended || photoSingle;
    if (!orderNumber || !anyPhoto) return res.status(400).json({ ok: false, error: 'Missing order number or photo.' });

    const deliveryTime = timestamp || new Date().toLocaleString('en-IE');
    const photoTypes   = [photoSigned ? 'Signed Docket' : null, photoUnattended ? 'Items on Site' : null, photoSingle ? 'Delivery Photo' : null].filter(Boolean).join(' + ') || 'Delivery Photo';

    const subject  = `Delivery Confirmed — Order ${orderNumber.toUpperCase()} — ${photoTypes}`;
    const textBody = `DELIVERY CONFIRMATION\n${'='.repeat(40)}\n\nOrder Number : ${orderNumber.toUpperCase()}\nPhoto Type   : ${photoTypes}\nDate / Time  : ${deliveryTime}\n\nDelivery photo attached.\n\n— McMonagle Deliveries`;
    const htmlBody = `
      <div style="font-family:sans-serif;max-width:540px;margin:0 auto;">
        <div style="background:#2a2520;padding:20px 24px;">
          <h1 style="color:#f5f0eb;font-size:18px;margin:0;letter-spacing:1px;text-transform:uppercase;">Delivery Confirmed</h1>
          <p style="color:#c9bdb3;font-size:11px;margin:4px 0 0;letter-spacing:2px;text-transform:uppercase;">McMonagle Stone</p>
        </div>
        <div style="background:#f5f0eb;padding:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #c9bdb3;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#8c7b6b;width:130px;">Order Number</td>
              <td style="padding:10px 0;border-bottom:1px solid #c9bdb3;font-size:18px;font-weight:700;color:#2a2520;">${orderNumber.toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #c9bdb3;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#8c7b6b;">Photo Type</td>
              <td style="padding:10px 0;border-bottom:1px solid #c9bdb3;font-size:15px;font-weight:600;color:#2a2520;">${photoTypes}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#8c7b6b;">Date &amp; Time</td>
              <td style="padding:10px 0;font-size:15px;color:#2a2520;">${deliveryTime}</td>
            </tr>
          </table>
          <p style="margin:20px 0 0;font-size:12px;color:#8c7b6b;">Delivery photo attached — see below.</p>
        </div>
        <div style="background:#5c4f43;padding:12px 24px;text-align:center;">
          <p style="color:#c9bdb3;font-size:11px;margin:0;letter-spacing:1px;">McMonagle Stone Delivery System</p>
        </div>
      </div>`;

    await sendViaSendGrid(
      process.env.HEAD_OFFICE_EMAIL,
      process.env.SENDGRID_FROM_EMAIL,
      subject, htmlBody, textBody,
      req.file.buffer, fileName, req.file.mimetype
    );

    console.log(`✓ Email sent via SendGrid | Order: ${orderNumber} | Photos: ${photoTypes}`);
    res.json({ ok: true });

  } catch (err) {
    console.error('SendGrid error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to send email. Please try again or call head office.' });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🪨  McMonagle Delivery Capture running on port ${PORT}`);
  console.log(`   Head office: ${process.env.HEAD_OFFICE_EMAIL || '(not set)'}\n`);
});
