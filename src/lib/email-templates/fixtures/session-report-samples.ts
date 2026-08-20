/**
 * Sample session reports for the admin email testing tool.
 *
 * Two invented write-ups for an invented Minecraft group ("Usvalaakso:
 * Kettukallio", in the `<world>: <village>` shape real group names take) — one
 * written in English, one in Finnish — so the session-report email can be iterated
 * against the markdown a gedu can actually produce. Each uses every control
 * the feed editor offers, and nothing it does not: the three heading levels, a
 * bold title, bold and italic inline (and both at once), a tight bullet list
 * with a nested item, a numbered list, and a hard break in the sign-off. The
 * language of a report is the gedu's choice and is independent of the locale
 * the mail is sent in — a Finnish report can arrive inside an English mail.
 *
 * Fixture data, not copy: nothing here is shown to a user outside the admin
 * testing tool, and nothing is translated. `startsAt`/`endsAt` are the
 * session's instants; the testing tool formats them in `timezone` because the
 * fixture has no parent to format them for.
 */
export interface SessionReportSample {
  /** Stable id the testing tool's select posts back. */
  id: string;
  /** Option label in the testing tool. */
  label: string;
  /** ISO instant. */
  startsAt: string;
  /** ISO instant. */
  endsAt: string;
  /** The product's IANA zone. */
  timezone: string;
  /** The report as the editor would store it. */
  markdown: string;
}

export const SESSION_REPORT_SAMPLES: readonly SessionReportSample[] = [
  {
    id: "en",
    label: "English report – Lanterns over the Harbour",
    startsAt: "2026-08-20T13:30:00+00:00",
    endsAt: "2026-08-20T15:00:00+00:00",
    timezone: "Europe/Helsinki",
    markdown: [
      "# **Lanterns over the Harbour**",
      "",
      "Hello families! The Thursday crew came back from the summer break with *a lot* of energy, so we split the session between free building and a shared challenge.",
      "",
      "## What we did",
      "",
      "We started with a quick tour of everyone's summer builds and then got to work on Kettukallio's harbour:",
      "",
      "- **Aino** finished the lighthouse and put a working lantern on top",
      "- **PixelPanda** and **Creeper_Kai** dug a canal so boats can reach the market",
      "  - it floods a little when it rains, which is next week's problem",
      "- **LeoBuilds** started an underwater tunnel, which is exactly as ambitious as it sounds",
      "",
      "### The lantern challenge",
      "",
      "Everyone had to light the harbour using only materials found within 200 blocks. The rules, as agreed by the group:",
      "",
      "1. No creative mode and no trading with the villagers",
      "2. Every lantern has to hang from something",
      "3. ***Nobody*** touches another player's build without asking",
      "",
      "The winning design used glow berries in a pattern that lights up the whole pier. Very clever.",
      "",
      "## Next week",
      "",
      "We'll drain the canal and start on the market stalls. If your child has ideas for what the stalls should sell, bring them along!",
      "",
      "*See you on Thursday,*\\",
      "*Marianne*",
    ].join("\n"),
  },
  {
    id: "fi",
    label: "Finnish report – Lyhtyjä sataman ylle",
    startsAt: "2026-08-27T13:30:00+00:00",
    endsAt: "2026-08-27T15:00:00+00:00",
    timezone: "Europe/Helsinki",
    markdown: [
      "# **Lyhtyjä sataman ylle**",
      "",
      "Hei perheet! Torstain porukka palasi kesätauolta *täynnä* energiaa, joten jaoimme kerhokerran vapaan rakentelun ja yhteisen haasteen kesken.",
      "",
      "## Mitä teimme",
      "",
      "Aloitimme lyhyellä kierroksella kaikkien kesärakennelmien luona ja kävimme sitten Kettukallion sataman kimppuun:",
      "",
      "- **Aino** sai majakan valmiiksi ja lisäsi sen huipulle toimivan lyhdyn",
      "- **PixelPanda** ja **Creeper_Kai** kaivoivat kanavan, jotta veneet pääsevät torille asti",
      "  - sateella se tulvii hieman, mikä on ensi viikon ongelma",
      "- **LeoBuilds** aloitti vedenalaisen tunnelin, joka on täsmälleen niin kunnianhimoinen kuin miltä se kuulostaa",
      "",
      "### Lyhtyhaaste",
      "",
      "Jokaisen piti valaista satama vain sellaisilla materiaaleilla, jotka löytyvät 200 palikan säteeltä. Ryhmän yhdessä sopimat säännöt:",
      "",
      "1. Ei luovaa tilaa eikä kauppoja kyläläisten kanssa",
      "2. Jokaisen lyhdyn on roikuttava jostakin",
      "3. ***Kukaan*** ei koske toisen rakennelmaan kysymättä",
      "",
      "Voittajatyössä hehkumarjat oli aseteltu kuvioksi, joka valaisee koko laiturin. Todella nokkelaa!",
      "",
      "## Ensi viikolla",
      "",
      "Tyhjennämme kanavan ja aloitamme torikojujen rakentamisen. Jos lapsellanne on ideoita siitä, mitä kojuissa voisi myydä, ottakaa ne mukaan!",
      "",
      "*Nähdään torstaina*\\",
      "*Marianne*",
    ].join("\n"),
  },
];
