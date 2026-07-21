# API Documentation

## Base URL

```
https://your-domain.com/api/v1
```

For local development:
```
http://localhost:3001/api/v1
```

---

## Authentication

The API uses two authentication methods depending on the use case.

### 1. API Key (for external integrations)

Used by schools and third-party systems to call the `/ask` endpoint. API keys are issued by the platform admin.

```
Authorization: Bearer sk-kh-<your-key>
```

### 2. JWT Bearer Token (for the web app and admin panel)

Obtained by logging in. Access tokens expire in **4 hours**. Use the refresh token to get a new one.

```
Authorization: Bearer <access-token>
```

---

## Response Format

All responses follow this structure:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message here"
}
```

---

---

# External Integration (API Key)

> This is the main endpoint for schools integrating the system into their own platforms (Moodle, websites, apps, etc.).

---

## POST `/ask`

Ask a question and get an answer grounded in the school's uploaded documents.

**Auth:** API Key required (`Authorization: Bearer sk-kh-...`)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `question` | string | Yes | The question to ask |
| `language` | string | No | Response language: `en`, `si`, `ta`, `ar`, `auto`. Defaults to `en`. Use `auto` for automatic detection. |
| `mode` | string | No | `grounded` (answers only from documents) or `general` (uses AI general knowledge). Defaults to `grounded`. |

**Example request:**
```bash
curl -X POST https://your-domain.com/api/v1/ask \
  -H "Authorization: Bearer sk-kh-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are the requirements for A/L Biology?",
    "language": "en",
    "mode": "grounded"
  }'
```

**Example response:**
```json
{
  "answer": "A/L Biology requires students to complete three core units...",
  "sources": [
    {
      "document": "Biology Syllabus 2024",
      "page": 12,
      "excerpt": "Core units include Cell Biology, Genetics and..."
    }
  ],
  "isGrounded": true
}
```

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `answer` | string | The AI-generated answer |
| `sources` | array | Documents and pages the answer was drawn from |
| `isGrounded` | boolean | `true` if answer is based on uploaded documents, `false` if no relevant content was found |

**Error responses:**

| Status | Meaning |
|---|---|
| `401` | Missing or invalid API key |
| `400` | Missing `question` field |
| `500` | Internal server error |

---

**Sinhala example:**
```json
{
  "question": "A/L ජීව විද්‍යාවේ අවශ්‍යතා මොනවාද?",
  "language": "si"
}
```

**Tamil example:**
```json
{
  "question": "A/L உயிரியலுக்கான தேவைகள் என்ன?",
  "language": "ta"
}
```

**Auto-detect example:**
```json
{
  "question": "உயிரியல் பாடத்திட்டம் என்ன?",
  "language": "auto"
}
```
The system will detect the language and respond in Tamil automatically.

---

---

# Authentication Endpoints

---

## POST `/auth/login`

Log in with email and password. Returns JWT tokens.

**Auth:** None required

**Request body:**
```json
{
  "email": "admin@school.lk",
  "password": "yourpassword"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "admin@school.lk",
      "fullName": "School Admin",
      "role": "ADMIN",
      "isActive": true
    },
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "deaf555d..."
    }
  }
}
```

---

## POST `/auth/register`

Register a new user account. New accounts are pending approval until an admin approves them.

**Auth:** None required

**Request body:**
```json
{
  "email": "student@school.lk",
  "password": "password123",
  "fullName": "Student Name"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Registration successful. Your account is pending approval."
  }
}
```

---

## POST `/auth/refresh`

Get a new access token using a refresh token.

**Auth:** None required

**Request body:**
```json
{
  "refreshToken": "deaf555d..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "newtoken..."
  }
}
```

---

## POST `/auth/logout`

Revoke the current refresh token.

**Auth:** JWT required

**Request body:**
```json
{
  "refreshToken": "deaf555d..."
}
```

---

## GET `/auth/me`

Get the currently logged-in user's profile.

**Auth:** JWT required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "admin@school.lk",
    "fullName": "School Admin",
    "role": "ADMIN",
    "tenantId": "uuid-or-null"
  }
}
```

---

---

# Knowledge / Q&A Endpoints

> These require a **JWT Bearer token** (logged-in users). For machine-to-machine access use the `/ask` endpoint with an API key instead.

---

## POST `/knowledge/ask`

Ask a question with full chat history support.

**Auth:** JWT required

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `question` | string | Yes | The question |
| `history` | array | No | Previous messages for context |
| `language` | string | No | `en`, `si`, `ta`, `ar`, `auto` |
| `mode` | string | No | `grounded` or `general` |

**Request body example:**
```json
{
  "question": "Can you explain that in more detail?",
  "language": "en",
  "mode": "grounded",
  "history": [
    { "role": "user", "content": "What is photosynthesis?" },
    { "role": "assistant", "content": "Photosynthesis is the process..." }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "answerId": "uuid",
    "questionId": "uuid",
    "answerText": "Photosynthesis involves two main stages...",
    "isGrounded": true,
    "sources": [
      {
        "id": "uuid",
        "documentId": "uuid",
        "pageNumber": 45,
        "excerpt": "The light-dependent reactions occur in...",
        "relevanceScore": 0.92,
        "sourceDocument": {
          "title": "A/L Biology Textbook",
          "originalFilename": "biology_textbook.pdf",
          "storedFilename": "biology_textbook.pdf"
        }
      }
    ],
    "images": [
      {
        "id": "uuid",
        "url": "https://res.cloudinary.com/...",
        "description": "Figure 3.2 - Chloroplast structure",
        "pageNumber": 45
      }
    ]
  }
}
```

---

## POST `/knowledge/search`

Search the knowledge base without generating a full answer. Returns raw matching chunks.

**Auth:** JWT required

**Query params:**
- `?fast=true` — faster search, skips reranking (good for typeahead/suggestions)

**Request body:**
```json
{
  "query": "photosynthesis light reactions"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "title": "Biology Textbook",
        "pageNumber": 45,
        "text": "The light-dependent reactions occur in the thylakoid membrane...",
        "score": 0.89
      }
    ],
    "images": []
  }
}
```

---

---

# Admin Endpoints

> All admin endpoints require a JWT with `role: ADMIN`.

---

## Institution (Tenant) Management

### POST `/tenants`

Create a new institution.

**Request body:**
```json
{
  "name": "Royal College Colombo",
  "slug": "royal-college-colombo"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Royal College Colombo",
    "slug": "royal-college-colombo",
    "isActive": true,
    "createdAt": "2026-05-09T12:00:00Z"
  }
}
```

---

### GET `/tenants`

List all institutions with user, document, and question counts.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Royal College Colombo",
      "slug": "royal-college-colombo",
      "isActive": true,
      "_count": { "users": 120, "documents": 45, "questions": 3200 }
    }
  ]
}
```

---

### GET `/tenants/:id`

Get a single institution's details.

---

### PATCH `/tenants/:id`

Update institution name or active status.

**Request body:**
```json
{
  "name": "Royal College",
  "isActive": true
}
```

---

### POST `/tenants/:id/users/:userId`

Assign a user to an institution.

---

### DELETE `/tenants/:id/users/:userId`

Remove a user from an institution (sets their tenantId to null).

---

### GET `/tenants/:id/users`

List all users belonging to an institution.

---

## API Key Management

### POST `/admin/api-keys`

Issue a new API key. The raw key is **returned once only** — store it immediately.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | A label for this key, e.g. `"Moodle — Royal College"` |
| `tenantId` | string (UUID) | No | The institution this key is scoped to. If omitted, the key searches all documents. |
| `expiresAt` | string (ISO date) | No | Expiry date. If omitted, the key never expires. |

**Request body example:**
```json
{
  "name": "Moodle Integration — Royal College",
  "tenantId": "uuid-of-institution",
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "keyPrefix": "sk-kh-816e9405",
    "name": "Moodle Integration — Royal College",
    "tenantId": "uuid",
    "expiresAt": null,
    "createdAt": "2026-05-09T12:00:00Z",
    "rawKey": "sk-kh-<48-hex-chars-shown-once-at-creation>"
  }
}
```

> **Important:** `rawKey` is only returned at creation time. It is not stored and cannot be retrieved later. Save it immediately.

---

### GET `/admin/api-keys`

List all API keys. Only shows prefix (first 14 chars) and metadata — never the raw key.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "keyPrefix": "sk-kh-816e9405",
      "name": "Moodle Integration — Royal College",
      "tenantId": "uuid",
      "isActive": true,
      "lastUsedAt": "2026-05-09T14:22:00Z",
      "requestCount": 1482,
      "expiresAt": null,
      "tenant": { "name": "Royal College Colombo", "slug": "royal-college-colombo" }
    }
  ]
}
```

---

### DELETE `/admin/api-keys/:id`

Revoke an API key. It will immediately stop working.

---

### POST `/admin/api-keys/:id/rotate`

Revoke the old key and issue a new one with the same name and tenant. Returns the new `rawKey` once.

---

## User Management

### GET `/admin/users`

List all users.

### POST `/admin/users`

Create a new user.

**Request body:**
```json
{
  "email": "user@school.lk",
  "password": "password123",
  "fullName": "User Name",
  "role": "CLIENT"
}
```

### POST `/admin/users/:id/approve`

Approve a pending user registration.

### PATCH `/admin/users/:id/toggle-status`

Toggle a user's active/inactive status.

---

## Analytics

### GET `/admin/stats`

Dashboard statistics — total documents, chunks, questions, active users.

### GET `/admin/question-analytics`

Question trends for the last 30 days — volume, top questions, knowledge gaps, top users.

---

## AI Provider Settings

### GET `/admin/settings/ai-provider`

Get the current AI provider setting.

**Response:**
```json
{
  "success": true,
  "data": { "provider": "auto" }
}
```

### PUT `/admin/settings/ai-provider`

Change the AI provider.

**Request body:**
```json
{
  "provider": "gemini"
}
```

Valid values: `auto`, `openai`, `gemini`, `groq`

- `auto` — OpenAI first, Gemini fallback, Groq fallback
- `openai` — Force OpenAI only
- `gemini` — Force Gemini only (recommended for Sinhala/Tamil heavy usage)
- `groq` — Force Groq only (fastest, most cost-effective)

---

---

# Language Support

| Code | Language | Script | AI Provider Used |
|---|---|---|---|
| `en` | English | Latin | OpenAI (auto) |
| `ar` | Arabic | Arabic (RTL) | OpenAI (auto) |
| `si` | Sinhala | Sinhala | Gemini (preferred) |
| `ta` | Tamil | Tamil | Gemini (preferred) |
| `auto` | Auto-detect | — | Detected then routed |

---

# Error Reference

| HTTP Status | Meaning |
|---|---|
| `400` | Bad request — missing or invalid fields |
| `401` | Unauthorized — missing, invalid, or expired token/key |
| `403` | Forbidden — insufficient role permissions |
| `404` | Resource not found |
| `429` | Rate limited — too many requests |
| `500` | Internal server error |
| `503` | AI provider unavailable — all providers rate-limited |

---

# Rate Limits

- Auth endpoints (`/login`, `/register`, `/refresh`): **10 requests / 15 minutes** per IP
- All other endpoints: no hard rate limit currently (planned per API key in a future release)

---

# Quick Start for Schools

**1. Contact the platform admin to get your API key and institution ID.**

**2. Test your key:**
```bash
curl -X POST https://your-domain.com/api/v1/ask \
  -H "Authorization: Bearer sk-kh-YOUR-KEY-HERE" \
  -H "Content-Type: application/json" \
  -d '{"question": "Hello, is this working?"}'
```

**3. Integrate into your system** using the `/ask` endpoint. Each question costs one API call and returns a grounded answer from your school's uploaded documents only.

**4. Use `language: "auto"`** if your students ask in mixed languages (English + Sinhala or Tamil). The system detects automatically.

---

# Changelog

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-05-09 | Initial release — `/ask` with API key auth, multi-tenant isolation, Sinhala/Tamil support |
