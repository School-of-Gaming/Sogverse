# Email Deliverability & DMARC Enforcement

> **Last audited:** 2026-02-25
> **Domain:** sog.gg
> **Sender addresses:** `sogverse@sog.gg` (Brevo), `info@sog.gg` (Klaviyo), team email via Google Workspace

## Email Sending Services

All three email senders are fully authenticated and passing SPF, DKIM, and DMARC as of 2026-02-25.

| Service | Purpose | SPF | DKIM | DMARC | Status |
|---|---|---|---|---|---|
| **Google Workspace** | Team email (MX) | ✅ `include:_spf.google.com` | ✅ `google._domainkey` | ✅ pass | Fully working |
| **Brevo** | Transactional email (Supabase auth + Brevo API) | ✅ `include:sendinblue.com` | ✅ `brevo1._domainkey`, `brevo2._domainkey` | ✅ pass | Fully working |
| **Klaviyo** | Marketing email (sends from `email.sog.gg` subdomain) | ✅ via delegated NS | ✅ `mtd1` selector on `email.sog.gg` | ✅ pass (relaxed alignment) | Fully working |

### Klaviyo DNS Setup

Klaviyo uses a **dedicated sending subdomain** (`email.sog.gg`) with NS delegation:

- NS records in Nordname: `email.sog.gg` → `ns1-4.klaviyo.com`
- Site verification: `klaviyo-site-verification=Uxz5uV`
- Klaviyo manages SPF, DKIM, and bounce handling dynamically through their nameservers
- The zone appears empty in static DNS queries — this is normal. Klaviyo serves records dynamically.
- Verified via test email headers (2026-02-25): `dkim=pass header.i=@email.sog.gg`, `spf=pass smtp.mailfrom=k3.email.sog.gg`, `dmarc=pass header.from=sog.gg`
- Klaviyo dashboard shows `email.sog.gg` as **Active**

### Other SPF entries (unknown senders)

| Entry | Identified as | Status |
|---|---|---|
| `ip4:135.181.12.10` / `ip6:2a01:4f9:fff1:e:...` | Nordname hosting server (`andoria.nordname.net`) | ❓ Investigate — may be leftover |
| `include:relay.mailchannels.net` | MailChannels relay (used by hosting providers) | ❓ Investigate — may be leftover |

If the sog.gg website is purely Webflow with no server-side email sending, these entries are likely leftovers from initial DNS setup and can be removed to tighten SPF.

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
| `mtd1._domainkey.email.sog.gg` | Managed by Klaviyo | Dynamic (via NS delegation) |

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

## Remaining Problem: DMARC is not enforced

`p=none` means receiving servers don't act on authentication failures. Anyone can spoof `@sog.gg` emails. Enforcing DMARC (`p=quarantine` or `p=reject`) improves domain reputation and deliverability.

All three legitimate senders (Google, Brevo, Klaviyo) are already passing authentication, so enforcement is safe to proceed with — the only caution is the unknown senders in SPF (Nordname/MailChannels) which may or may not be actively sending.

## Action Plan

### Step 1: Set up DMARC reporting we can access

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

### Step 2: Audit unknown senders (1–2 weeks)

Monitor the DMARC reports to determine whether `135.181.12.10` (Nordname) and `relay.mailchannels.net` (MailChannels) are actively sending email as `@sog.gg`:

- If nothing shows up from these IPs, they're safe to remove from SPF
- If they are sending, decide whether to add DKIM for them or stop using them

### Step 3: Enforce DMARC gradually

Once reports confirm no unexpected senders, update the DMARC TXT record in Nordname in stages:

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

### Step 4 (Optional): Harden SPF

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

# Klaviyo subdomain
nslookup -type=NS email.sog.gg 8.8.8.8
```

## Brevo API (for reference)

The Brevo domain status can be checked via API:

```bash
curl -s -H "api-key: $BREVO_API_KEY" "https://api.brevo.com/v3/senders/domains/sog.gg"
```

This returns `authenticated: true/false` and the full DNS record details.
