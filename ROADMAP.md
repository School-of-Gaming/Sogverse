<div align="right"><strong>Last updated:</strong> 2026-08-31</div>

# Sogverse Roadmap

The Sogverse planning and vision roadmap. Dream big, move fast, keep the customer experience at our core.

## Timeline

**Legend:** 🟩 Done · 🟦 In progress · ⬜ Planned

```mermaid
%%{init: {'gantt': {'leftPadding': 130, 'useMaxWidth': false, 'useWidth': 1800}, 'themeVariables': {
  'taskBkgColor':'#cbd5e1','taskBorderColor':'#94a3b8',
  'taskTextColor':'#0f172a','taskTextDarkColor':'#0f172a','taskTextLightColor':'#0f172a',
  'doneTaskBkgColor':'#86efac','doneTaskBorderColor':'#16a34a',
  'activeTaskBkgColor':'#93c5fd','activeTaskBorderColor':'#2563eb',
  'sectionBkgColor':'rgba(128,128,128,0.03)','altSectionBkgColor':'rgba(128,128,128,0.29)',
  'sectionBkgColor2':'rgba(128,128,128,0.03)'
}}}%%
gantt
    dateFormat YYYY-MM-DD
    axisFormat %b '%y
    tickInterval 1month
    todayMarker stroke:#facc15,stroke-width:4px,opacity:0.55

    section Parent
    Municipality Clubs       :active, mclub, 2026-07-01, 2026-08-25
    AI Parent Support        :csai, 2026-10-15, 30d

    section Gamer
    Gamer Profile            :gprof, 2026-11-01, 30d
    GamerPals                :gpals, 2026-12-01, 60d
    Gamer Yty                :gyt, 2026-11-01, 30d

    section Gedu
    Session notes            :gnotes, 2026-08-01, 2026-08-31
    Attendance               :gatt, 2026-08-01, 2026-08-31
    Cancellations            :gcanc, 2026-08-01, 2026-08-31
    Auto substitution        :sub, 2026-09-01, 30d
    Gedu Academy             :acad, 2026-10-01, 30d
    AI Gedu Guru             :guru, 2026-10-01, 30d

    section Admin
    Gedu invoicing           :ginv, 2026-09-01, 30d
    Muni Invoicing           :minv, 2026-09-01, 30d
    Tickets                  :tickets, 2026-10-15, 30d

    section Platform Vision
    AI build harness         :harness, 2027-01-01, 90d
    Marketplace Model        :market, 2027-01-01, 60d
```

**Parent**
- **Municipality Clubs** — UX flow, parent registration window, seat count, and waitlist support for municipality-run clubs.
- **AI Parent Support** — Opt-in AI tooling to handle customer-service requests across email, WhatsApp, and the web-app chat — only when a parent consents.

**Gamer**
- **Gamer Profile** — Details about a gamer's preferences and interests.
- **GamerPals** — Find gamers with similar interests to make friends.
- **Gamer Yty** — Tracker where Gedus grant Yty elements and rewards, and gamers can see their progress.

**Gedu**
- **Session notes** — Parent-facing session notes, plus private Gedu and Admin session notes.
- **Attendance** — Gamer attendance tracking per session.
- **Cancellations** — Session cancellation by a Gedu.
- **Auto substitution** — When a Gedu cancels, a cover request goes out via WhatsApp, Discord, email, or in-app notification; an admin reviews the offers and approves a replacement.
- **Gedu Academy** — Sogverse system to recruit, train, and evaluate Gedus.
- **AI Gedu Guru** — AI bot that answers Gedu questions, brought natively into Sogverse (already running on Discord).

**Admin**
- **Gedu invoicing** — Calculate what Sogverse owes each Gedu based on the sessions they ran (session fees). CFO tooling.
- **Muni Invoicing** — Calculate what Sogverse charges each municipality based on negotiated session fees. CFO tooling.
- **Tickets** — Discord support tickets handled natively in Sogverse.

**Platform Vision**
- **AI build harness** — Long-term vision: an AI harness that lets any team member build, enabling them to integrate their own ideas and features into Sogverse.
- **Marketplace Model** — Independent Gedus are given tools to create content, products, and market themselves on the platform.

**World**

The brand describes a world — Yty and its four elements, a currency, quests, seasons, a Princi-Pal — and today the product carries the vocabulary without the mechanics behind it. These are the surfaces that would close that gap. They hang off **Gamer Yty** and **Gedu Academy** above rather than running on schedules of their own, so they carry no bars on the timeline until one is picked up and scoped.

- **Yty-Points balances** — A gamer's earned Yty-Points, visible to them and to the Gedus who grant them.
- **Achievement Badges** — The named awards a gamer collects, with their metal levels.
- **Quests** — The challenges a gamer takes on to earn Yty-Points and Achievement Badges.
- **Seasons and Episodes** — The recurring arcs that give a term its story and change what is on offer inside it.
- **Sogo and the store** — The world's currency, and the place a gamer spends what they have earned.
- **Gedu Path** — A Gedu's own progression through the world, alongside the Gedu Academy that trains them.
- **Princi-Pal voice surface** — Somewhere in the product the Princi-Pal actually speaks, rather than only being quoted.
- **Level-3 gamer dashboard** — The gamer's own dashboard written in the world's fullest voice, the register the brand reserves for gamers, instead of the neutral product tone it uses today.
