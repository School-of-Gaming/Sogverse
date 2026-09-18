---
name: slack-purchase-notifications
description: Set up, change or debug the Slack purchase notifications in the staff channel — a Stripe Dashboard Workflow, not Sogverse code. Building and testing the workflow in a scratch channel, pasting a whole message template with its variable chips, and the platform limits that rule out the obvious approaches.
---

# Working on the Slack purchase-notification workflow

The notification is a Stripe Dashboard Workflow posting through the Stripe Workflows for
Slack app; no Sogverse code runs in the path. **Read
`docs/architecture/slack-purchase-notifications.md` first** — it holds the trigger and its
conditions, the metadata contract the template reads, and what the payload cannot carry.
This skill is the Dashboard work.

## Constraints that rule out the obvious approaches

- **Workflows have no API** — the workflow endpoints all 404 (missing endpoint, not a
  permissions wall). Dashboard-only: a session cannot read or edit a workflow and must
  ask for a screenshot of the trigger, conditions, and template.
- **Workflows and Stripe Apps are per-mode** — an app installed on live shows "App not
  installed" in test mode and needs installing again there.
- **`stripe trigger` fires test-mode events only**, so a live workflow cannot be
  exercised synthetically — only by a real purchase.

## One-time setup

1. Install **Stripe Workflows for Slack** from the Stripe App Marketplace.
2. Connect the Slack workspace in the app's settings.
3. `/invite @Stripe` into the target channel — the app only lists channels it is a member
   of, so the workflow's Slack action cannot see the channel until this is done. The action
   then picks it from a dropdown.

Account limit: 50 workflows in total, all of which may be active. Workflows have drafts,
versioning, and per-run observability in the Dashboard — a failed run is diagnosable there.

## Iterating on a workflow

The staff-channel workflow is live-mode only. To iterate, build a test-mode or sandbox copy
pointed at a **scratch channel**, and repoint to the staff channel only once the message
reads correctly. Two ways to feed it:

- `stripe trigger checkout.session.completed` with `--add
  checkout_session:metadata[key]=value` for each key — fast, no deploy, and the right loop for
  wording and for settling the unverified mechanics below. A synthetic fixture does not fill
  `customer_details`, so name and email render empty here.
- A real test-mode checkout against a running build — slower, and the only test that proves the
  metadata keys the code actually writes match the names the template reads.

## Message template mechanics

- Slack mrkdwn is supported: `*bold*`, `_italic_`, `~strike~`, inline and fenced code, block
  quotes, `:emoji:`, and lists. Line breaks are preserved.
- Hyperlinks are `<url|display text>`. Mentions use Slack ids, not display names.
- **`Include dashboard link` gives exactly one native Stripe deep link**, keyed to a single
  object id. Any further Stripe links must be written into the template by hand.

Two mechanics are **unverified** — confirm them in a sandbox before relying on either:

- whether a variable interpolates *inside* a URL string;
- the exact variable path the Dashboard's picker uses for metadata keys.

## Editing the message template: paste, don't click

Editing the workflow's message template field-by-field is slow — each variable is a
picker click — so build the whole template and paste it in one shot. Verified working
2026-08-14.

The template field is a **Draft.js** editor. Two consequences:

- **Replacing the DOM/`innerHTML` does nothing.** Draft's ContentState is the source of
  truth and the next render discards outside mutation. Don't offer this.
- **Pasted HTML *is* parsed, including variable chips.** Put the template on the
  clipboard as a **CF_HTML flavour** and paste — the chips reconstruct.

A chip is a span whose `data-template-variable` attribute holds this JSON
(double-quoted attribute, so inner quotes are `&quot;`):

```json
{"variableKey":"0","dynamicValue":{"type":"dynamic",
 "step":{"type":"trigger","triggerSchemaId":"stripe.api.v1_checkout_session_completed"},
 "propertyPath":["metadata"],"triggerSourceType":"trigger_payload","mapKey":"productName"}}
```

`propertyPath` is the object path; `mapKey` names the key inside a map and is **free
text**, so a key need not have appeared in any past event. Omit `mapKey` for plain
fields (`["amount_total"]`, `["customer_details","name"]`). Sequential `variableKey`
values work. Slack's labelled-link form is literal text around a chip —
`&lt;CHIP|Admin product&gt;` — so only the URL is dynamic.

Two traps that cost real time:

- **Keep the HTML pure ASCII.** .NET's `DataObject.SetData("HTML Format", …)` mangles
  non-ASCII on the way to the clipboard — use entities (`&#183;`). The plain-text
  fallback flavour is fine as-is.
- **Run PowerShell with `-STA`**, and build the CF_HTML header manually with **byte**
  offsets (`Version:0.9`, `StartHTML`, `EndHTML`, `StartFragment`, `EndFragment`). Set
  both the HTML flavour and a plain-text fallback on one `DataObject`.

**A Checkout Session has several metadata maps — pick the right one in the chip.** The
picker offers all of them: `metadata` (the session's own — **the Slack keys live
here**), `invoice_creation.invoice_data.metadata` (the finance snapshot, one-off
purchases only), `subscription_data.metadata` (subscription checkouts only). Pointing a
chip at the wrong map never resolves.

## Verification

The message posts in the scratch channel from a real test-mode checkout with every chip
resolved — no empty values beyond the name and email a synthetic `stripe trigger` fixture
leaves blank — before the workflow is repointed at the staff channel.
