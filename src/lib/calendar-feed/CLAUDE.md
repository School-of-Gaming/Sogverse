# Calendar feed

The subscribed ICS feed: one URL a calendar client polls forever, and everything
behind it — the token, the option parsing, the reads, the occurrence expansion and
a hand-rolled RFC 5545 writer. The feed *design* is still an open investigation
(`docs/investigations/session-reminders-and-calendar-feed.md`); what is built is a
standing admin tool for verifying it in isolation.

**Two sources, one pipeline.** A real customer's rows and an admin's sandbox
family both map into one neutral seat shape before the expansion runs, so nothing
downstream knows where a seat came from and a sandbox demonstrates the same code a
real feed runs. The sandbox lives in a database table because a vendor polls the
URL minutes to hours after an edit, with no session and no browser.

**Two token kinds, domain-separated.** A customer token carries the `ics-feed:`
payload prefix; a sandbox token carries `ics-feed-sandbox:` and a leading marker
segment that makes its kind explicit rather than inferred. Neither can verify as
the other. Both are HMACs under the shared PIN secret, and the sibling list in
`src/lib/email-verification.ts` is where every payload class under that key is
recorded.

**Options are query parameters, and every one falls back to its default.** A
client stores the URL it was given and re-fetches it forever, so a value we later
stop recognising must keep the subscription working — the feed degrades to the
default rather than answering 400 and going dark in an app the parent cannot see
the error in.

**The token in the path is the whole of the authorization**, so an unverifiable
one answers 404 rather than 401 for every reason at once: a bad signature, an
unknown customer, an unknown sandbox, a stored document that no longer parses.
Distinguishing them would disclose that a given id is one of our customers.
