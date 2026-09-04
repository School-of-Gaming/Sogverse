import { wrapInLayout } from "./layout";
import { heading, paragraph, styledName } from "./utils";
import { ctaButton } from "./blocks";
import type { EmailTranslator } from "./translator";

/**
 * The first mail a child ever receives from us: their parent has given them an
 * account with a sign-in of their own, and the address it was set up with has to
 * be confirmed before anything else can happen.
 *
 * **Written to the child, not about them.** Every other mail in this directory
 * addresses an adult; this one is read by a nine-year-old, so it says in plain
 * words why a stranger is writing to them and what the button does.
 *
 * **It says "your parent" and never a name.** Naming the adult was an attempt to
 * make the mail recognisable and it bought the opposite: the account can be set
 * up by either parent, the name we hold is whichever of them registered, and a
 * child told the wrong one did this has been handed a reason to distrust the
 * mail. "Your parent" is true of every family shape we have, needs no lookup,
 * and is what a child would say themselves.
 *
 * **One action, and the mail ends after it.** It used to promise a second mail
 * with a password link in it, which was a promise the product could not keep:
 * that link is only sent once the child asks for it on the page the button leads
 * to, so a child who confirmed and then waited for an inbox was waiting for
 * nothing.
 *
 * **What replaced the promise is the reason.** The body says why the button is
 * there — signing in takes a password, and confirming the address is the first
 * half of getting one — so the child knows what they are starting rather than
 * what to expect in their inbox. Dropping the promise without saying that leaves
 * a mail whose one button means nothing in particular; the page the button opens
 * states the next step at the moment it is true.
 *
 * No expiry is stated, because the link has none: it stays good until the
 * address on the account changes.
 */
export function buildGamerWelcomeEmail(
  t: EmailTranslator,
  locale: string,
  {
    gamerFirstName,
    verificationUrl,
  }: {
    gamerFirstName: string;
    verificationUrl: string;
  },
): string {
  const content = `
    ${heading(t("gamerWelcome.heading"))}
    ${paragraph(
      t("gamerWelcome.body", {
        gamerName: styledName(gamerFirstName),
      }),
    )}
    ${ctaButton({ href: verificationUrl, label: t("gamerWelcome.button") })}
    ${paragraph(t("gamerWelcome.ignore"))}
  `;
  return wrapInLayout({
    title: t("gamerWelcome.heading"),
    content,
    locale,
    t,
  });
}
