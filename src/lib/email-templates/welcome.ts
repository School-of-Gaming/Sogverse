import { wrapInLayout } from "./layout";
import { heading, paragraph, styledName } from "./utils";
import { bulletList, ctaButton, inlineLink, sectionLabel } from "./blocks";
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
 * Both carry two buttons, and the order is deliberate: verifying the address is
 * what this mail is asking for, so it is the filled one, and My SOG follows as
 * the outlined second. Neither is a dead end — a reader who ignores the
 * verification can still get on with the product, which is exactly what the
 * copy promises.
 */

interface WelcomeParentEmailOptions {
  firstName: string;
  /** App-generated verification link. */
  verificationUrl: string;
  /** App-generated My SOG link. */
  dashboardUrl: string;
  /** App-generated shop link. */
  shopUrl: string;
}

export function buildWelcomeParentEmail(
  t: EmailTranslator,
  locale: string,
  { firstName, verificationUrl, dashboardUrl, shopUrl }: WelcomeParentEmailOptions,
): string {
  const content = `
    ${heading(t("welcomeParent.heading"))}
    ${paragraph(t("welcomeParent.greeting", { firstName: styledName(firstName) }))}
    ${paragraph(t("welcomeParent.platform"))}
    ${sectionLabel(t("welcomeParent.nextTitle"))}
    ${bulletList([
      t("welcomeParent.step1"),
      // The shop step is the one that can be acted on from here, so it carries
      // the link rather than adding a third button beside the two below.
      inlineLink(shopUrl, t("welcomeParent.step2")),
      t("welcomeParent.step3"),
    ])}
    ${paragraph(t("welcomeParent.verifyBody"))}
    ${ctaButton({ href: verificationUrl, label: t("welcomeParent.verifyButton") })}
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
}

/**
 * The certification line is the load-bearing sentence here. A new Gedu reading
 * "an admin will review your account" with nothing after it assumes they are
 * locked out until that happens, so the same sentence has to say what
 * certification actually gates — being assigned to a group — and that
 * everything else is open now.
 */
export function buildWelcomeGeduEmail(
  t: EmailTranslator,
  locale: string,
  { firstName, verificationUrl, dashboardUrl }: WelcomeGeduEmailOptions,
): string {
  const content = `
    ${heading(t("welcomeGedu.heading"))}
    ${paragraph(t("welcomeGedu.greeting", { firstName: styledName(firstName) }))}
    ${paragraph(t("welcomeGedu.certification"))}
    ${sectionLabel(t("welcomeGedu.nextTitle"))}
    ${bulletList([t("welcomeGedu.step1"), t("welcomeGedu.step2")])}
    ${paragraph(t("welcomeGedu.verifyBody"))}
    ${ctaButton({ href: verificationUrl, label: t("welcomeGedu.verifyButton") })}
    ${ctaButton({ href: dashboardUrl, label: t("welcomeGedu.dashboardButton"), variant: "secondary" })}
  `;
  return wrapInLayout({ title: t("welcomeGedu.heading"), content, locale, t });
}
