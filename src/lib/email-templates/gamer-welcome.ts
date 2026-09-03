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
 * addresses an adult; this one is read by a nine-year-old, so it names the
 * parent who did this ("Marja set up an account for you") rather than assuming
 * the reader already knows why a stranger is writing to them, and it says in one
 * sentence what happens after the button.
 *
 * **One action, and the second step is described rather than offered.** The
 * child cannot set a password yet — verifying the address is what causes the
 * reset link to be sent — so a second button would be a link to nowhere. Saying
 * plainly that another mail follows is what keeps the child from waiting for a
 * page that never appears.
 *
 * No expiry is stated, because the verification link has none: it stays good
 * until the address on the account changes.
 */
export function buildGamerWelcomeEmail(
  t: EmailTranslator,
  locale: string,
  {
    gamerFirstName,
    parentFirstName,
    verificationUrl,
  }: {
    gamerFirstName: string;
    parentFirstName: string;
    verificationUrl: string;
  },
): string {
  const content = `
    ${heading(t("gamerWelcome.heading"))}
    ${paragraph(
      t("gamerWelcome.body", {
        gamerName: styledName(gamerFirstName),
        parentName: styledName(parentFirstName),
      }),
    )}
    ${ctaButton({ href: verificationUrl, label: t("gamerWelcome.button") })}
    ${paragraph(t("gamerWelcome.afterVerifying"))}
    ${paragraph(t("gamerWelcome.ignore"))}
  `;
  return wrapInLayout({
    title: t("gamerWelcome.heading"),
    content,
    locale,
    t,
  });
}
