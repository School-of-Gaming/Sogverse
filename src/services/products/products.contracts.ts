import { z } from "zod";
import { Constants } from "@/types";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { SUPPORTED_CURRENCIES } from "@/lib/constants/currency";
import {
  isProductTimezone,
  isSeededCountry,
} from "@/lib/constants/location-hierarchies";

/**
 * Contracts for the admin product create/update routes.
 *
 * Both routes take a plain JSON body matching CreateProductInput /
 * UpdateProductInput — see products.service.ts. No file ever rides along:
 * a product's picture is a catalogue entry it points at by id, uploaded
 * through its own route long before a product is saved. Validation here is
 * structural only (types and enums); semantic rules (age ranges, date
 * ordering, the at-least-one-en-or-fi-translation rule) stay in the RPCs'
 * CHECKs and RAISEs, same as before.
 */

const productTranslationInput = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  name: z.string(),
  short_description: z.string(),
  // The marketing blurb as authored markdown; null = this locale has none, and
  // the RPC stores SQL NULL. The form folds a blank editor to null rather than
  // sending "", which the column's CHECK refuses.
  long_description: z.string().nullable(),
});

const scheduleSlotInput = z.object({
  weekday: z.number(),
  start_time: z.string(),
  duration_minutes: z.number(),
});

const priceInput = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
  price_cents: z.number(),
});

/** Fields shared by create and update. */
const productDataBase = z.object({
  billing_mode: z.enum(Constants.public.Enums.billing_mode),
  translations: z.array(productTranslationInput),
  topic: z.enum(Constants.public.Enums.product_topic),
  // Who may occupy a seat. Mutually inclusive, and the DB CHECKs are what
  // enforce the two rules that matter: at least one must be true, and the age
  // range is present exactly when `for_gamers` is. Both are required on the
  // wire because both RPC parameters are non-defaulted — an omitting caller
  // must fail loudly rather than silently reset a product's audience.
  for_gamers: z.boolean(),
  for_parents: z.boolean(),
  // Null when the product has no gamer audience: age is a property of the
  // children a product serves and of nothing else, so an adults-only product
  // carries no range rather than a sentinel one.
  min_age: z.number().nullable(),
  max_age: z.number().nullable(),
  // Who the product was *designed* for — a different question from the audience
  // above, which says who may hold a seat. One tag or none: null is untagged,
  // the ordinary state, and it renders nothing anywhere.
  //
  // Required-nullable, on create and update alike, and the update half is the
  // load-bearing one. The RPC parameter is `DEFAULT NULL` (it has to be: null is
  // a legal tag, no CHECK backstops it, and codegen cannot express an explicit
  // null for a non-defaulted argument), so an omitted field would reach a
  // function that assigns every editable column and clear the tag without
  // anybody asking. Demanding the field on the wire is what makes clearing a
  // deliberate `null` rather than an accident of omission — the route then maps
  // null → undefined → DEFAULT NULL → cleared.
  tag: z.enum(Constants.public.Enums.product_tag).nullable(),
  // The one country whose families may enrol, or null for no lock — a third
  // dimension again, independent of both the audience above and the spoken
  // language below (a club delivered in English is not a club for one country).
  //
  // Required-nullable for exactly the reason `tag` is, and the update half is
  // again the load-bearing one: the RPC parameter is `DEFAULT NULL` because
  // codegen cannot express an explicit null for a non-defaulted argument, so an
  // omitted field would reach a function that assigns every editable column and
  // silently unlock the product. Demanding the field is what makes unlocking a
  // deliberate `null`; the route then maps null → undefined → DEFAULT NULL.
  //
  // Constrained to the SEEDED countries rather than to the CHECK's alpha-2
  // shape, because this is the boundary that can see the location config. A lock
  // pointing at a country whose municipalities were never seeded is one no
  // family's stored location could satisfy — an unpassable gate that looks from
  // the admin form exactly like a working one. The database deliberately holds
  // only the shape invariant: which countries are seeded changes as rows land,
  // so an enum or FK there would need a migration per country and would turn an
  // already-stored lock into a violation the day one is un-seeded.
  //
  // `refine` rather than `z.enum` because `CountryConfig.code` is typed
  // `string`, so a tuple built from it narrows to nothing a literal union could
  // be made of — the enum would buy an error message and no type at all.
  region_lock_country: z
    .string()
    .refine(isSeededCountry, {
      message: "Not a country products can be locked to",
    })
    .nullable(),
  // Does every member owe a creation — a link to the thing they made — by the
  // time this product ends? An admin decision, deliberately not derived from
  // `topic`: not every Roblox-Studio product is Roblox-sponsored, so a contract
  // obligation is stated rather than inferred. Staff-facing in every direction:
  // no family document carries the column, and the flag changes signals rather
  // than the authoring surface.
  //
  // Required and never optional, and the update half is the load-bearing one
  // once more — but for the *opposite* reason to `tag` and `region_lock_country`
  // above. Those are required-nullable because null is their legal empty; this
  // column is NOT NULL, so its RPC parameter defaults to `false` rather than to
  // null, and an omitted field would reach a function that assigns every
  // editable column and quietly unflag the product. A plain boolean is
  // therefore the whole shape: `false` is the explicit "owes nothing", and
  // there is no null for it to mean.
  requires_gamer_creations: z.boolean(),
  spoken_language_code: z.enum(Constants.public.Enums.spoken_language),
  // The catalogue entry this product's picture comes from, or null for a
  // product with no picture.
  //
  // Required-nullable, and required is the load-bearing half: the route writes
  // this column on every save, so an omitted field and "remove the picture"
  // would be the same request. Demanding it makes removal a deliberate null.
  //
  // The served column, `image_path`, is NOT on the wire at all and never is —
  // a database trigger derives it from this id on every write to `products`,
  // so no client can point a product at an arbitrary storage object and no app
  // code writes a path.
  image_id: z.string().uuid().nullable(),
  // Gedu/admin-only lesson-material link. It is a field of the product *form*
  // but not a column on `products` — the RPC files it under
  // `product_staff_details`, whose read grant no parent or anonymous visitor
  // holds. Null (or blank) means no row.
  material_url: z.string().nullable(),
  location_id: z.string().nullable(),
  is_remote: z.boolean(),
  signup_threshold: z.number().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  // The IANA zone the product's wall clocks are authored in — its schedule
  // slots and its registration drop.
  //
  // Constrained to the zones the seeded countries actually declare, the same
  // way `region_lock_country` is constrained to the seeded countries, and for
  // the same reason: this is the boundary that can see the location config,
  // while the database holds only the shape invariant. A zone we do not operate
  // in is not a value an admin can mean — the form cannot offer it, so a
  // request carrying one did not come from the form.
  //
  // `refine` rather than `z.enum` for the same reason the lock uses one: the
  // zones are `string`s derived from the country config, so a tuple built from
  // them narrows to nothing a literal union could be made of.
  timezone: z.string().refine(isProductTimezone, {
    message: "Not a timezone products can be scheduled in",
  }),
  seat_count: z.number().nullable(),
  waitlist_enabled: z.boolean(),
  registration_opens_at: z.string(),
  is_visible: z.boolean(),
  schedule_slots: z.array(scheduleSlotInput),
  prices: z.array(priceInput),
  // The consent documents a parent must agree to before enrolling — slugs from
  // `consent_documents`, empty for almost every product.
  //
  // Required and never optional, and the update half is the load-bearing one
  // again: `update_product` replaces the whole requirement set on every call, so
  // an omitted field would silently drop a product's enrolment conditions. An
  // empty array is the explicit "requires nothing", and the RPC treats it and
  // NULL alike — which is why this one, unlike `tag` and `region_lock_country`,
  // is a plain array rather than required-nullable: the empty case is already
  // expressible without a null.
  //
  // Only shape is checked here. An unknown slug is refused by the foreign key
  // into `consent_documents` — the whitelist lives in the database, admins are
  // trusted, and a slug this deploy has never heard of is a broken deploy rather
  // than an attack.
  required_consent_slugs: z.array(z.string()),
  // The marketing consents the signup panel ASKS about — never requires.
  //
  // Required and never optional, mirroring the slugs above and for the same
  // load-bearing reason: the writer behind it replaces the whole ask set on
  // every call, so an omitted field on an update would silently drop a
  // product's asks. An empty array is the explicit "asks nothing", which the
  // writer reads exactly as it reads NULL — so, again unlike `tag` and
  // `region_lock_country`, this is a plain array rather than required-nullable.
  //
  // Unlike the slugs, this one is narrowed here rather than left to a foreign
  // key: the values are a Postgres ENUM, so an unknown one is a type error
  // rather than a missing row, and the enum is exactly what codegen gives us to
  // check against. Note that the schema admits `school_of_gaming` while the
  // admin form deliberately never offers it (see
  // `ATTACHABLE_MARKETING_CONSENT_TYPES`): what a product may *store* is a
  // database question, and what a form *offers* is a product decision — the
  // wire is not the place to re-litigate the second.
  marketing_consent_types: z.array(
    z.enum(Constants.public.Enums.marketing_consent_type),
  ),
  // Per-session operating fees, a single EUR amount in integer cents. State is
  // derived from the value (the form enforces it): null = unknown/none,
  // 0 = volunteer (free), > 0 = a real fee. Gedu fees are int >= 0 here; the
  // municipality fee's `> 0` and muni-only rules are cross-checked by the DB
  // CHECK constraints on `products`, so we only assert int at the boundary.
  primary_gedu_fee_cents: z.number().int().nonnegative().nullable(),
  assistant_gedu_fee_cents: z.number().int().nonnegative().nullable(),
  municipality_fee_cents: z.number().int().nullable(),
});

/** The JSON body of POST /api/admin/products/create. */
export const createProductData = productDataBase.extend({
  product_type: z.enum(Constants.public.Enums.product_type),
  // Optional: the RPC defaults it (p_status?) and the old route tolerated
  // absence, though the admin form always sends it.
  status: z.enum(Constants.public.Enums.product_status).optional(),
});

/** The JSON body of POST /api/admin/products/[id]/update. */
export const updateProductData = productDataBase;

/**
 * Response of the admin product create/update routes.
 *
 * `warning` is the soft-warning half: the product was written, but the
 * statement that linked its catalogue entry was not. The realistic cause is a
 * race — another admin removed the entry between this form loading and this
 * save — and the product itself is fine and editable, so answering with an
 * error would throw away a good save to report a bad picture. The message is
 * admin-facing English and says what to do (retry from the edit page).
 */
export const productIdResponse = z.object({
  product_id: z.string(),
  warning: z.string().optional(),
});
