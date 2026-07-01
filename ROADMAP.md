<div align="right"><strong>Last updated:</strong> 2026-06-29</div>

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
