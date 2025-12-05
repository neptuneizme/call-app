# AGENTS.md

> A guide for AI coding agents working on this project.

## Project Overview

**call-app** is a real-time video calling application with audio recording, transcription, and AI-powered call summarization capabilities.

### Tech Stack

| Category       | Technology                                      |
| -------------- | ----------------------------------------------- |
| Framework      | Next.js 16 (App Router)                         |
| Language       | TypeScript 5                                    |
| Styling        | Tailwind CSS 4                                  |
| Database       | PostgreSQL with Prisma ORM 7                    |
| Authentication | NextAuth.js 4 (Google & GitHub OAuth)           |
| Real-time      | Socket.IO for signaling, simple-peer for WebRTC |
| Storage        | AWS S3 for audio file uploads                   |
| Data Fetching  | SWR                                             |

---

## Project Structure

```
call-app/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   │   ├── auth/             # NextAuth endpoints
│   │   ├── calls/            # Call management APIs
│   │   └── history/          # Call history API
│   ├── components/           # React components
│   │   └── video-call/       # Video call feature components
│   │       └── hooks/        # Custom React hooks
│   ├── history/              # Call history page
│   └── login/                # Login page
├── lib/                      # Shared utilities
│   ├── auth.ts               # NextAuth configuration
│   ├── db.ts                 # Prisma client setup
│   └── s3.ts                 # AWS S3 utilities
├── prisma/                   # Database schema & migrations
├── server/                   # Socket.IO signaling server
└── types/                    # TypeScript type definitions
```

---

## Key Conventions

### Code Style

- **TypeScript**: Strict mode enabled. Always use proper types, avoid `any`.
- **React**: Functional components with hooks. Use `"use client"` directive for client components.
- **Imports**: Use path alias `@/*` for absolute imports from project root.
- **Naming**:
  - Components: PascalCase (`VideoCall.tsx`)
  - Hooks: camelCase with `use` prefix (`useMediaStream.ts`)
  - API routes: lowercase with hyphens (`route.ts` in descriptive folders)

### File Organization

- Feature-specific components go in `app/components/<feature>/`
- Shared hooks go in `app/components/<feature>/hooks/`
- Utility functions go in `lib/`
- API routes follow Next.js App Router conventions: `app/api/<resource>/route.ts`

---

## Database

### Prisma Commands

```bash
# Generate Prisma Client after schema changes
npx prisma generate

# Create and apply migrations
npx prisma migrate dev --name <migration_name>

# View database in Prisma Studio
npx prisma studio

# Reset database (development only)
npx prisma migrate reset
```

### Key Models

| Model             | Purpose                                     |
| ----------------- | ------------------------------------------- |
| `User`            | User accounts (OAuth via NextAuth)          |
| `Call`            | Video call sessions with status tracking    |
| `CallParticipant` | Links users to calls with join/leave times  |
| `AudioUpload`     | Uploaded audio recordings per user per call |
| `Transcription`   | Whisper transcription results               |
| `CallSummary`     | GPT-generated call summaries                |

### Call Status Flow

```
IN_PROGRESS → AWAITING_UPLOADS → PROCESSING → COMPLETED
                                           ↘ FAILED
```

---

## Authentication

- Uses NextAuth.js with Prisma adapter
- Providers: Google OAuth, GitHub OAuth
- Session strategy: Database sessions
- Protected routes require session check via `getServerSession(authOptions)`

### Required Environment Variables

```env
# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<secret>
GOOGLE_CLIENT_ID=<client_id>
GOOGLE_CLIENT_SECRET=<client_secret>
GITHUB_CLIENT_ID=<client_id>
GITHUB_CLIENT_SECRET=<client_secret>

# Database
DATABASE_URL=postgresql://...

# AWS S3
AWS_REGION=<region>
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>
AWS_S3_BUCKET_NAME=<bucket>
```

### AWS S3 CORS Configuration

Configure your S3 bucket with the following CORS policy to allow client-side uploads:

```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedOrigins": [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://yourdomain.com"
      ],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

---

## Development Commands

```bash
# Install dependencies
npm install

# Start Next.js dev server (port 3000)
npm run dev

# Start Socket.IO server (port 3001)
node server/socket-server.js

# Build for production
npm run build

# Run ESLint
npm run lint
```

---

## API Routes

| Endpoint                             | Method | Purpose                          |
| ------------------------------------ | ------ | -------------------------------- |
| `/api/auth/[...nextauth]`            | \*     | NextAuth handlers                |
| `/api/calls`                         | POST   | Create new call                  |
| `/api/calls/[callId]`                | GET    | Get call details                 |
| `/api/calls/[callId]/join`           | POST   | Join existing call               |
| `/api/calls/[callId]/audio`          | GET    | Get audio for call               |
| `/api/calls/[callId]/presign`        | POST   | Get presigned S3 upload URL      |
| `/api/calls/[callId]/upload`         | POST   | Upload audio recording           |
| `/api/calls/[callId]/confirm-upload` | POST   | Confirm upload completion        |
| `/api/calls/[callId]/process`        | POST   | Trigger AI transcription/summary |
| `/api/calls/[callId]/process`        | GET    | Get processing status            |
| `/api/history`                       | GET    | Get user's call history          |

---

## Real-time Architecture

### Socket.IO Events

| Event          | Direction       | Purpose                              |
| -------------- | --------------- | ------------------------------------ |
| `me`           | Server → Client | Send socket ID to connected user     |
| `callUser`     | Client → Server | Initiate call to another user        |
| `callUser`     | Server → Client | Notify recipient of incoming call    |
| `answerCall`   | Client → Server | Accept incoming call                 |
| `callAccepted` | Server → Client | Notify caller that call was accepted |
| `endCall`      | Client → Server | End the call                         |
| `callEnded`    | Server → Client | Notify that call has ended           |

### WebRTC Flow

1. User A calls User B via Socket.IO signaling
2. simple-peer handles WebRTC peer connection
3. Media streams exchanged directly peer-to-peer
4. Audio recording happens client-side during call
5. On call end, audio uploaded to S3

---

## Important Notes for Agents

1. **Next.js App Router**: This project uses the App Router (not Pages Router). API routes are in `app/api/` with `route.ts` files.

2. **Client vs Server Components**: Components using hooks, browser APIs, or interactivity need `"use client"` directive at the top.

3. **Database Access**: Always use the singleton Prisma client from `@/lib/db` to avoid connection pool exhaustion.

4. **S3 Uploads**: Use presigned URLs for client-side uploads. Never expose AWS credentials to the client.

5. **Socket Server**: Runs separately from Next.js on port 3001. Must be started independently.

6. **Type Safety**: The project uses strict TypeScript. Extend types in `types/` directory when needed (e.g., `next-auth.d.ts` for session types).

7. **Migrations**: After modifying `prisma/schema.prisma`, always run `npx prisma migrate dev` to create migrations.

---

## Common Tasks

### Adding a New API Route

1. Create folder structure: `app/api/<resource>/route.ts`
2. Export HTTP method handlers: `GET`, `POST`, `PUT`, `DELETE`
3. Use `getServerSession(authOptions)` for auth
4. Return `NextResponse.json()` for responses

### Adding a New Component

1. Create file in appropriate `app/components/` subfolder
2. Add `"use client"` if it uses hooks or browser APIs
3. Use Tailwind CSS for styling
4. Import with `@/app/components/...`

### Fetching Data with SWR

Use SWR for client-side data fetching. It provides caching, revalidation, and optimistic updates.

```typescript
"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function MyComponent() {
  const { data, error, isLoading, mutate } = useSWR("/api/endpoint", fetcher);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading data</div>;

  return <div>{/* Use data here */}</div>;
}
```

**SWR Best Practices:**

- Define a shared `fetcher` function in `lib/fetcher.ts` for reuse
- Use `mutate()` to revalidate data after mutations
- Use `useSWRMutation` for POST/PUT/DELETE operations
- Pass options like `{ revalidateOnFocus: false }` when appropriate

### Adding a Database Model

1. Add model to `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <description>`
3. Run `npx prisma generate`
4. Import and use via `@/lib/db`

---

## Troubleshooting

- **Prisma connection issues**: Check `DATABASE_URL` and ensure PostgreSQL is running
- **S3 upload failures**: Verify CORS config on bucket and AWS credentials
- **Socket.IO not connecting**: Ensure socket server is running on port 3001
- **Auth not working**: Check OAuth provider credentials and callback URLs
