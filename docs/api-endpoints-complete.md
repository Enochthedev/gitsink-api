# GitSink API Endpoints - Complete Reference

**Last Updated:** October 4, 2025  
**API Version:** 1.0.0

This document contains all REST and GraphQL endpoints available in the GitSink platform.

---

## Authentication Methods

- **API Key**: Header `x-api-key: YOUR_API_KEY`
- **JWT Bearer**: Header `Authorization: Bearer YOUR_JWT_TOKEN`

---

## REST API Endpoints

### Authentication (`/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/signup` | Register new user | No |
| POST | `/auth/signin` | Sign in with email/password | No |
| POST | `/auth/password-reset` | Request password reset | No |
| POST | `/auth/password-reset/confirm` | Confirm password reset | No |
| GET | `/auth/profile` | Get user profile | JWT |
| POST | `/auth/api-key/regenerate` | Regenerate API key | JWT |
| POST | `/auth/api-key/revoke` | Revoke API key | JWT |
| GET | `/auth/api-key/stats` | Get API key statistics | JWT (Admin) |
| POST | `/auth/api-key/update-metrics` | Update API key metrics | JWT (Admin) |
| POST | `/auth/github/connect` | Connect GitHub account | JWT |
| POST | `/auth/magic-link/send` | Send magic link email | No |
| POST | `/auth/magic-link/validate` | Validate magic link token | No |
| GET | `/auth/magic-link/stats` | Get magic link statistics | JWT |
| POST | `/auth/magic-link/cleanup` | Cleanup expired tokens | JWT (Admin) |
| POST | `/auth/token/refresh` | Refresh access token | No |
| POST | `/auth/token/revoke` | Revoke specific token | No |
| POST | `/auth/token/revoke-all` | Revoke all user tokens | JWT |
| GET | `/auth/token/stats` | Get token statistics | JWT (Admin) |
| POST | `/auth/token/cleanup` | Cleanup expired tokens | JWT (Admin) |
| GET | `/auth/health` | Auth service health check | No |


### Projects (`/projects`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/projects` | Get all user projects | API Key |
| GET | `/projects/:repoUrl` | Get specific project | API Key |
| POST | `/projects/sync` | Sync single repository | API Key |
| POST | `/projects/sync-all` | Sync all repositories | API Key |

### Optimized Projects (`/v2/projects`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/v2/projects` | Get projects (optimized) | API Key |
| GET | `/v2/projects/:id` | Get project by ID | API Key |
| POST | `/v2/projects/sync` | Sync project (optimized) | API Key |
| POST | `/v2/projects/sync-all` | Sync all (optimized) | API Key |

### Profiles (`/profiles`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/profiles` | Create profile | JWT |
| GET | `/profiles/me` | Get own profile | JWT |
| PUT | `/profiles/me` | Update own profile | JWT |
| PUT | `/profiles/me/settings` | Update profile settings | JWT |
| DELETE | `/profiles/me` | Delete own profile | JWT |
| GET | `/profiles/check-username/:username` | Check username availability | No |
| GET | `/profiles/check-domain/:domain` | Check domain availability | No |
| GET | `/profiles/search` | Search public profiles | No |
| GET | `/profiles/featured` | Get featured profiles | No |
| GET | `/profiles/:username` | Get public profile | No |
| GET | `/profiles/domain/:domain` | Get profile by domain | No |
| GET | `/profiles/themes/presets` | Get theme presets | No |
| PUT | `/profiles/me/theme` | Update profile theme | JWT |
| POST | `/profiles/me/theme/preset` | Apply theme preset | JWT |
| GET | `/profiles/platforms` | Get supported platforms | No |
| PUT | `/profiles/me/social-links` | Update social links | JWT |
| POST | `/profiles/me/social-links` | Add social link | JWT |
| DELETE | `/profiles/me/social-links/:platform` | Delete social link | JWT |
| PUT | `/profiles/me/custom-sections` | Update custom sections | JWT |
| GET | `/profiles/me/statistics` | Get profile statistics | JWT |

