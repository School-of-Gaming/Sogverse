import type { GeduContractDocument } from "../contract-document";

/**
 * Game Educator Terms (Gedu Agreement), version 2026-2027 — the English text,
 * transcribed verbatim from the signed-off source document.
 *
 * **This file is a legal instrument, not copy.** It is not a courtesy
 * translation: the English text is equally binding with its Finnish sibling of
 * the same version. Every sentence, clause number, figure and defined term is
 * the source document's own; nothing here is paraphrased, shortened, reordered
 * or modernised, and the en dashes and the literal "(1)"/"1)" list markers are
 * the source's. Fixing a typo means agreeing the fix with the counterparty and
 * publishing a new version, not editing this file.
 *
 * Clause numbers are written into the text rather than generated: the document
 * cross-references them (clause 2.3, 4.7, 5.2, 7.2, 7.4, 1.2, 1.4, 9, 10,
 * Appendix A), so a number produced by list position would break a reference
 * the moment a block moved. The source expresses them as nested markdown
 * ordered lists, which is the same numbering rendered a different way.
 */
export const geduContract20262027En: GeduContractDocument = {
  version: "2026-2027",
  language: "en",
  title: "GAME EDUCATOR TERMS (GEDU AGREEMENT)",
  blocks: [
    {
      kind: "paragraph",
      text: "**Between School of Gaming Galactic Oy and the Game Educator**",
    },
    {
      kind: "paragraph",
      text: "Version 2026–2027 (1 August 2026). These terms may be updated in accordance with clause 9.",
    },
    { kind: "separator" },

    { kind: "heading", level: 2, text: "HOW THE AGREEMENT IS FORMED" },
    {
      kind: "paragraph",
      text: "These terms form a single document that contains the framework agreement terms (clauses 1–9), the confidentiality terms (clause 10), and the quality assurance and conditions for offering assignments (Appendix A). The Service Provider accepts the whole document with a single acceptance on the Sogverse platform when creating an account. No separately signed appendices are made.",
    },
    {
      kind: "bullets",
      items: [
        '**One acceptance.** By accepting these terms on the Sogverse platform, the Service Provider simultaneously accepts clauses 1–10 and Appendix A in full, and may thereafter take on assignments and act as a game educator ("Gedu").',
        "**Electronic acceptance.** Acceptance is given electronically on the Sogverse platform, and no separately signed copy is required. Electronic acceptance has the same legal effect as a signature. The platform stores the time of acceptance, the accepted version of the terms, and the Service Provider's identifying details, and this constitutes the parties' evidence that the Agreement has been formed.",
        "**Criminal record extract as a separate step.** Before the first assignment begins, the Service Provider must also present a criminal record extract to the Client for inspection in accordance with clause 8. This is not done with a single click, because by law the extract must be shown and may not be stored; it is therefore a separate step of its own.",
      ],
    },
    {
      kind: "paragraph",
      text: 'These terms are referred to below as the "**Agreement**".',
    },
    { kind: "separator" },

    { kind: "heading", level: 2, text: "PARTIES" },
    {
      kind: "table",
      rows: [
        [
          "(1)",
          '**Service Provider** ("**Service Provider**" or "**Gedu**"), who has accepted these terms on the account created on the Sogverse platform. The Service Provider is identified on the basis of the Sogverse account details.',
          "Service Provider's name, business ID or date of birth, address, email and phone number as per the Sogverse account.",
        ],
        [
          "(2)",
          '**School of Gaming Galactic Oy,** business ID 3110461-1, address Isokatu 56, 90100 Oulu ("**Client**").',
          // The source's cell runs the three lines together, an artefact of the
          // document export; they are the contact block's own lines.
          "**Contact person**\nMikko Perälä, +358 40 7453749\nmikko@sog.gg",
        ],
      ],
    },
    {
      kind: "paragraph",
      text: "This document is not completed or modified for individual Service Providers; it is accepted as a standard-form document as it stands. The Service Provider's identifying and contact details are determined by the information the Service Provider has entered and maintains on the Sogverse account, and the acceptance record stored by the Sogverse platform links the account holder to the accepted version of the terms. The Service Provider is responsible for keeping their details up to date.",
    },
    {
      kind: "paragraph",
      text: '(the Client and the Service Provider together the "**Parties**" and individually a "**Party**")',
    },

    { kind: "heading", level: 2, text: "BACKGROUND" },
    {
      kind: "paragraph",
      text: "1) The Client is a recognised service and expert company in game education, digital youth work and e-sports coaching, offering educational service products for children and young people, as well as training for youth workers, teachers and others interested in game education and digital youth work.",
    },
    {
      kind: "paragraph",
      text: "2) The Service Provider is an independent entrepreneur and a game education expert approved by the Client, who provides game education for children and young people on the Client's assignment, online or as in-person instruction.",
    },

    {
      kind: "heading",
      level: 2,
      text: "1. SUBJECT AND DESCRIPTION OF THE AGREEMENT",
    },
    {
      kind: "paragraph",
      text: "1.1 The subject of the Agreement is the game education for children and young people, delivered online and as in-person instruction, defined in clause 1.2.",
    },
    {
      kind: "paragraph",
      text: "1.2 The Client arranges game education in the form of clubs, morning and afternoon hobby activities, holiday camps, and various online events such as tournaments and competitions.",
    },
    {
      kind: "paragraph",
      text: "1.3 Game education consists of various content themes (Game Education Theme), delivered in accordance with the activities defined in clause 1.2.",
    },
    {
      kind: "paragraph",
      text: "1.4 The Client offers the Service Provider game education instruction as individual assignments through the Sogverse platform. Each assignment is formed only when the Service Provider accepts it on the platform. The Service Provider has no obligation to accept any individual assignment, and the Client does not undertake to offer the Service Provider any particular number of assignments.",
    },
    {
      kind: "paragraph",
      text: "1.5 The assignment fee payable for an assignment is determined by the length and type of the assignment, the Service Provider's experience, and the price agreed with the Client's end customer. Each assignment fee may therefore be of a different amount.",
    },
    {
      kind: "paragraph",
      text: "1.6 The Service Provider carries out the game education instruction primarily using their own equipment and internet connection from their own premises. In the case of in-person game education, the Service Provider carries it out at premises designated by the Client or its end customer.",
    },
    {
      kind: "paragraph",
      text: "1.7 The Service Provider undertakes to actively use the software and communication channels designated by the Client in the instruction, communication and administration of game education, to the extent necessary to ensure the compatibility, safety and quality of the service.",
    },

    {
      kind: "heading",
      level: 2,
      text: "2. OBLIGATIONS OF THE SERVICE PROVIDER",
    },
    { kind: "heading", level: 3, text: "2.1 General" },
    {
      kind: "bullets",
      items: [
        "Instructing game education activities and groups in accordance with the Client's game education plan and approach. Club-specific content is described in the Club Guide.",
        "Adhering to the times set for the assignment and being present on time.",
        "Taking every participant into account at every game education session.",
        "Producing a high-quality game education experience for participants.",
        "Granting the Client permission to publish general information about the Service Provider on the Client's website and on the Sogverse platform, such as the Service Provider's photo, name, and personal and competence description.",
        "Not causing reputational harm to the Client through their conduct or communication.",
        "Complying with the Client's general instructions and processes concerning the quality and safety of the service and the protection of children and young people.",
      ],
    },
    { kind: "heading", level: 3, text: "2.2 Communication and reporting" },
    {
      kind: "bullets",
      items: [
        "Recording participant attendance and the content actually delivered in each game education session, and writing a short home update (a report to the participants or their guardians on how the session went) for each session, in the systems designated by the Client. Reporting and the home update are done within 24 hours of the end of the session at the latest, but preferably immediately after the session ends.",
        "Marking game education sessions as delivered also in third-party reporting systems (for example Hellewi, Lyyti, Suomisport) where the Client so instructs.",
        "Keeping the Client's contact person informed, as needed, of the progress of game education and the general situation of the club.",
      ],
    },
    {
      kind: "heading",
      level: 3,
      text: "2.3 Substitution and cancellation of an assignment",
    },
    {
      kind: "bullets",
      items: [
        "When prevented from attending, the Service Provider arranges a substitute from among the game educators approved by the Client and follows the process laid down by the Client for arranging a substitute. Use of the Discord ticket system is mandatory when arranging substitution for consumer clubs.",
        "The Service Provider goes through the plan and goals of the upcoming session with the substitute. The substitute must be capable of game education work of equal quality to that of the person being substituted.",
        "**Sudden illness or accident:** The Service Provider notifies the Client of the impediment in the manner instructed by the Client as soon as possible, at the latest 24 hours before the start of the game education instruction, where circumstances allow. The Client may request a medical certificate in respect of illness.",
        "**Impediments other than illness:** The Service Provider notifies the Client of the impediment at least one (1) calendar week before the start of the game education instruction.",
        "If the Service Provider does not observe the above notice periods, does not find a substitute for the assignment, and the game education session is cancelled as a result, the Client is entitled to charge the Service Provider the compensation set out in clause 7.2.",
      ],
    },

    { kind: "heading", level: 2, text: "3. OBLIGATIONS OF THE CLIENT" },
    {
      kind: "bullets",
      items: [
        "Producing the necessary training material and game education content (Club Guides) that the Service Provider uses in the game education sessions.",
        "Storing the Service Provider's data in accordance with data protection legislation.",
        "Processing and paying the invoices sent by the Service Provider, once verified and confirmed as correct, on time.",
        "Maintaining the Sogverse platform, through which assignments, fee details and reporting are available to the Service Provider.",
      ],
    },

    { kind: "heading", level: 2, text: "4. PRICES AND INVOICING" },
    {
      kind: "paragraph",
      text: "4.1 The Client offers the Service Provider assignments (e.g. running hobby sessions, camp instruction, participation in an event).",
    },
    {
      kind: "paragraph",
      text: "4.2 The Service Provider may invoice the Client on the basis of assignments actually carried out. The assignment fee payable for an assignment includes the game education, the instruction of the group, the planning of the session, communication with guardians, and all other activity related to high-quality game education work.",
    },
    {
      kind: "paragraph",
      text: "4.3 The amount of the assignment fee payable for game education work depends on the length of the assignment (e.g. 60 min or 90 min), its type (e.g. hobby session or camp), the Service Provider's experience, and the price agreed with the Client's end customer. Assignment fees may therefore vary. The defined assignment fees are visible on the Sogverse platform for each assignment.",
    },
    {
      kind: "paragraph",
      text: "4.4 By way of example, the per-session assignment fees for weekly activities vary between EUR 17 (minimum) and EUR 40, depending on the length of the session and the agreement between the Client and the end customer.",
    },
    {
      kind: "paragraph",
      text: "4.5 By accepting an assignment and its game education sessions, the Service Provider accepts the fee defined for it on the Sogverse platform.",
    },
    {
      kind: "paragraph",
      text: "4.6 Compensation for activity other than that offered as assignments is always agreed separately in writing with the Client in advance.",
    },
    {
      kind: "paragraph",
      text: "4.7 The Service Provider invoices the assignments actually carried out and accepted, on an as-delivered basis, monthly. Assignments carried out during an assignment month must be invoiced during the calendar month following the assignment month at the latest. Invoices arriving after this deadline are as a rule not processed. For a special and justified reason, the Client may process a late invoice.",
    },
    {
      kind: "paragraph",
      text: "4.8 The prices are subject to value added tax in force at the relevant time, being 25.5% at the time of the Agreement.",
    },
    {
      kind: "paragraph",
      text: "4.9 The Service Provider's method of invoicing and everything related to invoicing is the Service Provider's responsibility. The Client is not liable for any additional invoicing costs.",
    },
    { kind: "heading", level: 3, text: "4.10 Invoicing details" },
    {
      kind: "bullets",
      items: [
        "Payer's name: School of Gaming Galactic Oy (business ID: 3110461-1)",
        "E-invoice address: 003731104611",
        "Operator: 003708599126 (Liaison Technologies Oy)",
        "Payment term: 14 days net",
      ],
    },

    {
      kind: "heading",
      level: 2,
      text: "5. TERM AND TERMINATION OF THE AGREEMENT",
    },
    {
      kind: "paragraph",
      text: "5.1 The Agreement enters into force when the Service Provider has accepted these terms on the Sogverse platform, and remains in force until 31 July 2027.",
    },
    {
      kind: "paragraph",
      text: "5.2 The Parties may terminate the Agreement on one (1) month's notice, or with immediate effect if the other Party repeatedly or materially breaches its obligations.",
    },
    {
      kind: "paragraph",
      text: "5.3 The Service Provider may terminate their commitment to an individual assignment in accordance with clause 2.3, provided the Service Provider can present a replacement game educator, approved by the Client, who is at least equally competent.",
    },
    {
      kind: "paragraph",
      text: "5.4 Termination of the Agreement does not affect the invoicing of assignments carried out before termination in accordance with clause 4.7, nor the confidentiality obligations (clause 10), which remain in force.",
    },

    {
      kind: "heading",
      level: 2,
      text: "6. STATUS OF THE PARTIES AND OTHER TERMS",
    },
    {
      kind: "paragraph",
      text: "6.1 **Status of the Parties.** The Service Provider acts as an independent entrepreneur on their own account, and no employment relationship arises between the Service Provider and the Client on the basis of this Agreement or of individual assignments. The Service Provider is responsible for their own taxes, statutory insurance (such as the self-employed persons' pension insurance, YEL) and other obligations of an entrepreneur. The Service Provider independently decides on their tools, working methods and the organisation of their work, within the goals and quality requirements of the assignment, and the Service Provider is entitled to offer similar services to other clients as well. The instructions, content and quality requirements defined by the Client in this Agreement concern the outcome of the service and the safety of children and young people, not the personal, work-directed subordination of the Service Provider.",
    },
    {
      kind: "paragraph",
      text: "6.2 This Agreement supersedes previous game educator framework agreements between the Parties.",
    },
    {
      kind: "paragraph",
      text: "6.3 The Client receives and pays only electronic invoices.",
    },
    {
      kind: "paragraph",
      text: "6.4 This Agreement is governed by Finnish law. Disputes concerning the Agreement are resolved primarily through negotiation. If negotiations do not lead to a resolution, the dispute is resolved by the district court of the Client's domicile.",
    },

    {
      kind: "heading",
      level: 2,
      text: "7. BREACH OF THE AGREEMENT AND CONSEQUENCES",
    },
    {
      kind: "paragraph",
      text: "7.1 If the Service Provider causes intentional damage to the Client's reputation through their conduct or deliberate action, they are liable to compensate the Client for the damage caused.",
    },
    {
      kind: "paragraph",
      text: "7.2 If the Service Provider does not give sufficiently timely notice (clause 2.3) of an impediment to arranging the game education under the assignment, or leaves the game education undone without valid reason, and no substitute is found for the assignment, the Client may at its discretion charge the Service Provider compensation for lost income. The amount of the compensation is EUR 50 per instruction hour left undone.",
    },
    {
      kind: "paragraph",
      text: "7.3 The Agreement may be cancelled if a Party repeatedly breaches the terms of the Agreement despite requests to remedy the situation.",
    },
    {
      kind: "paragraph",
      text: "7.4 The Client may cease offering assignments to the Service Provider and cancel the Agreement with immediate effect if the Service Provider's conduct, actions or performance materially breach the Client's operating practices or endanger the safety of children and young people. Grounds for immediate cancellation include, among others:",
    },
    {
      kind: "bullets",
      items: [
        "Inviting or steering customers participating in the activity to game servers, social media platforms, communication channels or communities other than those managed and approved by the Client, without the Client's prior consent.",
        "Violence or the threat of violence directed at any person.",
        "A criminal conviction relevant to working with children and young people.",
        "Intentional breach of a confirmed operating practice or rule defined by the Client, or refusal to use the defined content, tools or instruction methods.",
        "Falsifying the Client's information.",
        "Gross negligence.",
        "Dishonesty or breach of trust.",
        "Breach of the zero-tolerance policy on harassment and sexual harassment.",
        "Theft.",
        "Unauthorised use of the premises or property of the Client or the Client's customer.",
        "Continuous absence or lateness.",
        "Carrying out an assignment under the influence of alcohol or drugs.",
        "A notice given under the procedure in Appendix A in a situation where the Service Provider does not correct their conduct.",
      ],
    },

    { kind: "heading", level: 2, text: "8. CHECKING THE CRIMINAL BACKGROUND" },
    {
      kind: "paragraph",
      text: "8.1 The Client is obliged to check the criminal background of persons working with children in the manner required by law (Act on Checking the Criminal Background of Persons Working with Children 504/2002, section 3).",
    },
    {
      kind: "paragraph",
      text: "8.2 Before the first assignment begins, the Service Provider obtains at their own expense a criminal record extract concerning themselves and presents it to the Client for inspection in the manner instructed by the Client.",
    },
    {
      kind: "paragraph",
      text: "8.3 The Client only inspects the extract. The Client records in the Service Provider's Sogverse profile solely the fact that the extract has been presented and checked (and the date of the check). The Client does not take a copy of the extract, does not record its content, and does not store the extract, nor is the extract uploaded to the Sogverse platform.",
    },
    {
      kind: "paragraph",
      text: "8.4 The Parties note that the Client has no right to oblige the Service Provider to present the criminal record extract. The Service Provider presents the extract voluntarily and on the basis of their consent. If the Service Provider does not present the criminal record extract, the Client reserves the right not to offer the Service Provider assignments.",
    },

    { kind: "heading", level: 2, text: "9. UPDATING THE TERMS" },
    {
      kind: "paragraph",
      text: "9.1 The Client has the right to update these terms, for example due to legislation, official guidance, or the development of the service or the Sogverse platform.",
    },
    {
      kind: "paragraph",
      text: "9.2 Material changes are notified to the Service Provider through the Sogverse platform or by email within a reasonable time, at least thirty (30) days before the changes take effect. Minor or technical changes may be notified within a shorter time.",
    },
    {
      kind: "paragraph",
      text: "9.3 Changes become binding on the Service Provider when the Service Provider accepts the updated terms on the Sogverse platform or accepts an assignment after the changes take effect. If the Service Provider does not accept a material change, the Service Provider has the right to terminate the Agreement in accordance with clause 5.2. Assignments already accepted are subject to the terms that were in force when the assignment was accepted.",
    },

    { kind: "heading", level: 2, text: "10. CONFIDENTIALITY" },
    {
      kind: "paragraph",
      text: "10.1 **Background.** The Service Provider performs assignments for the Client, during which the Service Provider may come to know trade and professional secrets of the Client and of its customers and partners, such as customers' names and contact details, agreements, minutes, correspondence, business, marketing and other plans, information about the Client's finances, and information of the Client's partners or customers. The Service Provider may receive this information in any form, for example in writing, orally, electronically or through their own observation. The Service Provider understands that this information is strictly confidential and of particular importance to the Client, its customers and partners.",
    },
    {
      kind: "paragraph",
      text: "10.2 The Service Provider undertakes, during the offering of assignments and after it ends, to keep secret and confidential all confidential information received. The Service Provider may not disclose or otherwise reveal or transfer confidential information to anyone, including other game educators. This does not apply to situations where another game educator needs to know the information, for example in order to substitute for a club.",
    },
    {
      kind: "paragraph",
      text: "10.3 The Service Provider may not use the confidential information they receive for any purpose other than performing their agreed tasks. This also applies to all information that a customer discloses during the customer relationship.",
    },
    {
      kind: "paragraph",
      text: "10.4 The Service Provider understands that disclosing information or using it contrary to this Agreement may result in a penalty or liability for damages.",
    },
    {
      kind: "paragraph",
      text: "10.5 The Service Provider's confidentiality obligation continues also after the provision of services ends, and remains in force permanently.",
    },
    {
      kind: "paragraph",
      text: "10.6 On the termination of the cooperation, the Service Provider undertakes to return, or at the Client's request or with the Client's permission to destroy, all material containing confidential information from their own devices, such as documents or files created on a computer.",
    },
    {
      kind: "paragraph",
      text: "10.7 Photos and videos taken by the Service Provider in connection with assignments, and other educational and pedagogical content material created, belong in principle to the Client and are subject to this Agreement, unless otherwise agreed.",
    },
    { kind: "separator" },

    { kind: "heading", level: 2, text: "ACCEPTANCE" },
    {
      kind: "paragraph",
      text: "The Service Provider accepts these terms in full (clauses 1–10 and Appendix A) electronically on the Sogverse platform. The platform stores the time of acceptance, the accepted version of the terms, and the Service Provider's identifying details. No separately signed paper copy is made.",
    },
    {
      kind: "paragraph",
      text: "Confirmed on behalf of the Client by:\nMikko Perälä, Reksi\nSchool of Gaming Galactic Oy",
    },
    { kind: "separator" },

    {
      kind: "heading",
      level: 2,
      text: "APPENDIX A: QUALITY ASSURANCE AND CONDITIONS FOR OFFERING ASSIGNMENTS",
    },
    {
      kind: "paragraph",
      text: "This appendix describes how the Client monitors the quality of assignments and decides on offering new assignments. The purpose of the procedure is to safeguard the quality of game education and the interest and safety of children and young people (the end customers).",
    },
    {
      kind: "paragraph",
      text: "For the avoidance of doubt, it is noted that this procedure does not change the relationship between the Parties into an employment relationship. It is not work-directed discipline, and the notices referred to in this appendix are not employment-law warnings. It concerns the Client's assessment of assignment quality and the resulting business decision on whether the Client offers the Service Provider new assignments. As stated in clause 1.4, the Client has no obligation to offer the Service Provider assignments.",
    },
    {
      kind: "paragraph",
      text: "All quality notices referred to in this appendix are given in writing, so that both the Client and the Service Provider retain a time-stamped record of the quality discussion held.",
    },
    {
      kind: "paragraph",
      text: "**Grounds for a quality notice include, for example:**",
    },
    {
      kind: "bullets",
      items: [
        "Failure to report despite reminders",
        "Failure to send home updates despite reminders",
        "Continuous lateness",
        "Lateness that is not notified",
        "Agreeing changes with the end customer without the Client's approval",
        "Incorrect and misleading communication",
        "Repeated last-minute cancellation without appropriate proof",
        "Changing or failing to deliver club content without the Client's approval",
        "Inappropriate conduct (if sufficiently blatant, it may be grounds for immediate cancellation under clause 7.4)",
        "Staying silent about observed shortcomings",
        "Inappropriate handling of, or failure to handle, customer situations",
        "Other conduct contrary to the Client's operating principles",
      ],
    },
    { kind: "heading", level: 3, text: "First quality notice and remedy" },
    {
      kind: "paragraph",
      text: "The Service Provider is told in writing and clearly in what respects their conduct has departed from these terms and the Client's principles. Where necessary, the Service Provider is consulted on how to remedy the situation, and the Client's contact person offers support and possibly additional onboarding.",
    },
    { kind: "heading", level: 3, text: "Second quality notice" },
    {
      kind: "paragraph",
      text: "The Service Provider is told in writing and clearly in what respects their conduct has departed from these terms and the Client's principles. The Client's contact person discusses the matter with the Service Provider and together they review the impact of the conduct on the end customer. The contact person informs the Client's management of the discussions held.",
    },
    {
      kind: "heading",
      level: 3,
      text: "Third quality notice and limitation of assignments",
    },
    {
      kind: "paragraph",
      text: "The Service Provider is told in writing and clearly in what respects their conduct has departed from these terms and the Client's principles. If a third quality notice has to be given within less than one month of the first two, the Client may cease offering assignments and end the Agreement in accordance with clause 5.2. If a third quality notice is given within three (3) months of the previous ones, the Client may limit the new assignments offered to the Service Provider until the Service Provider has corrected the conduct underlying the notices and has performed their assignments without new quality notices for a period of three (3) months.",
    },
    { kind: "heading", level: 3, text: "Suspension of offering assignments" },
    {
      kind: "paragraph",
      text: "If a third quality notice is given within one month of the previous one, the Client may consider that the conduct is not being corrected and suspend the offering of assignments. Situational discretion is applied in such decisions on the basis of the discussions held.",
    },
    {
      kind: "heading",
      level: 3,
      text: "Assessment of the conditions for continuing the cooperation",
    },
    {
      kind: "paragraph",
      text: "If several assignments have to be suspended from the Service Provider due to repeated quality notices, the Service Provider and the Client's management hold a discussion about continuing the cooperation. On the basis of the discussion, the Client's management assesses whether the Service Provider has the conditions to continue as a provider of game education services. If the cooperation is continued, the limitation of assignments described above is applied: the limitation on new assignments is lifted if the Service Provider works without new quality notices for a period of three (3) months.",
    },
    { kind: "heading", level: 3, text: "Restarting the cooperation" },
    {
      kind: "paragraph",
      text: "If the cooperation has ended, the Service Provider may reapply to become a provider of game education services after three (3) months. Before restarting, the Service Provider is interviewed. If, on the basis of the interview, it is considered that the Service Provider has the conditions to return, they complete the Client's basic training again. On restarting, the Service Provider may take on new assignments in a limited way (a maximum of 3 clubs). If the Service Provider works without new quality notices for a period of three (3) months, the limitation on new assignments is lifted.",
    },
  ],
};
