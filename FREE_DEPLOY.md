# Digital Thekedaar — Free Test Deployment

Recommended test host: Render Web Service (free tier).

1. Create a free Render account at https://render.com/.
2. Put this project in a GitHub repository named `digital-thekedaar` (or upload the files to a repo).
3. In Render choose New > Web Service and connect the GitHub repo.
4. Render detects `render.yaml`, or use:
   Build command: `npm install`
   Start command: `npm start`
5. Set environment variables:
   NODE_ENV=production
   ADMIN_EMAIL=<your admin email>
   ADMIN_PASSWORD=<a strong password>
   JWT_SECRET=<generate a long random secret if Render does not generate it automatically>
6. Deploy.
7. Your public test URL will look like `https://digital-thekedaar.onrender.com`.
8. Admin: `https://digital-thekedaar.onrender.com/admin`

IMPORTANT: The current MVP stores data in SQLite. Render's free filesystem is not intended for durable application data, so test registrations may be lost after a restart/redeploy. Before public launch, move the database to a persistent managed database and add a proper production storage setup.
