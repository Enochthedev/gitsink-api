# GitSink API Endpoints Reference

Complete reference for all REST and GraphQL endpoints in the GitSink platform.

**Last Updated:** October 4, 2025  
**API Version:** 1.0.0  
**Base URL:** `https://api.gitsink.de` (production) or `http://localhost:3000` (development)

---

## Table of Contents

1. [Authentication](#authentication)
2. [REST API Endpoints](#rest-api-endpoints)
3. [GraphQL API](#graphql-api)
4. [WebSocket Subscriptions](#websocket-subscriptions)
5. [Rate Limits](#rate-limits)
6. [Error Codes](#error-codes)

---

## Authentication

All authenticated endpoints require one of the following:

- **API Key**: Include in header as `x-api-key: YOUR_API_KEY`
- **JWT Bearer Token**: Include in header as `Authorization: Bearer YOUR_JWT_TOKEN`

---

## REST API Endpoints

### App / Root

#### `GET /`
Get parsed Portfolio markdown (basic health check)
- **Auth:** None
- **Response:** Parsed portfolio data

#### `GET /docs`
Redirect to API documentation
- **Auth:** None
- **Response:** 302 redirect to `/api-docs`

---

### Authentication (`/auth`)

#### `POST /auth/signup`
Register a new user account
