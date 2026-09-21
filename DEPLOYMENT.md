# Deployment checklist

### Backend hosting
Use a Node.js-capable host (for example Render, Railway, Fly.io, VPS, or another
provider that supports Node.js and persistent database storage).

### Environment variables
Set:
- PORT
- SESSION_SECRET
- MPESA_CONSUMER_KEY
- MPESA_CONSUMER_SECRET
- MPESA_SHORTCODE
- MPESA_PASSKEY
- MPESA_CALLBACK_URL
- MPESA_ENV=sandbox or production

### Database
SQLite is suitable for a prototype/small deployment. For scaling, migrate to
PostgreSQL or MySQL.

### Social platforms
The website includes links to major platforms. Automatic publishing/analytics
requires OAuth/API access for each platform and must be implemented server-side.
