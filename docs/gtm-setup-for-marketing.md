# Setting up Meta and Reddit in Google Tag Manager

For the marketing team running School of Gaming's campaigns. This explains what the
Sogverse site tells the Tag Manager container, how to build the Meta and Reddit tags from
it, and what the container will refuse to do.

You do not need a developer to change a tag. You do need one for anything in "What the
site blocks" below: ask Kyle at School of Gaming.

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

**`meta`** is the same product again, ready for Meta's tag: `content_ids` (a list holding the
product's id), `content_name`, `content_category`, `content_type` (always `product`), and
`value` and `currency` where the event has a price. It is on every event that has an
`ecommerce` object, and absent otherwise. Reddit's tag needs no object of its own: it reads
`ecommerce` directly.

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
  },
  meta: {
    content_ids: ["8c41f0d2-…"], content_name: "Roblox Studio Club",
    content_category: "roblox_studio", content_type: "product",
    value: 49, currency: "EUR"
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
  },
  meta: { … }                    // the same product, without value or currency
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
  },
  meta: { … }                    // the same product, without value or currency
}
```

## Variables and triggers to create first

Data Layer Variables (version 2): `event_id`, `page_path`, `advertised`, `outcome` and
`meta`. Google's own tags read `ecommerce` by themselves, and so does Reddit's.

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
- **Object Properties, "Load Properties From Variable"**: the `meta` variable, on every
  tag. It holds the product on ViewContent, InitiateCheckout, Lead and
  CompleteRegistration and is empty on PageView, so one setting serves them all. On
  CompleteRegistration you may also add `outcome` as a row in the table below it.
- **Leave unticked**: "Enable Enhanced Ecommerce" and "GA4 ecommerce". Neither reads the
  way the site pushes; `meta` already carries the product.
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
- **Product Information**: tick **Use Ecommerce Product Data**. The template then reads
  the product, its price and the item count from the `ecommerce` object the site pushes.
  Leave Transaction Value, Currency and Item Count empty: the template fills them from the
  same object.
- **Trigger**: the matching Custom Event trigger.
- **Leave empty**: any advanced matching fields (email, phone).

**In Tag Manager the Reddit tag shows as "Failed". That is expected.** The template tries to
load a version of Reddit's script that our site refuses on purpose, because that version
brings in settings from Reddit's dashboard that could track pages we keep private. The site
loads Reddit's standard script instead, and the events are sent. Check them in Reddit's
Events Manager, not in Tag Manager's status.

**Never use Reddit's "link your GTM container" option.** Build the tag by hand as above.
Linking gives Reddit the right to publish changes to our container, so a company outside
School of Gaming could add or change tags without anyone here reviewing them.

## If you also edit the Google tags

Two settings on the Google side keep private pages out of Google's reports. Both live
outside the site, so only whoever configures Google can keep them:

- **Turn off enhanced measurement's page views** in the Google Analytics property. Left
  on, Google's tag reports a page view every time the address changes, including the
  private pages a visitor walks to after the public page that loaded the container.
- **Set `page_location` and `page_path` on every Google tag from the `page_path`
  variable.** A tag left to its default reads the browser's address bar when it fires,
  which may by then be showing a different page from the one the event happened on.

## What the site blocks

These never fire, so a tag, variable or trigger built on one silently does nothing:

- Custom HTML tags and Custom JavaScript variables
- The 1st-Party Cookie, JavaScript Variable and DOM Element variable types. A cookie
  variable could read a signed-in parent's login, and the other two can read anything on
  the page.
- Custom Image tags, and Google's built-in tags for other vendors (LinkedIn, Hotjar and
  similar)
- All the automatic triggers: Click, Link Click, Form Submission, Timer, History Change,
  Scroll Depth, Element Visibility, JavaScript Error and YouTube Video

**Do not add a template from any vendor other than Meta, Reddit and Google.** The site
cannot stop another vendor's template from running. It can only stop it loading its own
script or sending data anywhere new, and what it reads from the page could still leave
through a host the site allows. Adding a vendor is a change to the site and to the privacy
policy, so ask Kyle.

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
