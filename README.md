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