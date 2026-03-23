# Admin Quota Monitoring

Research and implementation plan for adding Daily.co and Brevo usage/quota monitoring to the admin dashboard.

## Overview

Both Daily.co (voice chat) and Brevo (transactional email) are usage-based services with quotas. This feature adds an admin dashboard page showing current usage and estimated costs for both.

## Brevo (Transactional Email)

### API Available

`GET https://api.brevo.com/v3/account` returns everything we need in one call:
- Plan type and tier
- Email credits remaining
- Email credits used
- Account limits

**Auth:** `api-key` header with `BREVO_API_KEY` (already in `.env.local`).

### Implementation

Straightforward — single API call, display credits used/remaining.

## Daily.co (Voice Chat)

### Billing Model

Daily.co bills on **participant-minutes** (number of participants x duration in minutes). Two rates:
- **Video calls:** $0.004/participant-minute
- **Audio-only calls:** $0.00099/participant-minute
- **Free tier:** 10,000 participant-minutes/month

Since Sogverse uses voice-only (`start_video_off` in token config), the audio rate applies — but the API doesn't distinguish video vs audio, so we estimate using the video rate as an upper bound.

### API Available

| Endpoint | Returns | Useful for |
|---|---|---|
| `GET /v1/` | Domain config, plan name | Plan identification |
| `GET /v1/meetings` | Meeting list with `start_time`, `duration`, `ongoing`, `participants` array | Aggregate participant-minutes |
| `GET /v1/meetings/:id/participants` | Per-participant `join_time`, `duration` (seconds), `user_name` | Detailed usage breakdown |
| `GET /v1/rooms` | Room list | Active room count |

**Auth:** `Authorization: Bearer {DAILY_API_KEY}` (already in `.env.local`).

### What's NOT Available via API

- **No billing summary endpoint** — no "X of Y minutes used this period"
- **No video vs audio breakdown** — participant duration is a single number, no media type split
- **No official quota remaining** — must hardcode plan limit (e.g., 10,000 free minutes)

### Estimation Strategy

1. Fetch all meetings for the current billing month via `GET /v1/meetings`
2. Sum `duration` across all participants to get total participant-minutes
3. Show two cost estimates:
   - **Upper bound** (video rate): total minutes x $0.004
   - **Likely cost** (audio-only rate): total minutes x $0.00099
4. Show usage against hardcoded plan limit (10,000 free minutes)

Note: Meeting timestamps have ~15-second granularity per Daily.co docs.

## Implementation Plan

### New Files

| File | Purpose |
|---|---|
| `src/app/api/admin/quotas/route.ts` | API route — fetches from both Brevo and Daily.co APIs, returns combined usage data |
| `src/app/(dashboard)/admin/quotas/page.tsx` | Admin page — displays quota cards for both services |

### Modified Files

| File | Change |
|---|---|
| `src/lib/constants/routes.ts` | Add `ROUTES.admin.quotas` |
| `src/components/layout/sidebar.tsx` | Add "Quotas" nav item to admin sidebar |

### API Route Design

```
GET /api/admin/quotas
```

Requires admin role. Returns:

```json
{
  "brevo": {
    "plan": "Free",
    "emailCreditsRemaining": 285,
    "emailCreditsTotal": 300
  },
  "daily": {
    "planName": "launch",
    "participantMinutesUsed": 4230,
    "participantMinutesLimit": 10000,
    "estimatedCostVideo": 16.92,
    "estimatedCostAudio": 4.19,
    "activeMeetings": 2,
    "totalRooms": 5
  }
}
```

### UI Design

Two cards on the page, following existing admin dashboard patterns:

**Brevo Card:**
- Email credits: progress bar (used / total)
- Plan name

**Daily.co Card:**
- Participant-minutes: progress bar (used / plan limit)
- Estimated cost range (audio rate – video rate)
- Active meetings count
- Room count

### References

- Daily.co REST API: https://docs.daily.co/reference/rest-api
- Daily.co Meetings API: https://docs.daily.co/reference/rest-api/meetings
- Daily.co Pricing: https://www.daily.co/pricing/video-sdk/
- Brevo API: https://developers.brevo.com/docs
- Existing Daily.co wrapper: `src/lib/daily.ts`
- Existing Brevo wrapper: `src/lib/brevo.ts`
