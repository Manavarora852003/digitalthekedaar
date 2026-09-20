# Digital Thekedaar — Ready MVP

A full-stack MVP for **Digital Thekedaar — Labour Chowk, Ab Digital.**

## Included
- Public worker marketplace with search/filter
- Worker registration with skills, experience, rates and location
- Customer registration/login
- Worker login and account foundation
- Verified-worker hiring flow
- Job requests and status tracking API
- Reviews and worker ratings
- Complaints system
- Admin authentication
- Admin dashboard with workers, customers, jobs, reviews, payments, complaints and audit log
- Worker KYC document upload endpoint
- Demo payment record endpoint (not live money)
- SQLite database with WAL mode
- Password hashing, JWT sessions, security headers and rate limiting
- Founder & CEO section for Manav Arora

## Run locally
1. Install Node.js 20+.
2. Open this folder in Terminal.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and change `JWT_SECRET` and `ADMIN_PASSWORD`.
5. Run `npm start`.
6. Open `http://localhost:3000`.
7. Admin: `http://localhost:3000/admin`.

The SQLite database is automatically created at `data/digital-thekedaar.db`.

## Production before taking real users/money
- Deploy behind HTTPS.
- Use a strong random JWT secret and strong admin password.
- Put SQLite on persistent storage or migrate to PostgreSQL.
- Connect a live payment gateway such as Razorpay/Stripe; `/api/payments/demo` is intentionally demo-only.
- Connect an SMS/WhatsApp/email provider for OTP and notifications.
- Add production KYC/privacy/retention policies and restrict document access.
- Configure backups, monitoring, logging and domain email.
- Add legal pages: Terms, Privacy Policy, worker/customer agreement, cancellation/refund policy and grievance contact.
- Review labour, tax, consumer-protection and data-protection requirements with a qualified professional before launch.

## Default admin for first local run
Email: value of `ADMIN_EMAIL` (default `admin@digitalthekedaar.in`)
Password: value of `ADMIN_PASSWORD` (default `ChangeMe123!`)
**Change this immediately.**
