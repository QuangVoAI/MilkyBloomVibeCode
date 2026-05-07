# Rate Limiting Guide

Rate limiting is used to protect the backend from abuse and accidental overload.

## Why It Exists

- Prevents brute-force attacks on login, OTP, and password reset.
- Prevents bots or buggy clients from spamming the API.
- Keeps the server stable when many requests arrive at once.
- Helps one bad screen or one bad script from slowing down everyone else.

## Current Backend Setup

The backend defines several limiters in `backend/src/middlewares/rateLimit.middleware.js`:

- `loginLimiter`
- `registerLimiter`
- `passwordResetLimiter`
- `otpLimiter`
- `apiLimiter`
- `strictApiLimiter`

The app no longer applies a global limiter to all `/api` traffic.
Instead, we attach `strictApiLimiter` only to heavier write or aggregation routes.

## What Should Be Limited

| Route type | Examples | Why |
| --- | --- | --- |
| Login and auth | `/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password` | Protects against brute force and spam |
| OTP flows | `/api/auth/login/verify-otp`, `/api/auth/change-phone/:id/verify` | OTP attempts must be tightly controlled |
| Write actions | `POST`, `PUT`, `PATCH`, `DELETE` on products, users, orders, carts | Prevents abuse and duplicate writes |
| Expensive operations | Uploads, bulk deletes, admin dashboards with heavy aggregation | Protects CPU, DB, and third-party services |

## What Should Be Looser

| Route type | Examples | Why |
| --- | --- | --- |
| Public read routes | `GET /api/products`, `GET /api/categories` | These are normal page loads and can happen often |
| Health checks | `/health` | Used by deployment and monitoring tools |
| Static or cached reads | Image proxy, cached responses | These should stay fast and predictable |

## Best Practice

Use different rules for different traffic:

- Strict limiter for sensitive actions.
- Relaxed limiter for public `GET` endpoints.
- Skip limiter for monitoring routes like `/health`.
- Add caching when a route is read often.

## In This Project

Current production-style setup:

- Auth routes keep their own strict limiters.
- Public `GET` routes stay open and are helped by caching.
- Heavy admin or write routes use `strictApiLimiter` directly.

That means:

- Frontend pages can load product and category data without hitting `429`.
- Login, register, OTP, and password reset still keep protection.
- Uploads, product CRUD, category CRUD, dashboard aggregation, and order checkout are limited individually.

## Simple Mental Model

- `GET` = "show me data" -> usually lighter protection.
- `POST/PATCH/DELETE` = "change data" -> stronger protection.
- Auth endpoints = strongest protection.
