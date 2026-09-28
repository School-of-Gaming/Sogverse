# Public pages

The project to make the three pages a prospective family meets first, **home, About and
the shop**, the best they can be. This doc holds the goal, the job each page does, the
current state of each, the assets the work draws on, and the open tasks. Which pages are
indexed and how they present to crawlers is `docs/architecture/discoverability.md`. How
copy should sound is the Brand Voice Guidebook excerpt in `packages/sog-ui/docs/guidebook/`,
the authority on voice, summarised here only where it binds these three pages.

**Standing goal: a parent who lands on any of the three pages understands what we offer
within eight seconds, knows what to do within thirty, and trusts us enough to enrol a
child.** Conversion to a paying club is the measure, not time on page.

## Who reads these pages

Only prospective families. The proxy sends a signed-in reader from `/` to their dashboard,
so the home page never has to serve an existing customer and can be a pure sales page.
About and the shop are reachable signed in, and existing families use the About FAQ as
reference.

The reader is a parent: they love their child, are unsure gaming is good for them, and
often arrive carrying guilt or fresh from an argument about it. They want four things, in
this order: **their child is safe, something is being learned, they can stay involved
without becoming a gamer, and permission to stop feeling bad** (Guidebook `audience.md`).

## The rules that bind all three pages

These come from the Guidebook (`channels.md` §8.1, `audience.md`, `vocabulary.md`,
`decision-log.md`); open those files for the reasoning. They are listed here because each
one is currently broken somewhere on these pages or was nearly broken in the first review.

- **Order: plain-language hero, then the concrete facts, then the story.** The facts are
  who supervises, how long a lesson is, what it costs and how to start. Sogverse lore is the
  reward for reading, never the toll for entry.
- **Lore level 1.** Yty and the Yty-Elements do not appear; the same substance is
  presented as **Human Skills**: emotional intelligence, empathy, communication,
  collaboration, creativity, critical thinking, problem-solving.
- **Gedu is glossed, not dropped.** "Game Educator" on first mention, "Gedu" after. Never
  teacher, tutor, coach or instructor.
- **Club is the group, lesson is the 90-minute session.** Never used interchangeably.
- **Screen time is transformed, never fought.** The tagline is the permitted construction;
  "cut down on screen time" or "a healthy alternative to screen time" is not.
- **Specifics reassure, slogans do not.** "Safe space" as a slogan is banned; say what is
  true: moderated, supervised, a Gedu is always present. Never fear-sell other platforms.
- **Price is "from €59 per month"**, never a single figure, because prices vary by club.
- **Lengths:** hero headline 4–9 words; hero subhead 15–30 words, one sentence a sceptical
  parent would repeat to their partner; section headings 3–7 words, questions allowed;
  body paragraphs 40–70 words.
- **Calls to action are verb-first, 2–4 words, and never "Learn more".**
- **Navigation** is named for what a parent searches: Clubs, Camps, For parents, How it
  works, About (Finnish: Kerhot, Leirit, Opas vanhemmille, —, Meistä).

**Rule (owner, 2026-09-25): every look-and-feel decision is judged at both desktop and
mobile widths.** A layout, section order or visual that works on one and not the other is
not done. The first screen is judged twice, because a parent on a phone sees far less of it
before scrolling, and a cookie banner covers more of it there.

## Each page's job

**Proposed 2026-09-25, not yet decided.**

| Page | Job | Holds |
| --- | --- | --- |
| Home | Persuade | Hook, proof, the offer, risk reversal, one call to action. Every claim is one short line backed by one fact, linking to the About answer that proves it. |
| About | Be the reference | Who we are, what we value, the full FAQ. Where a careful parent goes to check a claim the home page made. |
| Shop | Help a parent choose | Find the right club for this child fast, and see enough to commit: who, when, what it costs, what the child needs. |

The failure this division corrects: today the home page makes general claims and the About
page holds the facts that would prove them, written as precise reference text rather than
as a case to a parent.

## Current state (reviewed 2026-09-25)

Reviewed from the live page text, the repo source, and headless screenshots of production
at 1440×900 (desktop) and 390×844 (phone), English and Finnish. The site renders its dark
theme whatever colour scheme the browser asks for, so there is one look to judge, not two.
The Finnish pages were captured but only checked for layout, not for copy.

**Across all three pages, on a first visit:** the cookie banner is a fixed bottom bar
covering 17% of a desktop screen (20% in Finnish) and **43% of a phone screen (48% in
Finnish)**. On a phone it hides the hero's subhead and both of its buttons; only the
headline shows. What the banner must say is a privacy decision and is not this project's
to cut, but how much of a phone it covers is a layout decision.

### Home

**Works:** the tagline "Where Screen Time Becomes Quality Time" is the strongest line on
the site. It meets the parent's guilt and offers a trade. The page is short and fast.

**Costs conversions:**

- **No imagery at all.** Text, four icons and three numbered circles. A parent cannot
  picture a lesson with a live Game Educator from prose.
- **No proof.** No testimonial, number, face or partner. The scale on the legacy site (100
  municipalities, 250 schools) is not mentioned.
- **The offer is absent.** No price, lesson length, age range or format. The
  differentiators exist only as shop listings: neuroinclusive clubs, language-immersion
  clubs (English, Swedish, French), Fortnite esports, Roblox game-making, in-person clubs in
  Lauttasaari.
- **Safety gets one word**, "safe", in the closing card, and as a slogan.
- **The risk reversal is missing.** The 30-day money-back guarantee and cancel-anytime
  billing live only in About FAQ answers.
- **Skills are unnamed.** "Designed to build real skills" never says which.
- **The subhead is 45 words** against a 15–30 target, and abstract ("skilfully designed",
  "playful learning experience").
- **Every call to action is account creation**, including step 1 of "How it works", though
  the shop is public and a parent wants to choose a club first. The secondary hero call to
  action is "Learn more about us".

**How it looks:**

- **Desktop:** the whole page is 2,910 px, about three screens. The hero is centred
  text on a flat dark ground with a purple rule; about 200 px of empty space separates it
  from the next section. The four feature cards are grey body text on dark grey, and every
  section below the hero has the same shape: a centred heading, a grey subheading, then
  text.
- **Phone:** the header drops the "School of Gaming" wordmark and shows only the SOG
  badge. The hero opens with about 170 px of empty space, and the subhead renders at
  roughly 20 px over eight lines, so the buttons sit at the very bottom of the first
  screen. The banner hides them completely. The four cards then stack into roughly one and
  a half screens of text.
- **The shop already has the imagery the home page lacks:** every club card carries a
  bright in-game scene. The home page uses none of it.

### About

**Works:** it already holds nearly all the material the home page needs, and it holds it
accurately.

- The 30-day money-back guarantee, no form and no reason required.
- Monthly billing, cancel anytime at no cost.
- A written report after every lesson, with photos.
- Specific safety facts: a criminal record extract before a Gedu is certified; no direct
  messages anywhere; a voice room open only to its group, only during its window; nothing
  recorded; a parent PIN in front of anything that spends money.
- Weekly challenges between lessons, holiday camps, community events and tournaments.
- The gamer's oath, which the Guidebook calls one of our strongest and most under-used
  assets.

**Costs conversions:**

- **The FAQ is written to be precise, not persuasive.** Correct for reference, but no
  answer leads with the reassurance before the mechanism.
- **The hero repeats the home page's tagline and subhead** instead of doing a job of its
  own.
- **Yty is presented to parents at full lore** (Harmony, Glow, Valor, Wit, Yty-Points,
  Achievement Badges), against the level-1 rule. It belongs in the story section as Human
  Skills first, if at all.
- **The Princi-Pal quote** opens the page with a character a new visitor has not met.
- **The page is a dead end.** It has no call to action anywhere: after the Yty section
  comes the footer. A parent convinced by the FAQ has to find "Shop" in the header.
- **The FAQ opens with the least useful questions.** "What is Sogverse?" and "Is this
  school?" come first; cost, cancelling, vetting and "can strangers talk to my child?" sit
  at positions 7–12 of 16.

**How it looks:** 5,728 px on desktop, 8,300 px on a phone. It has no imagery.
- **Desktop:** the four value cards have unequal content, so "Family in the loop" is half
  empty beside the long safety card. "How our clubs work" and "For parents" are plain
  paragraphs with no visual break between them.
- **Phone:** the first screen is the page title, an eight-line subhead that repeats the
  home page, and the Princi-Pal quote. The section pill (About / FAQ / Yty) is the only
  navigation aid.

### Shop

**Only the browse page has been reviewed so far.** On 2026-09-25 it listed 28 clubs,
viewable signed out. Each card shows an in-game image, age range, level, game edition,
lesson language, day and time, format, a one-line description and the price.

**Works:** it is the only one of the three pages with imagery, and the cards carry
exactly the facts a parent compares.

**Costs conversions:**

- **It opens straight into the grid** with the heading "Clubs". There is no line saying
  what a club is, what every club includes (a Game Educator, 90 minutes a week, a report
  afterwards), or that there's a 30-day money-back guarantee.
- **The strongest reasons to buy are just cards among many.** The neuroinclusive clubs
  (€89) and the language-immersion clubs sit in a flat list, reachable only through a
  filter.
- **Near-duplicates dominate.** "Minecraft: Cozy Adventures" appears many times with the
  same image and description, varying only by age, day and language. The grid reads as
  one product repeated, and the other offers are buried beneath it.
- **Immersion cards mix two languages visually.** The English Immersion card shows a
  large UK flag in its image and an FI badge. The badge is the lesson language (the club
  is taught in Finnish), but a parent is left to work that out.
- **The filter panel has twelve groups and about 25 chips,** several in internal
  vocabulary (Creator Studio, Game Studio, AI, "For parents" versus "For families").
- The nav label is "Shop"; the agreed parent-facing label is "Clubs". The Finnish URL is
  `/fi/kauppa`.

**How it looks:**

- **Desktop:** a filter sidebar and a three-column grid; the whole list fits in 5,901 px.
- **Phone:** the filters collapse behind one "Filters" button, and each card takes almost
  a full screen, so the list runs to about 15,900 px, roughly 19 screens of scrolling. The
  first screen is a single Cozy Adventures card.

**Not yet reviewed:** the product detail page and the enrolment panel.

## Proposed home page structure

**Proposed 2026-09-25, not yet decided.** Order follows the Guidebook: hero, facts, story.

1. **Hero:** keep the headline. One concrete subhead (weekly online clubs for ages 7–17,
   a Game Educator in every lesson, from €59 per month). Primary call to action "Find a
   club". Under it: cancel anytime, 30-day money-back guarantee. A real lesson visual.
2. **The emotional proof:** the "quiet and shy boy" testimonial (T4), large.
3. **What a lesson is:** 90 minutes, the Gedu greets the group, a story-driven adventure
   over voice, a written report to the parent afterwards.
4. **What they grow:** the Human Skills, named plainly, with the programming testimonials
   (T6, T7).
5. **Safety you can check:** the concrete facts from About, the Gedu vetting, T13 and T14.
6. **Find the right club:** tiles for neuroinclusive and small groups (T3), language
   (T1, T2), programming and game-making, in person, camps; each opens a filtered shop.
7. **You stay involved:** lesson reports with photos, parent game education (T8).
8. **More parents:** the remaining testimonials.
9. **Short answers** to four questions (equipment, cost, safety, "isn't this more screen
   time?"), linking to the full FAQ.
10. **Closing call to action:** price and the guarantee.

## Testimonial bank

Thirteen distinct parent testimonials, exported from the company Google Drive as two
folders of 1080×1080 PNG cards, "Testimonials" (Finnish) and "Testimonials in English".
Card N in one folder translates card N in the other; English card 14 has no Finnish twin,
and card 11 repeats card 3 under a different handle, so it is not listed.

**Attribute by role and country only.** Several cards carry social-media names and handles
that look invented and change between languages; published on the site as posts they
would read as fabricated. The owner confirmed on 2026-09-25 that every family consented to
being quoted, and that names are left out. The
Finnish below corrects two typos baked into the images ("joko viikko" → "joka viikko",
"rähjäämistö" → "rähjäämistä"). No card gives a child's age or a date.

| # | English | Finnish | Attribution | Fits |
| --- | --- | --- | --- | --- |
| T1 | Our son's Finnish has become stronger thanks to the Minecraft club. I also recommend it to other expatriate Finnish families! | Poikamme suomen kieli on tullut Minecraft-kerhon ansiosta vahvemmaksi. Suosittelen myös muille ulkosuomalaisille perheille! | Mom, USA / Äiti, USA | Language |
| T2 | My daughter's Finnish has improved tremendously in just a month! The gaming educators have been very skilled, friendly, and patient. This really works! | Tyttäreni suomen kieli on kehittynyt kuukaudessa valtavasti! Pelikasvattajat ovat olleet tosi taitavia, ystävällisiä ja pitkämielisiä. Tämä teidän juttu todella toimii! | Mom, Norway / Äiti, Norja | Language |
| T3 | Large groups make our child anxious. This is the perfect way for us to engage in a hobby and make new friends. | Isot ryhmät jännittävät lastamme. Tämä on täydellinen tapa meille harrastaa ja tutustua uusiin kavereihin. | Mom, Finland / Äiti, Suomi | Small groups, neuroinclusive |
| T4 | The club is the highlight of my son's week. Every week, my quiet and shy boy transforms into a laughing, loudly chatting child when he gets to interact with like-minded kids. The club's content and the educators' expertise have pleasantly surprised me. | Kerho on pojan viikon kohokohta. Hiljaisesta ja arasta pojasta kuoriutuu joka viikko nauravainen ja kovaan ääneen höpöttävä lapsi, kun pääsee samanhenkisten lasten kanssa puuhailemaan. Kerhon sisältö ja kasvattajien osaaminen on yllättänyt minut todella positiivisesti. | Mom, Finland / Äiti, Suomi | Hero proof |
| T5 | Nothing else, no activity or hobby, has made my child sigh with happiness like this. | Mikään toinen asia, harrastus tai juttu ei ole saanut lastani huokailemaan sitä kuinka onnellinen on. | Mom, Finland / Äiti, Suomi | Hero proof |
| T6 | SoG clubs are the best! A direct answer to my child's wishes to learn coding and to create and maintain servers. | Sogin kerhot on parasta! Suora vastaus lapsen toiveisiin oppia koodaamaan ja tekemään ja ylläpitämään servuja. | Dad, Finland / Isä, Suomi (programming club) | Skills |
| T7 | Absolutely fantastic from a parent's perspective too. The child learned a lot, got to play safely and in good company, got excited, made new friends, and was speaking basic programming language fluently after just a few sessions. | Ihan huippu juttu näin vanhemman näkökulmastakin. Lapsi oppi valtavasti, sai pelata turvallisesti ja hyvässä seurassa, innostui, sai uusia ystäviä ja puhui jo muutaman kerran jälkeen sujuvasti ohjelmistokielen alkeita. | Dad, Finland / Isä, Suomi (programming club) | Skills |
| T8 | My child found like-minded friends through gaming. Parents are provided with appropriate and educational information about the activities and gaming education. The activities are developed with a focus on skills like emotional intelligence. A safe place for children to practice online gaming. Highly recommended. | Lapselle löytyi samanhenkistä seuraa pelien parissa. Toiminnasta ja pelikasvatuksesta jaetaan asiallista ja sivistävää tietoa vanhemmille. Toimintaa kehitetään esim. tunnetaitoihin panostaminen. Turvallinen paikka lapsille harjoitella verkkopelaamista. Suosittelen lämpimästi. | Mom, Finland / Äiti, Suomi | Parents involved |
| T9 | The camp was a solid 6/5 according to my son. A big thank you for the camp! | Fortnite-syyslomaleiri oli pojan mielestä ihan ?/5. Iso kiitos leiristä! | Mom, Finland / Äiti, Suomi | Camps |
| T10 | A really good setup! The kids get to do what they love and they get supported in it the right way. | Todella hyvä setti! Jengi tekee mitä rakastaa ja saa tukea siihen oikealla tavalla. | Dad, Finland / Isä, Suomi | General |
| T12 | School of Gaming has been a really positive experience for both the child and the parents. The children have had great gaming experiences with new friends in a safe gaming environment with experienced instructors - I can recommend it! | School of Gaming on ollut todella positiivinen kokemus sekä lapselle, että vanhemmille. Lapset ovat saaneet hienoja pelikokemuksia uusien pelikaverien kanssa turvallisessa peliympäristössä kokeneitten ohjaajien kanssa - voin suositella! | Dad, Finland / Isä, Suomi | General |
| T13 | Gaming is fun and supervised. No bullying, no arguing, or bad vibes. | Pelaaminen on hauskaa ja valvottua. Ei kiusaamista eikä rähjäämistä tai pahaa mieltä. | Mom, Finland / Äiti, Suomi | Safety |
| T14 | A really good first touch with the world of gaming and online communities. SoG's rules and values give us parents a feeling of trust! | — | Mom, Finland (Minecraft club) | Safety |

**T9 is unusable until fixed:** the Finnish card says a Fortnite camp in the autumn break
and has lost its rating digit to a missing glyph; the English card says a summer camp and
6/5. Which is right needs the source.

## Tasks and open questions

- [ ] Owner decision: the division of jobs between the three pages, above.
- [ ] Owner decision: the proposed home page structure, above.
- [ ] Assets: lesson imagery and Gedu photos are planned but do not exist yet; headline
      numbers safe to publish are still needed.
- [ ] Testimonials: resolve T9; ask for the child's age where it can still be had.
- [ ] Shop: review the product detail page and the enrolment panel at both widths.
- [ ] Cookie banner on phones: bring its footprint down from 43–48% of the first screen without changing what it says.
- [ ] Re-screenshot at both widths after every change to these pages. The capture script is not in the repo yet; decide whether it belongs there.
- [ ] Finnish copy: review the Finnish versions of all three pages; the review above read
      only the English.
- [ ] Municipality clubs: whether the home page mentions them at all, given the goal is
      paying families. Proposed: no, leave them to the header and the FAQ.

## Decision log

| Date | Decision |
| --- | --- |
| 2026-09-25 | Home, About and the shop are treated as one set, reviewed and refined together; this doc opened. |
| 2026-09-25 | Every look-and-feel change is judged at both desktop and phone widths (owner). |
| 2026-09-25 | Testimonials may be published: consent confirmed, attributed by role and country, never by name (owner). |
