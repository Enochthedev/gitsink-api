---
description: Database Schema Changes and Migration Workflow
---
# Database Migration Workflow

When modifying the database schema (`prisma/schema.prisma`), follow this workflow to ensure changes are properly tracked and applied.

## 1. Modify Schema
Edit `prisma/schema.prisma` with your changes.

## 2. Create Migration
Create a new migration file. This will generate SQL files and apply them to your local database.

```bash
# Replace "name_of_change" with a descriptive name (e.g., "add_user_settings")
npx prisma migrate dev --name name_of_change
```

> **Note:** Do NOT use `prisma db push` for schema changes in this project. Always use `prisma migrate dev` to generate migration history.

## 3. Verify Migration
Check the `prisma/migrations` directory to ensure the new migration folder and `migration.sql` file are created.

## 4. Commit Changes
Commit the `prisma/schema.prisma` and the new `prisma/migrations` folder.

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "chore: database migration for [feature]"
```

## 5. Deployment
On deployment (e.g., Railway), the start command or build process should run `prisma migrate deploy` to apply pending migrations. Default behavior checks `NODE_ENV`.

```bash
# In production
npx prisma migrate deploy
```
