# OGILATOM@ Digital Hub — Full Platform

## Included
- Responsive public website
- Service marketplace
- Customer registration/login
- Service ordering and order IDs
- SQLite database
- Admin dashboard
- Business registration/listing workflow
- Advertising package records
- M-Pesa/Daraja-ready server endpoints
- WhatsApp customer workflow
- Social/business platform links
- API structure for future social OAuth integrations

## Run locally
1. Install Node.js 20+.
2. Open this folder in Terminal/PowerShell.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and change SESSION_SECRET.
5. Run `npm start`.
6. Open http://localhost:3000
7. Admin: http://localhost:3000/admin.html

## Demo admin login
Email: admin@ogilatom.local
Password: ChangeMe123!

CHANGE THIS PASSWORD before any real deployment.

## M-Pesa
The backend contains protected `/api/mpesa/stkpush` and `/api/mpesa/callback` routes.
Real Daraja credentials and a public HTTPS callback URL are required. Never put
consumer secrets/passkeys in frontend JavaScript.

## Production
Use a real hosted database, HTTPS, secure session cookies, password reset,
email/SMS notifications, server-side validation, rate limiting, backups and
proper Daraja callback verification before accepting real payments.
