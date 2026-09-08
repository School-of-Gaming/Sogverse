# Appendix A. Visual identity reference

*Excerpt of the School of Gaming Brand Voice & Identity Guidebook v2.0 (Jul 21, 2026), verbatim. The index in this folder's CLAUDE.md says what was left out.*

This appendix documents the visual assets held in the Brand Kit as of Jul 21, 2026: the logo set, the color palette, and the typeface. It is a working reference for anyone laying out copy, not a full visual identity manual. Several rules here are the most defensible reading of the assets rather than a designer's ruling, and those are flagged. Where this appendix and a future dedicated visual manual disagree, the visual manual wins.

## A.1 The logo

The mark is a **hexagonal badge**: an angular "SOG" wordmark in a gamified, e-sports display face, with "SCHOOL OF GAMING" set in a bold condensed sans beneath it, all inside a rounded hexagon. The badge shape matters. It reads as a crest or an emblem, which is exactly right for the Scouts of the Online Age positioning and for a school that hands out Achievement Badges. Treat it as a badge, not a wordmark, and it will keep telling the right story.

### The four variants and when to use each

| File | Badge | Mark | Use on |
| :---- | :---- | :---- | :---- |
| `SOG_logo_yellow_black` | Amber | Black | The primary lockup. Light and white backgrounds. This is the default. |
| `SOG_logo_yellow_white` | Amber | White | Amber badge where the black mark would clash with adjacent dark elements. Use sparingly. |
| `SOG_logo_black` | Black | Reversed | Dark backgrounds, single-color print, and any context where amber cannot render. |
| `SOG_logo_white` | White | Reversed | Photography and colored backgrounds where a clean knockout is needed. |

**Default to `yellow_black`.** It is the version on the live sites and the one people will come to recognize. Reach for another variant only when the background makes the default illegible.

### Logo rules

These are conservative defaults, safe until a visual manual says otherwise:

- **Give it room.** Keep clear space around the badge of at least the height of the "SOG" letterforms on all sides. Crowding a crest cheapens it.
- **Never restretch, recolor, rotate, or add effects.** No gradients on the badge, no drop shadows, no outlines, no swapping the amber for another palette color.
- **Never separate the parts.** The "SOG" monogram and the "SCHOOL OF GAMING" line travel together. If you need a smaller mark, that is a decision for a designer, not an improvisation.
- **Minimum size:** do not place the full badge below roughly 32px tall on screen, where "SCHOOL OF GAMING" stops being legible.
- **The badge sits on a background, never in a sentence.** Do not use the logo as a letter or a word in running copy.

## A.2 Color palette

Ten colors plus neutrals. The organization below follows the two color sheets in the Brand Kit.

### Signature and hero

| Swatch | Hex | Role |
| :---- | :---- | :---- |
| Amber | **\#FAA901** | The signature color. The logo badge, and the color most associated with School of Gaming. Primary accent: highlights, key CTAs, moments that should feel like us. Amber always wins for the main call to action. |
| Violet | **\#8F00E2** | The Energy color, the force that powers Sogverse. Use for high-energy, electric, exciting moments (launches, big news). **Not** for quiet, safety, or trust-building parent content. |
| Ink | **\#121212** | Primary text and the "black" of the black logo. A soft near-black, never pure \#000000. |
| White | **\#FFFFFF** | Primary background. |

### The Yty-Element colors

The four remaining families are the Yty-Element colors. This mapping is fixed (Section 1 and Section 12), and it is how a value gets a consistent visual identity across badges, club pages, and social content.

Each club page carries its dominant Yty-Element color as a subtle cue. On social, color-code content by the value it serves: Harmony/pink for community, friendship, and testimonials; Glow/green for growth, milestones, and progress; Valor/orange for challenges, camps, and courage; Wit/blue for learning, tips, and how-to; Violet for high-energy launches and Sogverse announcements; amber for general brand and CTAs.

### Neutrals

| Swatch | Hex | Role |
| :---- | :---- | :---- |
| Off-white | **\#F7F7F7** | Section backgrounds, cards. |
| Light grey | **\#EBEBEB** | Borders, dividers, disabled states. |
| Mid grey | **\#9E9E9E** | Secondary text, captions, metadata. |

### How to use color, by lore level

The palette is loud on purpose, and the same restraint that governs vocabulary should govern color. A parent-facing email awash in six vivid hues undercuts the calm, credible register Section 2.2 asks for.

- **Levels 0 and 1 (parents, partners, safety, billing):** amber as the single accent, ink text, white and off-white grounds, grey for support. Introduce a second palette color only with intent. Calm surfaces carry credibility.
- **Level 2 (families, story to a mixed audience):** amber plus one palette family. Two accents maximum.
- **Level 3 (gamers, community, store, in-world):** the full palette is welcome. This is where the loudness belongs.

**Colour usage rules that hold everywhere:**

- **Amber always wins** for primary CTAs and brand moments.
- **Violet sets the tone of the Sogverse world**, for electric, high-energy moments. Never for quiet, safety-focused, or trust-building parent content.
- **Yty-Element colours accent content, they are not backgrounds for long text.**
- **Never use all six colours on one page.** Amber plus one supporting colour is the default.
- **Text is always ink (\#121212) or white (\#FFFFFF)**, never coloured text on a coloured background.

### Accessibility, which is not optional for this audience

- **Amber (\#FAA901) on white fails normal-text contrast.** It is a background and large-graphic color, not a body-text or small-link color. Amber text on white is a legibility problem, and on a site read by children and by parents at night it is one we cannot afford. For text and links on white, use ink or a sufficiently dark palette color.
- **Check every text-on-color pairing against WCAG AA** before it ships. The soft variants especially are decorative, not text-safe on white.
- **Never carry meaning by color alone.** A color-coded specialization or element also needs a label, because a meaningful share of gamers are colorblind.

## A.3 Typography

### The three working faces

**Poppins is the workhorse.** Headings and body copy on the website and in most contexts. A geometric, rounded, warm sans that reads as trustworthy to parents and approachable to children, which is exactly the ally-at-the-table register. Free on Google Fonts, full weight range. Fallback: `system-ui, sans-serif`.

**Crimson Pro is the serif accent.** A humanist serif kept for special use: editorial headlines, pull quotes, the Princi-Pal's long-form pieces, and moments that want a little more warmth or gravity than Poppins gives. It is a seasoning, not a staple. Never set long UI or body text in it on screen.

### A working type scale for the website

| Style | Font | Size | Weight | Line height | Use |
| :---- | :---- | :---- | :---- | :---- | :---- |
| H1 | Poppins | 48-56px | SemiBold 600 | 1.1 | Hero headlines |
| H2 | Poppins | 36-40px | SemiBold 600 | 1.2 | Section titles |
| H3 | Poppins | 24-28px | SemiBold 600 | 1.3 | Card and sub-section titles |
| H4 | Poppins | 18-20px | Regular 400 | 1.4 | Small headings |
| Body L | Poppins | 18px | Regular 400 | 1.7 | Main body copy |
| Body S | Poppins | 14px | Regular 400 | 1.5 | Captions, labels, nav |
| CTA | Poppins | 16px | SemiBold 600 | 1 | Button labels |

**Type rules that hold everywhere:**

- **Headings are sentence case.** Never ALL CAPS, never Title Case Every Word. This is a house rule with teeth; ALL CAPS reads as shouting and undercuts the calm register.
- **Emphasis is bold, not italic**, in UI and body. Reserve italics for genuine titles and the rare editorial flourish.
- **Body line length caps around 70 characters** on desktop for readability.
- **Two or three weights per piece**, no more. The family gives you many; using many is how a layout starts to look nervous.

## A.4 Trademark and legal status

The logo is a **registered European Union trade mark**. This is a real legal asset, and it changes how we write two things: the company name and the trademark symbol. Nothing here is legal advice; for anything contentious, ask the representative named below.

### Registration facts

| Field | Detail |
| :---- | :---- |
| Mark | SOG SCHOOL OF GAMING, figurative (the logo), in color |
| EUTM number | 019299328 |
| Proprietor | School of Gaming Galactic Oy, Isokatu 56, 90100 Oulu, Finland |
| Representative | Reggster Oy, Helsinki |
| Filed | Jan 05, 2026 |
| Registered | Apr 24, 2026 |
| Registration published | Apr 27, 2026 |
| Renewal due | Jan 05, 2036 |
| Territory | All European Union member states |
| Classes | Nice 16 (printed matter, educational supplies), 41 (education, entertainment and sport; club education services; training; academies; video game services; competitions), 42 (IT services, software, video game development, SaaS and PaaS) |

**Two things worth noticing beyond the paperwork.** The registration covers the color logo specifically, which is another reason the amber `yellow_black` lockup is the one to protect and lead with. And the classes read like a description of the business we actually are: "club education services", "academies", "video game services", and "competitions" are all registered, which quietly backs the language this guide already uses.

### The legal entity

The registered proprietor is **School of Gaming Galactic Oy**. That is the company. "School of Gaming" and "SOG" are the brand names it trades under.

- **In brand copy**, everywhere in this guide, we are School of Gaming, or SOG. Never the full legal name in marketing.
- **In legal, contractual, invoicing, and formal partner copy**, the entity is School of Gaming Galactic Oy. Terms, privacy policy, contracts, funding applications, and the like use the full name at least once.
- The Princi-Pal's "accountable" signature register in Section 6 may carry the full entity in genuinely formal documents.

### The ® symbol

Now that the logo is a registered EUTM, the ® symbol is available and its use signals a defended asset.

- **Use ® with the logo** on the website footer, product packaging, and formal or partner-facing materials, at least on first or most prominent appearance. Once per page or screen is enough; peppering every instance looks anxious.
- **Territory matters.** The registration is EU-wide. Outside the EU the mark may not be registered, and ® should not be claimed where it is not. When in doubt in a non-EU market, ask the representative before using ®.
- **In running body copy**, writing "School of Gaming" as words needs no symbol. The ® attaches to the logo mark, not to every mention of the name in a sentence.
- **Never fake it.** Do not use ® on anything not actually registered, and do not use it as decoration. If a future sub-brand is unregistered, the correct symbol is ™, which claims a mark without asserting registration. Confirm status before choosing between them.

### "Gedu" as a word mark, pending

A separate registration for **Gedu** as a *word* is planned for autumn 2026. This matters because it is a different kind of protection from the logo. The current EUTM protects the figurative mark; a word mark on "Gedu" would protect the term itself, which is the single most valuable invented word we own and the one a competitor would most plausibly copy.

Until that registration completes:

- **Keep using Gedu exactly as this guide already specifies.** Consistent, capitalized, never generic. Consistent use strengthens the application; sloppy use weakens it.
- **Do not attach ® to "Gedu"** yet, because it is not registered. Do not attach ™ either without checking with the representative, since a premature or incorrect symbol can complicate a pending filing.
- **Guard against genericization.** The fastest way to lose a word mark is to let the word become a generic noun. Always "a Gedu" or "our Gedus", a proper role; never "gedu" lowercased as though it were an ordinary job title. This is exactly why Section 5.2 bans "teacher, tutor, coach" as substitutes: every correct use of Gedu is also trademark hygiene.

Once registered, update this appendix with the number and date, and add the symbol guidance for "Gedu" alongside the logo. Logged in Section 12.
