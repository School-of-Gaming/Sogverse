// The sv catalog: one static import per namespace file in this directory, in
// catalog order. Static so the bundler and the test dependency graph both see every
// file — src/i18n/CLAUDE.md. The translations check fails when this list and the
// directory disagree.
import metadata from "./metadata.json";
import notFound from "./notFound.json";
import common from "./common.json";
import datePicker from "./datePicker.json";
import imageCrop from "./imageCrop.json";
import about from "./about.json";
import admin from "./admin.json";
import auth from "./auth.json";
import pin from "./pin.json";
import purchaseConfirmation from "./purchaseConfirmation.json";
import docs from "./docs.json";
import dashboardSections from "./dashboardSections.json";
import helpSection from "./helpSection.json";
import family from "./family.json";
import familyEnrollment from "./familyEnrollment.json";
import familyProduct from "./familyProduct.json";
import selectProfile from "./selectProfile.json";
import footer from "./footer.json";
import gamer from "./gamer.json";
import gedu from "./gedu.json";
import geduInvoicing from "./geduInvoicing.json";
import productType from "./productType.json";
import activityCard from "./activityCard.json";
import sessionBadge from "./sessionBadge.json";
import sessionFacts from "./sessionFacts.json";
import sessionFeed from "./sessionFeed.json";
import groups from "./groups.json";
import memberFlair from "./memberFlair.json";
import richText from "./richText.json";
import localeTabs from "./localeTabs.json";
import header from "./header.json";
import schools from "./schools.json";
import productBrowse from "./productBrowse.json";
import productAudience from "./productAudience.json";
import productTag from "./productTag.json";
import productTagDetail from "./productTagDetail.json";
import seatAvailability from "./seatAvailability.json";
import productDetail from "./productDetail.json";
import topicPrep from "./topicPrep.json";
import sidebar from "./sidebar.json";
import adminHubs from "./adminHubs.json";
import home from "./home.json";
import testimonial from "./testimonial.json";
import locations from "./locations.json";
import gameAccount from "./gameAccount.json";
import parent from "./parent.json";
import settings from "./settings.json";
import tools from "./tools.json";
import verifyEmail from "./verifyEmail.json";
import voice from "./voice.json";
import voiceButton from "./voiceButton.json";
import yty from "./yty.json";
import email from "./email.json";
import legal from "./legal.json";
import privacy from "./privacy.json";
import terms from "./terms.json";
import discipline from "./discipline.json";
import roblox from "./roblox.json";
import robloxPrivacy from "./robloxPrivacy.json";
import robloxSafeguarding from "./robloxSafeguarding.json";
import robloxTerms from "./robloxTerms.json";
import attributions from "./attributions.json";
import oauthConsent from "./oauthConsent.json";
import discordLink from "./discordLink.json";
import slackLink from "./slackLink.json";
import discordSub from "./discordSub.json";
import discordSubOffer from "./discordSubOffer.json";
import seatOffer from "./seatOffer.json";
import consentDocuments from "./consentDocuments.json";
import chat from "./chat.json";
import gamerSignIn from "./gamerSignIn.json";
import consent from "./consent.json";
import team from "./team.json";
import library from "./library.json";
import landingPage from "./landingPage.json";
import discover from "./discover.json";
import landingSubscribe from "./landingSubscribe.json";

const messages = {
  metadata,
  notFound,
  common,
  datePicker,
  imageCrop,
  about,
  admin,
  auth,
  pin,
  purchaseConfirmation,
  docs,
  dashboardSections,
  helpSection,
  family,
  familyEnrollment,
  familyProduct,
  selectProfile,
  footer,
  gamer,
  gedu,
  geduInvoicing,
  productType,
  activityCard,
  sessionBadge,
  sessionFacts,
  sessionFeed,
  groups,
  memberFlair,
  richText,
  localeTabs,
  header,
  schools,
  productBrowse,
  productAudience,
  productTag,
  productTagDetail,
  seatAvailability,
  productDetail,
  topicPrep,
  sidebar,
  adminHubs,
  home,
  testimonial,
  locations,
  gameAccount,
  parent,
  settings,
  tools,
  verifyEmail,
  voice,
  voiceButton,
  yty,
  email,
  legal,
  privacy,
  terms,
  discipline,
  roblox,
  robloxPrivacy,
  robloxSafeguarding,
  robloxTerms,
  attributions,
  oauthConsent,
  discordLink,
  slackLink,
  discordSub,
  discordSubOffer,
  seatOffer,
  consentDocuments,
  chat,
  gamerSignIn,
  consent,
  team,
  library,
  landingPage,
  discover,
  landingSubscribe,
};

export default messages;
