import { wrapInLayout } from "./layout";
import { heading, paragraph, styledName } from "./utils";
import { ctaButton, inlineLink } from "./blocks";
import type { EmailTranslator } from "./translator";

/**
 * The two mails a brand-new account gets: one for a parent, one for a Gedu who
 * has just self-registered.
 *
 * Both lead with **School of Gaming**, the name the reader recognises, and name
 * Sogverse only as the platform they have just been given an account on — a
 * welcome mail is the one place the relationship between the two names has to
 * be stated rather than assumed.
 *
 * **Neither mail repeats a step registration already walked the reader
 * through.** Adding a gamer, choosing a parent PIN, filling in a Gedu profile —
 * all of that happened minutes ago in the signup flow, and a welcome mail that
 * asks for it again reads as though we lost it. What is left is short by
 * design: a greeting, a sentence or two, and the places worth going next.
 *
 * Those places are buttons, and the first one is filled: verifying the address
 * is what this mail is asking for, so it leads and the rest are outlined. None
 * of them is a gate — a reader who ignores the verification can still get on
 * with the product, which is exactly what the copy promises.
 *
 * Settings is the exception, and deliberately not a button. The sentence that
 * says the verification can wait already has to name where to do it later, so
 * the link rides on that word rather than becoming a fourth thing to choose
 * between — a row of buttons is a decision, and this is a footnote. Which word
 * carries the link is the translation's call: each locale's message file marks
 * the spot with `{settingsLink}` and supplies the link's own label, so a
 * language that inflects the word keeps the ending inside the link text.
 */

interface WelcomeParentEmailOptions {
  firstName: string;
  /** App-generated verification link. */
  verificationUrl: string;
  /** App-generated My SOG link. */
  dashboardUrl: string;
  /** App-generated shop link. */
  shopUrl: string;
  /** App-generated settings link. */
  settingsUrl: string;
}

export function buildWelcomeParentEmail(
  t: EmailTranslator,
  locale: string,
  { firstName, verificationUrl, dashboardUrl, shopUrl, settingsUrl }: WelcomeParentEmailOptions,
): string {
  const content = `
    ${heading(t("welcomeParent.heading"))}
    ${paragraph(t("welcomeParent.greeting", { firstName: styledName(firstName) }))}
    ${paragraph(t("welcomeParent.platform"))}
    ${paragraph(
      t("welcomeParent.verifyBody", {
        settingsLink: inlineLink(settingsUrl, t("welcomeParent.settingsLinkLabel")),
      }),
    )}
    ${ctaButton({ href: verificationUrl, label: t("welcomeParent.verifyButton") })}
    ${ctaButton({ href: shopUrl, label: t("welcomeParent.shopButton"), variant: "secondary" })}
    ${ctaButton({ href: dashboardUrl, label: t("welcomeParent.dashboardButton"), variant: "secondary" })}
  `;
  return wrapInLayout({ title: t("welcomeParent.heading"), content, locale, t });
}

interface WelcomeGeduEmailOptions {
  firstName: string;
  /** App-generated verification link. */
  verificationUrl: string;
  /** App-generated My SOG link. */
  dashboardUrl: string;
  /** App-generated settings link. */
  settingsUrl: string;
}

/**
 * The certification line is the load-bearing sentence here, and what it must not
 * do is enumerate. A new Gedu needs to know that an admin will review and
 * certify the account and that some of the platform stays shut until then —
 * *which* parts is a set that moves as features arrive, and a mail is the worst
 * place to freeze a list that will be wrong within a release. So the sentence
 * says both facts and names nothing, which is also the only version that stays
 * true without anyone maintaining it.
 */
export function buildWelcomeGeduEmail(
  t: EmailTranslator,
  locale: string,
  { firstName, verificationUrl, dashboardUrl, settingsUrl }: WelcomeGeduEmailOptions,
): string {
  const content = `
    ${heading(t("welcomeGedu.heading"))}
    ${paragraph(t("welcomeGedu.greeting", { firstName: styledName(firstName) }))}
    ${paragraph(t("welcomeGedu.certification"))}
    ${paragraph(
      t("welcomeGedu.verifyBody", {
        settingsLink: inlineLink(settingsUrl, t("welcomeGedu.settingsLinkLabel")),
      }),
    )}
    ${ctaButton({ href: verificationUrl, label: t("welcomeGedu.verifyButton") })}
    ${ctaButton({ href: dashboardUrl, label: t("welcomeGedu.dashboardButton"), variant: "secondary" })}
  `;
  return wrapInLayout({ title: t("welcomeGedu.heading"), content, locale, t });
}
