## File storage

- `NODE_ENV=development`: uploads course, banner, and notice images to Cloudinary.
- `NODE_ENV=production`: stores those files under `LOCAL_UPLOAD_ROOT` on the server.
- Images are converted to WebP before upload in both modes.

Copy `.env.example` to the environment-specific file and set
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` for
development and preview deployments. Never commit the API secret.

```
npm install
npm run dev
```

```
open http://localhost:3000
```
```
code to db ->
npx cross-env ENV_FILE=.env.development npm run db:generate
npx cross-env ENV_FILE=.env.development npm run db:migrate
```
```
db to code->
npx cross-env ENV_FILE=.env.development drizzle-kit introspect
```

npx npm-check-updates -u
npm install
