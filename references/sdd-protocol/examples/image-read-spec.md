# Image Generation Display & Download: Technical Specification

**Version**: 1.0.0
**Status**: Draft
**Author**: Architect Agent
**Date**: 2026-04-16
**Brief**: `docs/tasks/ongoing/image-generation/image-generation-brief.md`

---

## 1. Overview

### Objective

Enable AI-generated images to appear inline in the chat UI with download capability, by piggybacking on the existing message attachment system. The ZeroClaw agent writes images to a read-write GCS Fuse mount; the agent's response text includes `[GENERATED_IMAGE]` markers; a shared parser extracts these into message attachments with an `isGenerated` flag; the frontend renders them inline with a download icon overlay.

### Constraints

- **Clawcraft-only scope** — ZeroClaw runtime changes (vision_write pipeline, conversationId awareness) are complete and out of scope.
- **Batch image processing** is a follow-up spec — this spec covers image *generation display*, not batch read→transform→write workflows.
- **No new Convex tables** — generated images are stored as attachments on existing `messages` records.
- **No new HTTP endpoints** — the agent does not call back to Convex for image metadata. The marker is embedded in the response text.

### Success Criteria

1. User prompts "generate a lobster" → agent generates image → image appears inline in the assistant message bubble with a download icon.
2. Download icon triggers browser download of the full-resolution image from GCS.
3. Generated images are visually identical to uploaded image attachments except for the download overlay.
4. Works on both WS path (web chat) and relay path (Telegram-sourced messages relayed to web thread).

---

## 2. Scope

| In Scope | Out of Scope |
|----------|--------------|
| GCS Fuse read-write `/media` mount on pods | ZeroClaw runtime changes (already done) |
| `conversationId` tag in WS messages to pod | Batch image processing (follow-up spec) |
| `[GENERATED_IMAGE]` marker parsing | Image regeneration / editing UI |
| `isGenerated` flag on attachment schema | `generated_images` table (eliminated) |
| Download icon on generated image preview | Gallery / carousel view |
| TOOLS.md update for marker convention | AGENTS.md agent registry changes |
| Infra doctrine update (read-write mount) | Terraform / IAM changes (already configured) |

---

## 3. Architecture

### Data Flow

```
User (WS) ──"generate a lobster"──▶ Pod (ZeroClaw)
                                        │
                                        ▼
                                   vision_write agent
                                   generates image
                                        │
                                        ▼
                              /media/{conversationId}/lobster.png
                              (GCS Fuse read-write → GCS bucket)
                                        │
                                        ▼
                              Agent response (WS "done" event):
                              "Here's your lobster!
                               [GENERATED_IMAGE: path=/media/{cid}/lobster.png | mimeType=image/png]"
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
              WS path (useChat)                    Relay path (relay.ts)
              persistAssistant()                   insertAssistantMessage()
                    │                                       │
                    ▼                                       ▼
              parseGeneratedImageMarkers()    parseGeneratedImageMarkers()
              (domain function)               (same domain function)
                    │                                       │
                    ▼                                       ▼
              Convex messages table:
              { content: "Here's your lobster!",
                attachments: [{ gcsPath: "{userId}/media/{cid}/lobster.png",
                                filename: "lobster.png",
                                mimeType: "image/png",
                                size: 0,
                                isGenerated: true }] }
                                        │
                                        ▼
                              Frontend useQuery subscription fires
                              MessageBubble renders image inline
                              with download icon overlay
```

### Key Design Decision: Marker-Based Attachment Injection

> **Insight**: Generated images can be injected into the existing attachment system via text markers in the agent's response, eliminating the need for a separate table, HTTP endpoint, or subscription.

**Why this matters:**

| Approach | Behavior | Problem |
|----------|----------|---------|
| Separate `generated_images` table + webhook | Pod POSTs metadata to Convex after generation | New table, new endpoint, new subscription, timing issues between message and image arrival |
| **Marker in response text (chosen)** | Agent includes `[GENERATED_IMAGE:...]` in response; parser extracts to attachment | Zero new infrastructure; piggybacks on existing message persistence and subscription |

This aligns with the existing `[MEDIA_UPLOAD]` pattern used for user uploads and the `[PERSONA_READY]` pattern used for onboarding extraction.

---

## 4. Data Model Changes

### 4.1 Schema: `messages.attachments` — Add `isGenerated` Flag

**File**: `convex/schema.ts` (line ~141)

Current:
```typescript
attachments: v.optional(
  v.array(
    v.object({
      storageId: v.optional(v.id("_storage")),
      gcsPath: v.optional(v.string()),
      filename: v.string(),
      mimeType: v.string(),
      size: v.number(),
    }),
  ),
),
```

New:
```typescript
attachments: v.optional(
  v.array(
    v.object({
      storageId: v.optional(v.id("_storage")),
      gcsPath: v.optional(v.string()),
      filename: v.string(),
      mimeType: v.string(),
      size: v.number(),
      isGenerated: v.optional(v.boolean()),
    }),
  ),
),
```

- `isGenerated: true` — image was created by the agent (vision_write). Frontend renders download overlay.
- `isGenerated: undefined | false` — user-uploaded attachment. Existing rendering unchanged.
- `size: 0` for generated images (file size unknown at relay time; not displayed in UI for generated images).

### 4.2 GCS Path Convention

Generated images live at:
```
gs://{GCS_USER_DATA_BUCKET}/{userId}/media/{conversationId}/{filename}
```

Examples:
- `jd7abc.../media/k97xyz.../lobster.png`
- `jd7abc.../media/k97xyz.../sunset-over-mountains.png`

The agent chooses a meaningful `filename` (instructed via TOOLS.md). The `conversationId` is the Convex `threadId` passed via the WS `conversationId` tag.

---

## 5. Marker Format

### 5.1 Syntax

```
[GENERATED_IMAGE: path=/media/{conversationId}/{filename} | mimeType={mimeType}]
```

- `path` — workspace-relative path (starts with `/media/`). The parser prepends `{userId}/` to construct the full GCS path.
- `mimeType` — required. One of: `image/png`, `image/jpeg`, `image/webp`.

### 5.2 Examples

Single image:
```
Here's your lobster!
[GENERATED_IMAGE: path=/media/k97xyz/lobster.png | mimeType=image/png]
```

Multiple images in one response:
```
Here are the three designs:
[GENERATED_IMAGE: path=/media/k97xyz/design-a.png | mimeType=image/png]
[GENERATED_IMAGE: path=/media/k97xyz/design-b.png | mimeType=image/png]
[GENERATED_IMAGE: path=/media/k97xyz/design-c.png | mimeType=image/png]
```

### 5.3 Regex

```typescript
const GENERATED_IMAGE_RE = /\[GENERATED_IMAGE:\s*path=([^\s|]+)\s*\|\s*mimeType=([^\s\]]+)\s*\]/g;
```

---

## 6. Domain: Marker Parser

### 6.1 Function: `parseGeneratedImageMarkers`

**File**: `domain/generated-image-markers.ts`

```typescript
export interface GeneratedImageAttachment {
  gcsPath: string;
  filename: string;
  mimeType: string;
  size: number;
  isGenerated: true;
}

export function parseGeneratedImageMarkers({ content, userId }: {
  content: string;
  userId: string;
}): {
  cleanContent: string;
  generatedAttachments: GeneratedImageAttachment[];
}
```

**Behavior:**
1. Match all `[GENERATED_IMAGE: ...]` markers in `content`.
2. For each match:
   - Extract `path` (workspace-relative, e.g., `/media/k97xyz/lobster.png`).
   - Strip leading `/` if present, prepend `{userId}/` → full GCS path: `{userId}/media/k97xyz/lobster.png`.
   - Extract `filename` from path (last segment).
   - Extract `mimeType` from marker.
   - Create attachment: `{ gcsPath, filename, mimeType, size: 0, isGenerated: true }`.
3. Strip all markers from content. Trim trailing whitespace/newlines.
4. Return `{ cleanContent, generatedAttachments }`.

**Edge cases:**
- No markers → `{ cleanContent: content, generatedAttachments: [] }`.
- Markers only (no text content) → `{ cleanContent: "", generatedAttachments: [...] }`.
- Malformed markers (missing fields) → skip silently, leave in content.

### 6.2 Unit Tests

**File**: `test/unit/domain/generated-image-markers.test.ts`

Test cases:
1. Single marker — extracts one attachment, strips marker from content.
2. Multiple markers — extracts all, strips all.
3. No markers — content unchanged, empty attachments.
4. Marker-only content — cleanContent is empty string.
5. Malformed marker (missing mimeType) — left in content, not extracted.
6. Path with leading slash — stripped before prepending userId.
7. Path without leading slash — userId prepended directly.
8. Filename extraction — last path segment used as filename.

---

## 7. Infrastructure: GCS Fuse Read-Write Mount

### 7.1 Volume Definition

**File**: `convex/clients/gke.ts` → `buildDeploymentSpec()` volumes array (after line 468)

```typescript
{
  name: "gcs-media",
  csi: {
    driver: "gcsfuse.csi.storage.gke.io",
    readOnly: false,
    volumeAttributes: {
      bucketName: gcsBucketName,
      mountOptions: `only-dir=${userId}/media,implicit-dirs`,
    },
  },
},
```

### 7.2 Volume Mount

**File**: `convex/clients/gke.ts` → `buildWorkspaceVolumeMounts()` (after the existing GCS Fuse mounts)

```typescript
{
  name: "gcs-media",
  mountPath: "/zeroclaw-data/workspace/media",
  readOnly: false,
},
```

### 7.3 IAM: Grant `objectCreator` to Pod KSA

The pod's KSA (`gcs-reader`) currently has `storage.objectViewer` (read-only). For the `/media` mount to be writable, the GSA needs `storage.objectAdmin` or a custom role with `storage.objects.create` + `storage.objects.delete`.

**File**: `terraform/iam.tf`

Update the GSA role from `roles/storage.objectViewer` to `roles/storage.objectAdmin` on the user data bucket. This grants read+write+delete to the pod.

> **Note**: This grants write access to ALL GCS Fuse mounts (user-storage, conversation-attachments, media). The other mounts remain `readOnly: true` at the **Kubernetes volume level** (kernel enforcement), so the pod cannot write to them even though the IAM role allows it. Defense in depth.

### 7.4 Doctrine Update

**File**: `docs/doctrine/architecture/infra-doctrine.md`

Update invariant 16 from:
> "GCS Fuse mounts MUST be readOnly: true at the kernel level"

To:
> "GCS Fuse mounts MUST be readOnly: true at the kernel level, **except** the `/media` mount which is readOnly: false to allow agent-generated content output. The IAM role grants objectAdmin, but kernel-level readOnly on other mounts provides defense in depth."

---

## 8. Backend: ConversationId in WS Messages

### 8.1 Frontend: Include `threadId` in WS Send

**File**: `src/hooks/useChat.ts` → `sendMessage()` WS send (line ~293)

Current:
```typescript
wsRef.current?.send({
  type: "message",
  content: contentWithMedia,
  ...(base64Images?.length ? { images: base64Images } : {}),
});
```

New:
```typescript
wsRef.current?.send({
  type: "message",
  content: `[conversationId: ${threadId}]\n${contentWithMedia}`,
  ...(base64Images?.length ? { images: base64Images } : {}),
});
```

The `[conversationId: {threadId}]` tag is prepended to the message content. The agent uses this to organize generated files into `/media/{conversationId}/`. Minimal token overhead (~30 tokens).

### 8.2 Auto-Prompt Update

**File**: `src/hooks/useChat.ts` → auto-prompt (line ~189)

Include the conversationId tag in the auto-prompt message as well:
```typescript
wsRef.current.send({
  type: "message",
  content: `[conversationId: ${threadIdRef.current}]\n[SYSTEM] New thread started...`,
});
```

---

## 9. Backend: Marker Parsing in Persistence Paths

### 9.1 WS Path — `persistAssistant` Mutation

**File**: `convex/messages.ts` (the mutation called by `useChat.ts` on "done" event)

Before inserting the assistant message, call `parseGeneratedImageMarkers`:

```typescript
import { parseGeneratedImageMarkers } from "../domain/generated-image-markers";

// In persistAssistantMessage handler:
const { cleanContent, generatedAttachments } = parseGeneratedImageMarkers({
  content: args.content,
  userId: /* resolve from auth or args */,
});

await ctx.db.insert("messages", {
  ...otherFields,
  content: cleanContent,
  attachments: generatedAttachments.length > 0 ? generatedAttachments : undefined,
});
```

### 9.2 Relay Path — `sendToContainer` Action

**File**: `convex/relay.ts` → `sendToContainer` (line ~93)

After extracting `cleanContent` from `extractPersonaReady`, also parse generated image markers:

```typescript
import { parseGeneratedImageMarkers } from "../domain/generated-image-markers";

// After extractPersonaReady:
const { cleanContent: contentAfterPersona, personaData } = extractPersonaReady({
  content: messageContent,
});

const { cleanContent, generatedAttachments } = parseGeneratedImageMarkers({
  content: contentAfterPersona,
  userId: userId as string,
});

await ctx.runMutation(internal.messages.insertAssistantMessage, {
  userId,
  threadId,
  content: cleanContent,
  tokensUsed: result.data.tokensUsed,
  model: result.data.model,
  latencyMs: result.data.latencyMs,
  attachments: generatedAttachments.length > 0 ? generatedAttachments : undefined,
});
```

### 9.3 `insertAssistantMessage` Mutation Update

**File**: `convex/messages.ts`

Add `attachments` to the args of `insertAssistantMessage`:
```typescript
attachments: v.optional(
  v.array(
    v.object({
      gcsPath: v.optional(v.string()),
      filename: v.string(),
      mimeType: v.string(),
      size: v.number(),
      isGenerated: v.optional(v.boolean()),
    }),
  ),
),
```

---

## 10. Frontend: Download Icon on Generated Images

### 10.1 `MessageAttachment` Type Update

**File**: `src/components/chat/MessageBubble.tsx` (line 56)

```typescript
export interface MessageAttachment {
  filename: string;
  mimeType: string;
  size?: number;
  url?: string;
  isGenerated?: boolean;
}
```

### 10.2 `useChat` URL Resolution Update

**File**: `src/hooks/useChat.ts` (line ~164)

Pass through `isGenerated` when mapping attachments:
```typescript
attachments: msg.attachments?.map((att) => ({
  ...att,
  url: att.gcsPath
    ? `${convexSiteUrl}/api/file-url?path=${encodeURIComponent(att.gcsPath)}`
    : undefined,
  isGenerated: att.isGenerated,
})),
```

### 10.3 Download Icon Overlay

**File**: `src/components/chat/MessageBubble.tsx` (line ~91)

Update the image attachment rendering to add a download icon for generated images:

```tsx
{imageAttachments.map((att, i) => (
  <div key={i} className="group relative">
    <a href={att.url} target="_blank" rel="noopener noreferrer">
      <img
        src={att.url}
        alt={att.filename}
        className="max-h-64 max-w-full rounded-lg object-contain"
      />
    </a>
    {att.isGenerated && att.url && (
      <a
        href={att.url}
        download={att.filename}
        className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
        title={`Download ${att.filename}`}
      >
        <Download className="h-4 w-4" />
      </a>
    )}
  </div>
))}
```

Add `Download` to the lucide-react import:
```typescript
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
```

The download icon appears on hover (`group-hover:opacity-100`) as a circular overlay at the bottom-right of the image preview. Uses `<a download>` to trigger browser download rather than navigation.

---

## 11. Workspace Files: TOOLS.md Update

### 11.1 Generated Image Output Convention

**File**: `domain/claw-workspace.ts` → `renderToolsTemplate()`

Add a new section to the rendered TOOLS.md:

```markdown
## Generated Image Output

When you generate images via vision_write:

1. **Save location**: Save all generated images to `/zeroclaw-data/workspace/media/{conversationId}/`.
   The `conversationId` is provided in the `[conversationId: ...]` tag at the start of each user message.

2. **File naming**: Use a meaningful, descriptive filename — NOT a UUID.
   - Good: `lobster.png`, `sunset-over-mountains.png`, `dashboard-mockup-v2.png`
   - Bad: `d4f8a2b1-7c3e-4a9f-b5d6-1234567890ab.png`

3. **Response markers**: After generating an image, include this marker in your response:
   ```
   [GENERATED_IMAGE: path=/media/{conversationId}/{filename} | mimeType=image/png]
   ```
   The marker MUST appear on its own line. Include one marker per generated image.
   The path is workspace-relative (starts with `/media/`).

4. **Supported mimeTypes**: `image/png`, `image/jpeg`, `image/webp`

5. **Example**:
   User: "generate a lobster on a beach"
   You delegate to vision_write, image saved to `/media/k97xyz/lobster-on-beach.png`.
   Your response:
   ```
   Here's your lobster on a beach!
   [GENERATED_IMAGE: path=/media/k97xyz/lobster-on-beach.png | mimeType=image/png]
   ```
```

---

## 12. Error Handling & Edge Cases

### 12.1 Failure Modes

| # | Failure Mode | Severity | Mitigation |
|---|---|---|---|
| 1 | GCS Fuse write fails (disk full, permissions) | High | Agent reports error in response text; no marker emitted; user sees error message only |
| 2 | Agent forgets to include marker | Medium | Image exists in GCS but not displayed in chat; user can still access via `/media` path. TOOLS.md instructions minimize occurrence |
| 3 | Malformed marker (missing mimeType) | Low | Parser skips it; marker text remains visible in message as raw text. Agent corrects on next attempt |
| 4 | GCS eventual consistency delay | Low | Image URL may 404 briefly after creation; browser retry on click resolves. GCS Fuse writes are strongly consistent for new objects |
| 5 | ConversationId tag missing from WS message | Medium | Agent saves to `/media/unknown/` or root `/media/`; images still accessible but not organized by conversation |
| 6 | Large image (>10MB) | Low | GCS handles large files; signed URL download works regardless of size; no base64 encoding for generated images |

### 12.2 Idempotency

- Marker parsing is idempotent — parsing the same content twice produces the same result.
- Multiple generated images in one message are supported (multiple markers, multiple attachments).
- If `persistAssistant` is called twice (WS retry), the second insert creates a duplicate message. This is an existing concern, not introduced by this feature.

---

## 13. Prompt Execution Strategy

### Phase 1: Domain Layer

> Gate: `pnpm app:compile && pnpm app:test`

#### Step 1.1: Create Generated Image Marker Parser

Create `domain/generated-image-markers.ts` with:

1. Export `GeneratedImageAttachment` interface:
   ```typescript
   export interface GeneratedImageAttachment {
     gcsPath: string;
     filename: string;
     mimeType: string;
     size: number;
     isGenerated: true;
   }
   ```

2. Export `parseGeneratedImageMarkers` function:
   - Args: `{ content: string; userId: string }`
   - Returns: `{ cleanContent: string; generatedAttachments: GeneratedImageAttachment[] }`
   - Regex: `/\[GENERATED_IMAGE:\s*path=([^\s|]+)\s*\|\s*mimeType=([^\s\]]+)\s*\]/g`
   - For each match:
     - Extract `path`, strip leading `/`, prepend `${userId}/` → `gcsPath`
     - Extract `filename` from last segment of path
     - Extract `mimeType` from marker
     - Build attachment: `{ gcsPath, filename, mimeType, size: 0, isGenerated: true }`
   - Strip all matched markers from content, trim result
   - Return `{ cleanContent, generatedAttachments }`

3. Exports must be alphabetically sorted per project convention.

##### Verify
- `pnpm app:compile`

##### Timeout
90000

#### Step 1.2: Write Unit Tests for Marker Parser

Create `test/unit/domain/generated-image-markers.test.ts` with these test cases:

1. `"extracts single generated image marker"` — input with one marker, verify cleanContent has marker stripped and one attachment returned with correct gcsPath, filename, mimeType, size=0, isGenerated=true.
2. `"extracts multiple markers"` — input with 3 markers, verify 3 attachments, all stripped from content.
3. `"returns unchanged content when no markers present"` — plain text, empty generatedAttachments.
4. `"handles marker-only content"` — only markers, no prose. cleanContent should be empty string.
5. `"skips malformed markers"` — marker missing `mimeType` field. Should be left in content, not extracted.
6. `"strips leading slash from path"` — `path=/media/xyz/img.png` → gcsPath `userId/media/xyz/img.png`.
7. `"handles path without leading slash"` — `path=media/xyz/img.png` → gcsPath `userId/media/xyz/img.png`.
8. `"extracts filename from path"` — `/media/abc/my-lobster.png` → filename `my-lobster.png`.

Use `describe`/`it` pattern. Import from `../../domain/generated-image-markers`. Use `expect` assertions from vitest.

##### Verify
- `pnpm app:compile`
- `pnpm app:test -- test/unit/domain/generated-image-markers.test.ts`

##### Timeout
90000

### Phase 2: Schema & Backend

> Gate: `pnpm app:compile`

#### Step 2.1: Add `isGenerated` Field to Message Attachments Schema

Edit `convex/schema.ts`. In the `messages` table definition, inside the `attachments` array object (around line 141-150), add `isGenerated: v.optional(v.boolean())` after the `size` field:

```typescript
attachments: v.optional(
  v.array(
    v.object({
      storageId: v.optional(v.id("_storage")),
      gcsPath: v.optional(v.string()),
      filename: v.string(),
      mimeType: v.string(),
      size: v.number(),
      isGenerated: v.optional(v.boolean()),
    }),
  ),
),
```

No migration needed — new optional field on existing records.

##### Verify
- `pnpm app:compile`

##### Timeout
90000

#### Step 2.2: Update `insertAssistantMessage` to Accept Attachments

Edit `convex/messages.ts`. Find the `insertAssistantMessage` mutation. Add `attachments` to its args validator:

```typescript
attachments: v.optional(
  v.array(
    v.object({
      storageId: v.optional(v.id("_storage")),
      gcsPath: v.optional(v.string()),
      filename: v.string(),
      mimeType: v.string(),
      size: v.number(),
      isGenerated: v.optional(v.boolean()),
    }),
  ),
),
```

Pass `attachments` through to the `ctx.db.insert("messages", { ... })` call.

Also update `persistAssistantMessage` (the public/internal mutation called by the WS path) similarly — if it is a separate mutation from `insertAssistantMessage`, it also needs the `attachments` arg and must call `parseGeneratedImageMarkers` before inserting.

Read the file first to understand the exact mutation names and structure.

##### Verify
- `pnpm app:compile`

##### Timeout
90000

#### Step 2.3: Integrate Marker Parsing in Relay Path

Edit `convex/relay.ts` in the `sendToContainer` action handler, inside the `case "success"` block (around line 93-121).

After the `extractPersonaReady` call, add marker parsing:

```typescript
import { parseGeneratedImageMarkers } from "../domain/generated-image-markers";

// After extractPersonaReady:
const { cleanContent: contentAfterPersona, personaData } = extractPersonaReady({
  content: messageContent,
});

const { cleanContent, generatedAttachments } = parseGeneratedImageMarkers({
  content: contentAfterPersona,
  userId: userId as string,
});
```

Then update the `insertAssistantMessage` call to pass `attachments: generatedAttachments.length > 0 ? generatedAttachments : undefined` and use `cleanContent` instead of the prior variable.

##### Verify
- `pnpm app:compile`

##### Timeout
90000

#### Step 2.4: Integrate Marker Parsing in WS Persistence Path

Read `convex/messages.ts` to find the `persistAssistantMessage` mutation (the one called by `useChat.ts` on the "done" event).

Add `parseGeneratedImageMarkers` call inside the mutation handler:

```typescript
import { parseGeneratedImageMarkers } from "../domain/generated-image-markers";

// Inside handler, before db.insert:
const { cleanContent, generatedAttachments } = parseGeneratedImageMarkers({
  content: args.content,
  userId: /* get userId from auth context or args */,
});

// Use cleanContent for content, generatedAttachments for attachments
```

If the mutation doesn't have access to `userId`, read the auth context or add it as an arg.

##### Verify
- `pnpm app:compile`

##### Timeout
120000

### Phase 3: Infrastructure

> Gate: `pnpm app:compile`

#### Step 3.1: Add GCS Fuse Read-Write Media Mount

Edit `convex/clients/gke.ts`.

1. In `buildDeploymentSpec()`, add a new volume to the `volumes` array (after the existing `gcs-conversation-attachments` volume around line 468):

```typescript
{
  name: "gcs-media",
  csi: {
    driver: "gcsfuse.csi.storage.gke.io",
    readOnly: false,
    volumeAttributes: {
      bucketName: gcsBucketName,
      mountOptions: `only-dir=${userId}/media,implicit-dirs`,
    },
  },
},
```

2. In `buildWorkspaceVolumeMounts()`, add the corresponding mount (after the existing GCS Fuse mounts):

```typescript
{
  name: "gcs-media",
  mountPath: "/zeroclaw-data/workspace/media",
  readOnly: false,
},
```

Note: `readOnly: false` on both volume and mount. This is intentional — the agent writes generated images here. Other GCS Fuse mounts remain `readOnly: true`.

##### Verify
- `pnpm app:compile`

##### Timeout
90000

#### Step 3.2: Update Infra Doctrine

Edit `docs/doctrine/architecture/infra-doctrine.md`. Find invariant 16 (the GCS Fuse readOnly rule). Update it to:

> GCS Fuse mounts MUST be `readOnly: true` at the kernel level, **except** the `/media` mount which is `readOnly: false` to allow agent-generated content output (images, documents). The pod's GSA has `storage.objectAdmin`, but kernel-level `readOnly: true` on `user-storage` and `conversation-attachments` mounts provides defense in depth.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

### Phase 4: Frontend

> Gate: `pnpm app:compile`

#### Step 4.1: Add ConversationId Tag to WS Messages

Edit `src/hooks/useChat.ts`.

1. In `sendMessage()` (around line 293), update the WS send to prepend the conversationId tag:

```typescript
wsRef.current?.send({
  type: "message",
  content: `[conversationId: ${threadId}]\n${contentWithMedia}`,
  ...(base64Images?.length ? { images: base64Images } : {}),
});
```

2. In the auto-prompt useEffect (around line 189), also prepend the tag:

```typescript
wsRef.current.send({
  type: "message",
  content: `[conversationId: ${threadIdRef.current}]\n[SYSTEM] New thread started...`,
});
```

##### Verify
- `pnpm app:compile`

##### Timeout
90000

#### Step 4.2: Pass `isGenerated` Through URL Resolution

Edit `src/hooks/useChat.ts` in the `messages` useMemo (around line 160-172).

Add `isGenerated` to the attachment mapping:

```typescript
attachments: msg.attachments?.map((att) => ({
  ...att,
  url: att.gcsPath
    ? `${convexSiteUrl}/api/file-url?path=${encodeURIComponent(att.gcsPath)}`
    : undefined,
  isGenerated: att.isGenerated,
})),
```

##### Verify
- `pnpm app:compile`

##### Timeout
90000

#### Step 4.3: Add Download Icon to MessageBubble

Edit `src/components/chat/MessageBubble.tsx`.

1. Add `Download` to the lucide-react import (line 2):
   ```typescript
   import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
   ```

2. Add `isGenerated` to the `MessageAttachment` interface (line 56-61):
   ```typescript
   export interface MessageAttachment {
     filename: string;
     mimeType: string;
     size?: number;
     url?: string;
     isGenerated?: boolean;
   }
   ```

3. Replace the image attachment rendering block (lines 91-108). Wrap each image in a `div` with `group relative` class. Add a conditional download icon overlay when `att.isGenerated` is true:

```tsx
{imageAttachments.map((att, i) => (
  <div key={i} className="group relative">
    <a href={att.url} target="_blank" rel="noopener noreferrer">
      <img
        src={att.url}
        alt={att.filename}
        className="max-h-64 max-w-full rounded-lg object-contain"
      />
    </a>
    {att.isGenerated && att.url && (
      <a
        href={att.url}
        download={att.filename}
        className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
        title={`Download ${att.filename}`}
      >
        <Download className="h-4 w-4" />
      </a>
    )}
  </div>
))}
```

##### Verify
- `pnpm app:compile`

##### Timeout
90000

### Phase 5: Workspace Files & Doctrine

> Gate: `pnpm app:compile`

#### Step 5.1: Update TOOLS.md Template with Generated Image Instructions

Edit `domain/claw-workspace.ts`. Find the `renderToolsTemplate()` function. Add a new section to the template string for generated image output conventions.

The section should document:
1. Save location: `/zeroclaw-data/workspace/media/{conversationId}/`
2. Where to get conversationId: from the `[conversationId: ...]` tag in user messages
3. File naming: meaningful names, not UUIDs
4. Response marker format: `[GENERATED_IMAGE: path=/media/{conversationId}/{filename} | mimeType=image/png]`
5. Supported mimeTypes: `image/png`, `image/jpeg`, `image/webp`
6. One marker per image, on its own line

See Section 11 of this spec for the exact content to add.

##### Verify
- `pnpm app:compile`

##### Timeout
90000

#### Step 5.2: Audit Claw Doctrine for Stale Session Rule

Edit `docs/doctrine/architecture/claw-doctrine.md`. Find the section that states relay requests must NOT include `session_id`. Update it to reflect:

- The web chat path uses WebSocket with a `[conversationId: {threadId}]` tag prepended to every message.
- This tag provides conversation context to the agent for organizing generated content (e.g., media output paths).
- The relay (HTTP) path does NOT send session_id (unchanged — relay sends `context` array instead).

##### Verify
- `pnpm app:compile`

##### Timeout
60000

---

## 14. Verification Summary

| Phase | What to Verify | Command |
|-------|---------------|---------|
| 1 | Domain parser compiles + tests pass | `pnpm app:compile && pnpm app:test -- test/unit/domain/generated-image-markers.test.ts` |
| 2 | Schema change, mutations updated, relay integration compiles | `pnpm app:compile` |
| 3 | GKE deployment spec includes new volume + mount | `pnpm app:compile` |
| 4 | Frontend compiles with conversationId tag + download icon | `pnpm app:compile` |
| 5 | Workspace template + doctrine updates | `pnpm app:compile` |

### End-to-End Manual Test

1. Deploy to staging: `pnpx convex deploy`
2. Open web chat, start new thread
3. Send "generate a lobster on a reef"
4. Verify:
   - Agent responds with text + image appears inline in message bubble
   - Hover over image → download icon appears (bottom-right, circular, dark overlay)
   - Click download icon → browser downloads the image file
   - Click image itself → opens in new tab (existing behavior)
5. Check GCS bucket: `gsutil ls gs://{bucket}/{userId}/media/{threadId}/`
   - File exists with meaningful name (e.g., `lobster-on-reef.png`)

---

## 15. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-04-16 | Initial specification |
