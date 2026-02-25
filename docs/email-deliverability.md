# Email Deliverability & DMARC Enforcement

> **Last audited:** 2026-02-25
> **Domain:** sog.gg
> **Sender address:** sogverse@sog.gg

## Email Sending Services

| Service | Purpose | SPF | DKIM | Status |
|---|---|---|---|---|
| **Google Workspace** | Team email (MX) | ✅ `include:_spf.google.com` | ✅ `google._domainkey` | Fully authenticated |
| **Brevo** | Transactional email (Supabase auth + Brevo API) | ✅ `include:sendinblue.com` | ✅ `brevo1._domainkey`, `brevo2._domainkey` | Fully authenticated |
| **Klaviyo** | Marketing email | ❌ **Not in SPF** | ❌ **No DKIM records** | **Broken — likely hitting spam** |
| **Nordname server** (`135.181.12.10` / `andoria.nordname.net`) | Unknown — possibly contact form or leftover | ✅ `ip4:135.181.12.10` | ❓ No DKIM | Investigate if anything sends from here |
| **MailChannels** | Relay used by Nordname hosting | ✅ `include:relay.mailchannels.net` | ❓ No DKIM | Investigate if anything sends from here |

## Current DNS Records

### SPF (TXT on `sog.gg`)

```
v=spf1 a mx ip4:135.181.12.10 ip6:2a01:4f9:fff1:e:0:0:0:10 include:relay.mailchannels.net include:_spf.google.com include:sendinblue.com ~all
```

### DKIM

| Selector | Type | Value |
|---|---|---|
| `google._domainkey.sog.gg` | TXT | RSA public key (Google Workspace) |
| `brevo1._domainkey.sog.gg` | CNAME | `b1.sog-gg.dkim.brevo.com` |
| `brevo2._domainkey.sog.gg` | CNAME | `b2.sog-gg.dkim.brevo.com` |

### DMARC (CNAME on `_dmarc.sog.gg`)

```
_dmarc.sog.gg → _dmarc.sog_gg._d.easydmarc.pro
```

Which resolves to:

```
v=DMARC1; p=none; rua=mailto:1eedb7f6dc@rua.easydmarc.eu; ruf=mailto:1eedb7f6dc@ruf.easydmarc.eu; fo=1;
```

- `p=none` means **no enforcement** — spoofed emails are still delivered
- Reports go to EasyDMARC, but we don't have access to that account

## Problems

### 1. Klaviyo emails are unauthenticated (HIGH PRIORITY)

Klaviyo has a site verification TXT record (`klaviyo-site-verification=Uxz5uV`) but no DKIM or SPF. Every marketing email Klaviyo sends as `@sog.gg` fails authentication and is likely landing in spam.

### 2. DMARC is not enforced

`p=none` means receiving servers don't act on authentication failures. Anyone can spoof `@sog.gg` emails. Enforcing DMARC (`p=quarantine` or `p=reject`) improves domain reputation and deliverability, but **cannot be enabled until all legitimate senders pass authentication** — otherwise their emails get quarantined.

### 3. No visibility into DMARC reports

The `_dmarc` CNAME points to EasyDMARC, which we don't have access to. We need reports sent somewhere we can read them to verify all senders are passing before enforcing.

### 4. Unknown senders in SPF

The Nordname server IP (`135.181.12.10`) and MailChannels relay are in SPF but may not actually be sending email. If they are, they lack DKIM and would fail DMARC alignment once enforced. Need to determine if these are actively used or can be removed.

## Action Plan

Complete these steps in order. Each step must be verified before moving to the next.

### Step 1: Fix Klaviyo authentication

1. Go to **Klaviyo → Settings → Domains**
2. Set up a branded sending domain for `sog.gg`
3. Klaviyo will provide **DKIM CNAME records** (typically `k1._domainkey` and `k2._domainkey`)
4. Add those CNAME records in **Nordname DNS**
5. Update the **SPF TXT record** on `sog.gg` to include Klaviyo (confirm the exact include from Klaviyo, usually `send.klaviyo.com`):
   ```
   v=spf1 a mx ip4:135.181.12.10 ip6:2a01:4f9:fff1:e:0:0:0:10 include:relay.mailchannels.net include:_spf.google.com include:sendinblue.com include:send.klaviyo.com ~all
   ```
6. Verify in Klaviyo dashboard that the domain shows as authenticated

### Step 2: Set up DMARC reporting we can access

Replace the EasyDMARC CNAME in Nordname with a direct TXT record that sends reports to an email we control:

1. **Delete** the CNAME record for `_dmarc.sog.gg`
2. **Add** a TXT record:
   ```
   Host: _dmarc
   Type: TXT
   Value: v=DMARC1; p=none; rua=mailto:dmarc@sog.gg; fo=1;
   ```
   (Replace `dmarc@sog.gg` with a real mailbox — could be a Google Group or alias that someone monitors.)
3. Alternatively, sign up for a free DMARC report viewer like [Postmark DMARC](https://dmarc.postmarkapp.com/) and use their reporting address

### Step 3: Audit unknown senders

Determine whether `135.181.12.10` (Nordname) and `relay.mailchannels.net` (MailChannels) are actively sending email as `@sog.gg`:

- If the sog.gg website is purely Webflow with no contact form, these are likely leftovers and can be removed from SPF
- The DMARC reports from Step 2 will confirm this — any email from these sources will show up

### Step 4: Monitor reports (1–2 weeks)

Read the incoming DMARC aggregate reports and confirm:

- ✅ Google Workspace emails pass SPF + DKIM
- ✅ Brevo emails pass SPF + DKIM
- ✅ Klaviyo emails pass SPF + DKIM
- ✅ No unexpected senders appear

### Step 5: Enforce DMARC gradually

Once all senders pass, update the DMARC TXT record in Nordname in stages:

**Stage A — 10% enforcement:**
```
v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc@sog.gg; fo=1;
```

**Stage B — 50% enforcement (after 1 week if no issues):**
```
v=DMARC1; p=quarantine; pct=50; rua=mailto:dmarc@sog.gg; fo=1;
```

**Stage C — Full enforcement:**
```
v=DMARC1; p=quarantine; rua=mailto:dmarc@sog.gg; fo=1;
```

### Step 6 (Optional): Harden SPF

After DMARC is fully enforced, change SPF from `~all` (softfail) to `-all` (hardfail):
```
v=spf1 ... -all
```

## Verification Commands

Run these from any terminal with `nslookup` to check the current state:

```bash
# SPF
nslookup -type=TXT sog.gg 8.8.8.8

# DMARC
nslookup -type=TXT _dmarc.sog.gg 8.8.8.8

# Brevo DKIM
nslookup -type=CNAME brevo1._domainkey.sog.gg 8.8.8.8
nslookup -type=CNAME brevo2._domainkey.sog.gg 8.8.8.8

# Google DKIM
nslookup -type=TXT google._domainkey.sog.gg 8.8.8.8

# Klaviyo DKIM (should exist after Step 1)
nslookup -type=CNAME k1._domainkey.sog.gg 8.8.8.8
nslookup -type=CNAME k2._domainkey.sog.gg 8.8.8.8
```

## Brevo API (for reference)

The Brevo domain status can be checked via API:

```bash
curl -s -H "api-key: $BREVO_API_KEY" "https://api.brevo.com/v3/senders/domains/sog.gg"
```

This returns `authenticated: true/false` and the full DNS record details.
