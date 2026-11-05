---
name: sog-brand-voice
description: "School of Gaming's voice, the one source of truth for every word we publish. Use whenever writing, editing, translating or reviewing copy in any language: any string in messages/ (page copy, buttons, labels, errors, empty states, emails, My SOG for parents, gamers and Gedus, admin), landing pages, Library articles, product descriptions, and marketing (Postia Reksiltä, ads, LinkedIn, webinars, the weekly Gedu message). Also use to judge whether existing copy is on brand."
---

# School of Gaming brand voice

This skill is the single source of truth for how School of Gaming sounds, in this repo and
in anything written from it. It began as Mikko Perälä's own `sog-brand-voice` skill (v2.1,
16 Oct 2026), built from 308,000 words School of Gaming has published, and absorbed the
voice half of the Brand Voice & Identity Guidebook v2.0. Where the two disagreed, Mikko
ruled on 2 Nov 2026, and his rulings are written in below as plain rules. Mikko is the CEO,
the author of the Guidebook, and Reksi himself.

**This copy is the master.** The marketing team keeps its own copy of the skill and it will
drift; when they differ, this one is right. A change to the voice is a change to this file,
made through the owner (Kyle), who takes brand questions to Mikko. When this skill says
"ask", it means ask the owner; never invent the answer.

**This skill is how School of Gaming sounds, wherever it speaks**, so every rule in it holds
for a newsletter or an ad as much as for a screen. How the Sogverse app's copy behaves (what
a page says about the feature behind it, errors and empty states, staff surfaces, the
string catalogs) is the repo's, in `messages/CLAUDE.md` and `src/CLAUDE.md`.

## How to use this skill

Read this file whole before writing. It carries the voice, the registers, the words and the
punctuation, which is what nearly every copy change needs. Open a reference file only when
the task reaches into it:

| File | Open it when |
| :-- | :-- |
| `references/foundation.md` | You need who we are: the values, the positioning, the vision statement and slogans, the names (School of Gaming, Sogverse, Gedu, the lockup), the world (Yty, Tellus, places), the loop |
| `references/vocabulary.md` | You need the full term list, casing and plurals, the banned terms with their replacements, Human Skills, the screen time rule, the Discord rule, role names per language, partner wording |
| `references/hard-moments.md` | The copy touches money, safety, safeguarding, an incident, an outage, a complaint or an apology, or states a safety mechanism |
| `references/surfaces.md` | You are writing for a specific surface: the website and landing pages, the parent, gamer, Gedu or admin side of the app, email, the store, moderation; or formatting money, durations, dates and links |
| `references/reksi.md` | Reksi (the Princi-Pal) speaks: the newsletter, opinion pieces, LinkedIn, a Season opening, a proverb |
| `references/examples.md` | You are writing something long in Reksi's or the brand's voice and want the real models: Mikko's best letters and blogs, his edit of a Claude draft, and what not to imitate |

Finnish grammar, spelling and punctuation are the `suomi-finnish` skill's; this skill
decides what to say and in what voice, that one decides whether the Finnish is correct.

## Who we are

School of Gaming is a Finnish game education school for gamers aged 7 to 17. Gedus, our
trained Game Educators, run small clubs, camps and events in Minecraft, Roblox, Fortnite
and other games, online in Sogverse and in person. We believe gaming can be a good hobby
when it is guided by a trained adult in a safe community, and we say so out loud in a world
that finds it easier to blame games and children than to fix what adults built.

Core message: **gaming can be a good hobby, guided by trained Gedus, in a safe community.**
Lead with the benefit to the child and family, then safety and the Gedus, then the offer.

Values, in priority order, and the order is a decision rule: when two pull against each
other, the higher one wins. **Safety, Belonging, Growth.** Safety outranks a good story and
a smooth sale.

## The voice in five principles

Each is a habit, not a mood. A draft that fails three of them is not a School of Gaming
piece.

1. **Take the parent's side, and the child's.** Name the worry first, then reframe it.
   Never blame children for problems adults built, never sell fear, never call screen time
   the enemy. We sit on the same side of the table as the parent, looking at the same
   child, and we never make a parent feel foolish for worrying. *Why:* parents arrive
   carrying guilt, often after an argument about gaming that week. Copy that wins an
   argument they were not having loses them.
2. **Gaming is a hobby worth respect.** Say it plainly and never apologise for it: no "just
   playing", "disguised as play", "actually learning", "hukkaan heitettyä". Play is how
   children do serious work, not the sugar that delivers the medicine. *Why:* our whole
   claim rests on play being the mechanism. Every concession agrees with the people who
   think gaming needs disguising.
3. **Concrete beats abstract.** The safe adult, the rule, the number, the day, a kitchen
   analogy. A parent should be able to repeat what we promised. *Why:* a promise is worth
   what the reader can check. "A Gedu is in every lesson" survives being repeated to a
   partner; "a safe, welcoming community" does not.
4. **A real person talks, with a wink.** Short sentences, everyday words, humour about
   ourselves and never about the parent's worry. We are sincere about the world and lightly
   amused by ourselves. Short does not mean chopped: sentences may flow with "kun",
   "niin", "mutta", "and", "so", and an explanation may take a full paragraph. *Why:*
   sincerity without humour turns cultish, humour without sincerity turns into a campaign,
   and a string of seven word fragments reads as a machine.
5. **One clear next step.** Every piece ends with one action. A page has one primary
   button; a letter has one ask, with any offer in the PS. *Why:* Mikko's letters with four
   offers got 0.30% clicks; letters with one promise and one ask get the clicks.

Two more habits hold everywhere:

- **Nobody is a spectator.** Gamers change how a story ends, parents take part, Gedus build
  the world. Address the reader as someone whose actions count.
- **Boundless, but not lawless.** Imagination has no ceiling; kindness, honesty and
  responsibility are the floor in every game and in everyday life. Never sell freedom by
  deleting the floor: a parent reading "no rules, no limits" hears "unsupervised".

## Before writing

1. **Name the surface and the reader.** A parent deciding, a parent doing admin, a gamer, a
   Gedu at work, an admin, a partner. Gamer copy is written to the gamer; everything else
   that reaches a family is written to the parent.
2. **Set the lore level** (below) before a word is written.
3. **Decide who speaks**: School of Gaming (the default, "we"), Reksi (the newsletter,
   opinion, LinkedIn, a Season opening), or a named Gedu.
4. **Collect the facts you may claim**, and claim nothing else. Ages, prices, dates, group
   sizes, guarantees and safety features come from the product and the code, not from
   memory or from older copy. A safety sentence is checked against the About page FAQ and
   the code before it is written (`references/hard-moments.md`). Never invent what Reksi
   did, read, believed or felt. If a fact is missing, ask.
5. **Never write a superlative you cannot check.** No "world's safest", "world's best",
   "world class"; write the rule behind the claim instead ("No private messages. No
   strangers."). Humour is still allowed: a superlative nobody could take as a claim is a
   joke, not a promise ("maailman hauskin koulu" is fine; Mikko, 3 Nov 2026). The ban is on
   anything a parent might rely on, safety and quality above all.

## The lore level

Sogverse is a world with its own words, and it is a gift we give, not a test we set. A
parent who has never heard "Yty" is not behind; they are the reason the word exists. Every
piece gets a level first:

| Level | What it means | Where it lives |
| :-- | :-- | :-- |
| **3** Full canon | Written from inside Sogverse. Terms used without gloss. | Gamer-facing screens and messages, the gamer's My SOG, Quest briefs, store items, camp materials |
| **2** Guided canon | The story leads, every term is glossed on first use, and the piece holds at least one plain sentence saying what actually happens, when, and what it costs | Newsletter, Season and Episode news to families, camp promotion, parents' evening invitations |
| **1** Translated | Plain language leads; the world is introduced from outside, as an invitation | Home page, shop, product pages, landing pages, About, enrolment, the parent's My SOG, Library, ads, partner and press material |
| **0** Plain | No lore at all. Clarity is the only virtue | Billing, refunds, PIN, account, safeguarding, incidents, outages, legal, privacy, moderation, admin, operational Gedu copy |

- **Product names are not lore.** Gedu, Sogverse and My SOG appear bare anywhere in the
  signed-in product, Level 0 included, because the reader already knows them; on a public
  surface Gedu and Sogverse arrive once with their gloss (`references/foundation.md`). Lore
  is the world: Yty, Quests, Tellus, the Yty-Elements, Toxies.
- **One new term per paragraph at Levels 1 and 2, glossed in the same sentence, never in
  brackets.** "Gedus, our trained Game Educators, run every group" reads as generous.
  "Gedus (Game Educators) run every group" reads as a manual.
- **Drop to Level 0 at once, mid-piece if needed,** when a child's safety, a payment, a
  legal obligation, a medical matter, a complaint, an apology, or data and privacy is in
  play. A namespace's level is a ceiling, not a setting: a refund line on a Level 1 page is
  still Level 0.
- **Level 0 never borrows from Level 3 to soften.** If a payment failed, say the payment
  failed. A parent met with fiction while chasing money will not trust us with their child.
- **When in doubt, go one level plainer.** Nobody has left School of Gaming because a
  sentence was too easy to understand.

## Registers by surface

| Surface | Who speaks | Tone | Length | Level | Ends with |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Website and landing pages | School of Gaming | Clear, calm, confident | Hero headline up to 12 words, subhead up to 30, sections 40 to 80 | 1; prices and terms 0 | One primary button |
| Library and blog | SoG with a named author; Reksi byline for opinion | Expert, calm, warm, sources named | 800 to 1,400 words; a heading every 200 to 300; the first paragraph answers the question | 1 | Free session block |
| Parent's My SOG, enrolment, schedule | School of Gaming | Plain, calm, specific: a parent here is doing admin, not reading a story | As short as the task allows | 1; money and account 0 | What happens next |
| Gamer screens (My SOG, virtual room, chat, Yty, store) | School of Gaming or the Gedu | Direct, present tense, stakes visible, written to the gamer | Short; one instruction at a time for the youngest | 3; moderation 0 | What to do now |
| Gedu screens and Gedu mail | School of Gaming | Peer to peer, practical, the reason given beside the rule | Short | 0 | The action and its deadline |
| Admin screens | School of Gaming | Plain | Short | 0 | The consequence |
| Transactional and onboarding email | School of Gaming | Warm, plain, specific | Under 100 words transactional, 120 to 250 routine | 1; money and safety 0 | One thing to do, one way to reach a human |
| Weekly Gedu message (the lesson report) | The club's Gedu | Service tone, friendly, never selling | 120 to 200 words: what we did, what it practised, one tip | 1; 0 for practical or safety information | A Library article or a free community event; never prices, codes or trials |
| Safety, billing, incidents | School of Gaming, named signer | Plain, no jokes | As short as the facts allow | 0 | What happens next, who to contact |
| Newsletter Postia Reksiltä | Reksi | Personal, opinionated, helpful, funny about himself | Subject under 50 characters; 300 to 700 words plus PS | 2 | One button, offer in the PS |
| Meta ad (fi, en) | School of Gaming | fi warm, practical, reassuring; en friendly, expert, calm, dry wit | 40 to 90 words; hook in the first 125 characters; headline under 40 | 1 | Book a free session |
| Google search ad | School of Gaming | Direct, the searched words first, no lore words | Headlines 30, descriptions 90 characters | 1 | A free first session |
| LinkedIn | Mikko as Reksi | Founder voice, honest, opinion led | 120 to 250 words; the point in the first two lines | 1 | Read the Library or try a session |
| Webinar | Gedu host, Reksi guest | Expert, practical, spoken | Invitation 120 to 200 words; three takeaways | 1 | Free session or attendee offer |

`references/surfaces.md` has the detail for each surface. Offer a free session only where
a free product exists to link to; check the shop rather than assuming. **Families in a
municipality club are never sold to**: they get the weekly Gedu message and nothing that
markets, because the municipality is paying.

## Punctuation

- **Dashes: a strong default against them as punctuation** (Mikko, 2 Nov 2026). Do not use
  an em dash, an en dash or a hyphen to join or interrupt a sentence; use a full stop, a
  comma or a colon, or rewrite the sentence. *Why:* dashes are the most recognisable sign of
  machine-written text, and Mikko removes them from every draft. Rewrite rather than swap:
  a semicolon in the dash's place is the same habit in another form. It is a default, not a
  ban, so a dash survives only where no rewrite reads as well, which is rare.
- **Dashes that belong to the word or the number stay.** The hyphen in Princi-Pal and
  Yty-Points; Finnish compounds that need one (Minecraft-kerho); a Finnish range, which
  takes an en dash with no spaces (7–17-vuotiaille, klo 10–11) because Finnish grammar
  requires it; the spaced en dash in the lockup `School of Gaming – Sogverse`, which is part
  of the mark. In English, write ranges in words ("ages 7 to 17", "from 4pm to 6pm").
- **Few exclamation marks.** None in safety, service or Library headlines, and none in
  slogans.
- **Sentence case headings**, bold for emphasis.
- **No emoji** in anything a family, a Gedu or an admin reads. Gamer-facing social media
  outside the app may use them.

## Writing in each language

**Finnish**
- Write Finnish first and never translate from English. Round trip giveaways to avoid:
  "Minä, School of Gaming pääpelaaja", "Tässä blogikirjoituksessa tarkastellaan".
- Sinä to the parent, "teillä" for the family ("Pelataanko teillä?").
- "Gamerisi" is ours: Reksi uses it in place of "hän" or "lapsi" for the parent's child,
  and it belongs wherever the parent already knows us (the newsletter, My SOG, mail to
  enrolled families). On a public page for a parent meeting us cold, "lapsesi" is right;
  Mikko's own home page copy does this.
- Clitic particles and spoken forms make Finnish sound Finnish (Mitäpä, löytyihän,
  Entäs, kotosalla, plaraillen, vastapalloon), in Reksi's texts and ads; a product page
  stays standard Finnish. Light puhekieli (tsekkaa, messiin, Tuu mukaan) only in the
  newsletter and ads.
- Watch for English calques: "Ruutu ei ollut se ongelma" → "Ruutu ei ollutkaan ongelma".
  "Teidän vastauksenne" → "Teidän vastauksia".
- Fragments are welcome, but one triad of fragments per piece at most, and never as a
  template ("X. Y. Z.").
- Wordplay and pop culture from Finnish life (Kummeli, a mummo's sayings, rairuoho,
  kurpitsa). An English phrase now and then as seasoning, never an English sentence in a
  Finnish ad.
- Dates "pe 13.3.", times "klo 18", a range with its end "klo 16–18"; one with only a start
  and a length in words ("klo 18 alkaen, 90 minuuttia").

**English**
- UK English (behaviour, favourite, mum, enrol, colour) in everything a reader sees.
- For UK and expat families: dry understatement, sentences of about 10 to 12 words.
- There is no English Reksi to copy yet. Write in the same spirit as the Finnish, never
  word for word, and do not translate Finnish jokes: find English ones.
- The Finnish angle as a fact or a scene, never a boast ("the world's best education
  system").
- No AI words: navigate, foster, crucial, journey, dive into, delve, landscape, seamless,
  unlock (as a metaphor; unlocking a PIN is fine), empower, transformative, "in today's
  digital age", "whether you're", "it's important to note".
- No urgency theatre: BREAKING, Limited spots left, Secure your spot before they're gone.

**Swedish and French** follow the English rules (Mikko, 2 Nov 2026). Each locale persuades
its own readers, so write for them rather than mirroring the English sentence. French is a
transcreation: its public marketing copy, the slogan included, was rewritten by a native
speaker and deliberately says something other than the English; never pull it back towards
the English, and never push the French imagery into the other locales. Sylvie, a native
French speaker on the team, approved these punctuation rules for French (3 Nov 2026) and
reads the French after a large rewrite. French register:
`vous` to adults, `tu` in child-facing strings; "clubs municipaux" but "payé par votre
commune"; never the middle dot (`Prêt·e`) to dodge agreement, reframe instead. The child is
"gamer" everywhere, buttons and account names included ("Ajouter un gamer", "Compte
gamer"), never "joueur" (Sylvie, 3 Nov 2026); "joueur" stays only for a player inside a
game, as on a Minecraft server.

**Klingon (`tlh`)** is the easter egg: fun takes are welcome and accuracy is not the goal,
and it renders "School of Gaming" as its own calque on purpose.

## Words

The full list, with casing, plurals and the reasons, is `references/vocabulary.md`. The ones
that come up in every piece:

**Ours**
- **gamer** (lowercase): the child, in our care. To a gamer's face, never "kids" or
  "children".
- **Gedu**, plural **Gedus** (fi Gedu, Gedut, Gedun): capital G in every language
  (Mikko, 2 Nov 2026). A product name, never translated and never used cold: on any public
  page it arrives with its gloss ("Gedus, our trained Game Educators"). Where Gedu is not
  the word, each language has exactly one word for the role: **Game Educator** (en,
  capitalised), **pelikasvattaja** (fi), **spelfostrare** (sv), **animateur / animatrice**
  (fr).
- **club** (the ongoing group) and **lesson** (each meeting that club holds), fi **kerho**
  and **kerhokerta**, fr **club** and **séance** (never "leçon" or "cours", which do not
  work in French: Sylvie, 3 Nov 2026). A gamer joins a club and attends a lesson. They are
  not synonyms, and no third word is invented. A lesson's length comes from the product,
  never from memory: lessons are getting longer. "Free session" is the fixed name of the trial offer (fi "maksuton
  kokeilukerta"), not a word for the meeting.
- **camp** / leiri, **event** / tapahtuma.
- **Sogverse**, never "the Sogverse" (the article may belong to a following noun: "the
  Sogverse shop"). Never used cold either: a stranger is told "School of Gaming" first
  (`references/foundation.md`).
- **the Princi-Pal** in English, Swedish and French; **Reksi** in Finnish (Mikko, 2 Nov
  2026). Never "Principal", "Principal Gamer" or "pääpelaaja".
- **Human Skills** (fi **ihmisyyden taidot**), never soft skills, 21st century skills,
  skills of the future or tulevaisuuden taidot (Mikko, 2 Nov 2026).
- **hyvä harrastus**, **turvallinen aikuinen**, **positiivisen pelaamisen lähettiläs**,
  **Yty**, **Yty-Points**, **Yty-Elements** (Harmony, Glow, Valor, Wit, in that order).

**Never**
- course, class, curriculum, kurssi, luokka (we run clubs, camps, events and lessons; a
  Gedu's own training may be called a course)
- program or programme as a generic word (the Roblox **Programme** keeps its name)
- teacher, coach, instructor, tutor, opettaja, ohjaaja, vetäjä, valmentaja; **mentor**
  only as the name of Level 3 on the Gedu Path, never as a word for a Gedu
- kids, or children / lapset when addressing a child
- gaming addiction, peliriippuvuus, digital detox, digipaasto, too much gaming, unplug
- screen time as the enemy or a quantity to cut; screen time battles or ruutuaikataistelu
  as our framing (quoting a parent is fine). Screen time may only be the thing we transform.
- disguised as play, just playing, actually learning, oikeasti oppii, pelkkää pelaamista
- world's best, world's safest, maailman turvallisin, world class, revolutionary, game
  changer
- VAROITUS, Viimeiset paikat with an alarm emoji
- our Discord, our Discord server; our users, our customers (to families)

## Claims, and safety copy above all

**A sentence about a child's safety states a checkable mechanism, never an intention, and
only a mechanism verified true.** "Chat in a lesson goes to the whole group, where the Gedu
sees it" is something a parent can test and hold us to. "We take your child's safety very
seriously" is what every company says before it loses a database. Before writing one, check
it against the code and the About page FAQ, not against what a feature was meant to do. A
mechanism we want but do not have is a feature request, never a sentence, and overstating a
safeguard is worse than the vague sentence it replaced, because a parent acts on it.
`references/hard-moments.md` lists the mechanisms checked so far and the claims that are
not true of Sogverse.

The same holds for every claim: a price is "from €59 per month" because prices vary by
club; a guarantee is stated exactly as the terms give it; a feature is described only if
the product has it.

## Claude tells

Mikko removes these from every Claude draft. Read your draft against them before handing it
over; `references/examples.md` example 21 shows his edit of one.

- **Report headings.** "Mitä tutkimus oikeasti sanoo", "What the research really says".
  Write headings the way a person says them aloud: a question or a playful line ("Mitäpä
  tiede meille sanoo?").
- **Setup words.** "Rehellinen vastaus:", "oikeasti", "Eli", "Totuus on", "The truth is",
  "Here's the thing". Answer straight.
- **Negation contrast.** "Ei X. Vaan Y.", "Not X. But Y.", "Sama ruutu. Mutta ei yksin."
  Say the positive thing once: "Sama ruutu, mutta yhdessä jaettuna."
- **The fragment triad as a closing beat.** "Two camps. One enemy. Loneliness." At most once
  per piece, and never with a dramatic word.
- **Dashes and semicolons** as joints between clauses (Punctuation, above).
- **Summary without opinion.** In Reksi's voice, after the facts comes what he thinks, from
  his own reading and life, with a name or image he coins.
- **Dropping the concrete image.** If the source has an everyday analogy, keep it and build
  on it.
- **Unfair to the other side.** Present an opposing view with warmth and a wink, never as a
  strawman.
- **Commands, in a letter.** "Reply to this email", "Vastaa tähän kirjeeseen". Reksi
  invites: "Jos haluat, niin voit laittaa minulle vastapalloon viestiä." This is about
  letters and other prose that asks something of the reader; an instruction in the app
  ("Enter your PIN", "Try again") and a button label stay plain imperatives.
- **Too short.** Compressing a story into seven word sentences until nothing breathes.
- **Invented facts.** "This week", "I read it twice", "Reksi has never believed". Ask or
  leave it out.
- **Defining instead of showing pride**, in Reksi's letters: a Level 1 page glosses "Gedu,
  our trained Game Educator"; Reksi talks about his "rykmentillinen mahtavia ja osaavia
  pelikasvattajia".

## Before handing over

- The surface, the reader, the lore level and the speaker are named, and every sentence sits
  at that level.
- Every lore term at Levels 1 and 2 is glossed in its sentence; at Level 0 there are none.
- A whole piece (a page, an email, a letter, an ad) has at least one flat, factual sentence
  with a date, a time, a duration or a price, and one clear next step.
- A UI string (a button, a label, an error, a toast) is as short as its job, and nothing is
  padded to meet the line above.
- No banned words, no AI words, no dashes or semicolons as joints, no emoji.
- Gedu, gamer, Sogverse, Princi-Pal / Reksi, Yty and the slogans are cased and spelled as
  written here.
- Finnish reads as written in Finnish; English reads as written for a parent in the UK.
- Every claim is one the product makes true, and every safety sentence is a verified
  mechanism.
- It would survive a parent who has never heard the word Sogverse and is mildly suspicious
  of gaming. Read it once as that person.
- Nothing hard, sad, expensive or wrong is softened by the world: it dropped to Level 0
  completely.
- No Claude tell survives.
