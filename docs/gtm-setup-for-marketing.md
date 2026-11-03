# Setting up Meta and Reddit in Google Tag Manager

For the marketing team running School of Gaming's campaigns. This explains what the
Sogverse site tells the Tag Manager container, how to build the Meta and Reddit tags from
it, and what the container will refuse to do.

You do not need a developer to change a tag. You do need one for anything in "What will
never fire" below: ask Kyle at School of Gaming.

## How it works in one paragraph

The site loads the container only for a visitor who said yes to marketing cookies, only on
public pages (the home page, About, the Roblox programme pages, the shop, product pages,
landing pages, sign-up and sign-in),
and never for a signed-in child. When something worth measuring happens, the site pushes an
event into the container's `dataLayer`. Your tags listen for those events. Our servers also
report the same events straight to Meta and Reddit under the same id, so each platform
counts every event once even when an ad blocker stops the browser tag.

## What the site pushes

Six events. Every one carries:

| Field | What it is |
| :-- | :-- |
| `event` | The event name in the table below. |
| `event_id` | A unique id for this one event. Send it to Meta and Reddit (see the tags below), because it is how they match the browser event with our server's copy. |
| `page_path` | The page it happened on, in English and without the language prefix: `/shop/<product id>`, never `/fi/kauppa/<product id>`. |

| Event | When it fires | Extra fields | Meta event | Reddit event |
| :-- | :-- | :-- | :-- | :-- |
| `page_view` | A visitor reaches a public page. Once per page reached; coming back to a page counts again. | none | PageView | PageVisit |
| `view_item` | A product page has shown its product. Once per visit to the page. | `ecommerce`, `advertised` | ViewContent | ViewContent |
| `add_to_cart` | The parent clicks into signing up from a product page: "Create an account" while signed out, or the sign-up button while signed in. Free and paid products alike. Once per visit to the page. | `ecommerce`, `advertised` | InitiateCheckout | AddToCart |
| `sign_up` | A parent account has just been created with an email and password. An account created through Google is reported by our server only. | `ecommerce` (the product page they started from, or `null`) | Lead | Lead |
| `enrolment` | A seat on a free product, or a place on any product's waiting list, has just been taken. | `ecommerce`, `advertised`, `outcome` (`enrolled` or `waitlisted`) | CompleteRegistration | SignUp |
| `begin_checkout` | A parent has been sent to Stripe to pay. | `ecommerce`, `advertised`, `outcome` (`sent_to_checkout`) | do not send | do not send |

`begin_checkout` is for Google Analytics only. For Meta and Reddit the start of the sign-up
is the earlier `add_to_cart` click, and sending both would count every paid sign-up twice.

**`advertised`** is `true` for a product we advertise and `false` for a municipality club or
a product invoiced by contract. Analytics wants every product; an ad tag must fire only
when `advertised` is `true`, or campaigns learn from families an ad never reached.

**`ecommerce`** describes the product in Google's standard shape:

| Data Layer Variable | Meaning |
| :-- | :-- |
| `ecommerce.items.0.item_id` | The product's id |
| `ecommerce.items.0.item_name` | The product's English name |
| `ecommerce.items.0.item_category` | The game or topic, such as `roblox_studio` |
| `ecommerce.value` | The price the family pays (per month for a club), `0` when free |
| `ecommerce.currency` | `EUR`, `SEK` and so on |

A waiting list place and a `sign_up` have no `value` or `currency`, because nobody has paid.

### Examples

```js
{ event: "page_view", event_id: "0b9f6c1e-…", page_path: "/shop" }
```

```js
{
  event: "view_item",            // add_to_cart looks exactly the same
  event_id: "5d2a8e47-…",
  page_path: "/shop/8c41f0d2-…",
  advertised: true,
  ecommerce: {
    items: [{ item_id: "8c41f0d2-…", item_name: "Roblox Studio Club",
              item_category: "roblox_studio", price: 49, quantity: 1 }],
    value: 49,
    currency: "EUR"
  }
}
```

```js
{
  event: "sign_up",
  event_id: "a17c3b90-…",
  page_path: "/register",
  ecommerce: {                   // null when they did not come from a product page
    items: [{ item_id: "8c41f0d2-…", item_name: "Roblox Studio Club",
              item_category: "roblox_studio", quantity: 1 }]
  }
}
```

```js
{
  event: "enrolment",
  event_id: "e3d58a21-…",
  page_path: "/shop/8c41f0d2-…",
  outcome: "waitlisted",          // or "enrolled"
  advertised: true,
  ecommerce: {
    items: [{ item_id: "8c41f0d2-…", item_name: "Roblox Studio Club",
              item_category: "roblox_studio", quantity: 1 }]
  }
}
```

## Variables and triggers to create first

Data Layer Variables (version 2): `event_id`, `page_path`, `advertised`, `outcome`,
`ecommerce.items.0.item_id`, `ecommerce.items.0.item_name`,
`ecommerce.items.0.item_category`, `ecommerce.value`, `ecommerce.currency`.

One **Custom Event** trigger per event name: `page_view`, `view_item`, `add_to_cart`,
`sign_up`, `enrolment`. On `view_item`, `add_to_cart` and `enrolment`, set the trigger to
fire on "Some Custom Events" where `advertised` equals `true`.

Do not use the built-in All Pages, Initialization, DOM Ready or Window Loaded triggers for
an ad tag. They fire when the container loads, before the site has checked the page, and
with no `event_id`, so every page view would count twice.

## The Meta tag

Use the official **Facebook Pixel** template by Meta from the Community Template Gallery.
Make one tag per event, or one tag whose event name is looked up from the event: either
works.

- **Pixel ID**: the same pixel our servers report to. Ask Kyle if you are unsure which one
  that is; a different pixel means nothing is matched and every event counts twice.
- **Event name**: from the mapping table above (PageView, ViewContent, InitiateCheckout,
  Lead, CompleteRegistration).
- **Event ID**: the `event_id` variable. This is the setting that stops double counting.
- **Object properties** for the product events (ViewContent, InitiateCheckout, Lead,
  CompleteRegistration): `content_ids` from `item_id`, `content_name` from `item_name`,
  `content_category` from `item_category`, `content_type` set to `product`, `value` and
  `currency` from the two `ecommerce` variables. On CompleteRegistration you may also send
  `outcome`. If Test Events warns about `content_ids`, tell Kyle and we will push it as a
  list.
- **Trigger**: the matching Custom Event trigger above.
- **Leave empty or unticked**: every advanced matching field (email, phone, name and so
  on), and the **Meta-enabled CAPI** opt-in box. Our servers already send Meta the
  Conversions API events, and the privacy policy describes exactly what we send; a tag
  adding to that would make the policy untrue.

### Should the browser also send Lead and CompleteRegistration?

Yes. Our servers already send Meta a Lead for every new account and a CompleteRegistration
for every free seat or waiting list place. Fire the same events from the browser on
`sign_up` and `enrolment` too, with the Event ID set from `event_id`. The browser and the
server use the same id for the same moment, so Meta keeps one and drops the other. What you
gain is Meta's browser cookie on the event, which helps it match the visitor to an ad.

The same holds for every event in the table: each one is also sent by our servers under the
same id, so firing it from the browser never double counts as long as the Event ID is set.

## The Reddit tag

Use the official **Reddit Pixel** template by Reddit from the Community Template Gallery.

- **Pixel ID**: the same `a2_…` id our servers report to.
- **Event**: from the mapping table (PageVisit, ViewContent, AddToCart, Lead, SignUp).
- **Conversion ID**: the `event_id` variable. This is Reddit's name for the matching id.
- **Products, value and currency**: from the same `ecommerce` variables as Meta's.
- **Trigger**: the matching Custom Event trigger.
- **Leave empty**: any advanced matching fields (email, phone).

**In Tag Manager the Reddit tag shows as "Failed". That is expected.** The template tries to
load a version of Reddit's script that our site refuses on purpose, because that version
brings in settings from Reddit's dashboard that could track pages we keep private. The site
loads Reddit's standard script instead, and the events are sent. Check them in Reddit's
Events Manager, not in Tag Manager's status.

**Never use Reddit's "link your GTM container" option.** Build the tag by hand as above.

## What will never fire

The site blocks these, so a tag or trigger built on one silently does nothing:

- Custom HTML tags and Custom JavaScript variables
- Custom Image tags, and Google's built-in tags for other vendors (LinkedIn, Hotjar and
  similar)
- Templates from any vendor other than Meta, Reddit and Google: they cannot load their own
  script or send anywhere new
- All the automatic triggers: Click, Link Click, Form Submission, Timer, History Change,
  Scroll Depth, Element Visibility, JavaScript Error and YouTube Video

Why: Sogverse is a platform children sign into, and these are the ways a tag could run code
nobody has reviewed or report a private page such as a child's profile. If you need one of
them, ask Kyle; it is a change to the site, not to the container.

## When to publish

Publish the container **right after** School of Gaming tells you the new site release is
live, not before. Until that release, the site still runs its own Meta and Reddit pixels, so
a container published early makes every Meta and Reddit page view count twice. Publish soon
after, too: between the release and your publish, the browser sends nothing to Meta or
Reddit and only our servers' reports arrive.

## How to check it works

- **Meta**: Events Manager, the pixel, **Test Events**. Open the site in a browser, accept
  marketing cookies, and visit a product page. You should see PageView and ViewContent
  arriving from both the browser and the server, marked as deduplicated.
- **Reddit**: Events Manager, the pixel's event activity. Expect the same pairs.
- **Google Tag Manager's Preview mode does not work on our site.** Preview adds a
  `gtm_debug` parameter to the address, and the site refuses to load the container on any
  address with a parameter it does not recognise. That refusal is a privacy rule, so check
  in Meta's and Reddit's own tools instead.
- Meta shows some of our fields as `_removed_` in Events Manager. That is Meta's display
  for this pixel, not a fault in the tag.
