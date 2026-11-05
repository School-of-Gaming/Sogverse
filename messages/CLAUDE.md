# messages/

**Every string here is copy, and copy is written to the `sog-brand-voice` skill — load it
before changing a word.** Copy also follows the spec bleed rule in `src/CLAUDE.md`: it
says what the reader does and gets, never the spec of the feature behind it. The catalogs'
machinery (key parity, the Klingon fallback, the scripted round-trip edit) is
`src/i18n/CLAUDE.md`.

**Rule: "session" is being swept to "lesson" one surface at a time, so an edit keeps the
word its surface already uses.** The skill's word for each meeting of a club is "lesson"
(fi kerhokerta, fr séance), and older strings still say "session"; French has already been
swept. Until a surface has been swept, a string edited on it keeps "session", so no screen
mixes the two, and a new surface says "lesson". Keys, code and the database keep "session"
as an identifier.

**Rule: the Roblox programme's terms and privacy policy (`robloxTerms`, `robloxPrivacy`)
carry Lynx's lawyer's text word for word, with five sanctioned departures and no more.**
Editing a signed text costs another legal review. The departures: the tags that turn a cross
reference into a link to our own documents; the emphasis tag where the source bolds body
text; the placeholder that renders our support address; two sentences corrected to say how
Sogverse works (a media choice is changed on the child's own page in My SOG); and one
sentence under the privacy policy's photography heading, added with Lynx's agreement, saying
a photograph from a lesson may appear in the report every family in the group sees, where
the media permission was given. Anything further needs the owner. Finnish and Swedish follow
the English there with the plain category word (ohjaaja, ledare) where the English says
"facilitator"; French needs no split. `robloxSafeguarding` is ours and follows the skill.
