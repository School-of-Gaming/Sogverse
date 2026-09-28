import { formatInTimeZone } from "date-fns-tz";
import {
  FINVOICE_ARTICLE,
  FINVOICE_TIME_ZONE,
  FINVOICE_DELIVERY_METHOD_TEXT,
  FINVOICE_INVOICE_TYPE,
  FINVOICE_OVERDUE_FINE_TEXT,
  FINVOICE_QUANTITY_UNIT_CODE,
  FINVOICE_ROW_DIMENSION,
  FINVOICE_SELLER,
  FINVOICE_SELLER_REFERENCE,
  FINVOICE_TRANSMISSION,
  FINVOICE_VAT_RATE_TEXT,
} from "./finvoice-constants";
import type { FinvoiceInvoice, FinvoiceRow } from "./build-finvoice-invoice";

/**
 * One invoice as the Finvoice 3.0 document Fennoa's import reads.
 *
 * **The structure is reproduced, not designed.** It is the shape of the files
 * the CFO imported for years from the previous system, confirmed by three test
 * imports on 2026-09-15 of files generated from production data. Elements Fennoa
 * ignores are still written, in the order they were written before, because the
 * thing being matched is an import that is known to work rather than a
 * specification that might be read differently.
 *
 * Three properties of the output are load-bearing and each has a test:
 *
 * - **UTF-8 with no byte-order mark.** The declaration says UTF-8 and the string
 *   returned here starts with `<?xml`. A BOM reaches Fennoa as stray bytes
 *   before the declaration and the import refuses the file.
 * - **Everything interpolated is escaped.** Every value in this document is a
 *   name somebody typed — a school, a club, a department — and one ampersand in
 *   a school name is a file that is not XML at all.
 * - **Newlines inside the free text stay newlines.** The block is several lines
 *   in one element, which is how the previous system wrote it and how the
 *   buyer's clerk reads it.
 *
 * Amounts are written as `0.00` with a dot, from integer cents, by splitting
 * rather than dividing — the invoice's arithmetic is exact and the serializer
 * must not be the step that introduces a float.
 */
export function serializeFinvoice(
  invoice: FinvoiceInvoice,
  generatedAt: Date,
): string {
  const { customer } = invoice;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Finvoice Version="3.0">`,
    `  <MessageTransmissionDetails>`,
    `    <MessageSenderDetails><FromIdentifier>${x(FINVOICE_TRANSMISSION.fromIdentifier)}</FromIdentifier><FromIntermediator>${x(FINVOICE_TRANSMISSION.fromIntermediator)}</FromIntermediator></MessageSenderDetails>`,
    // The receiver's half is empty on purpose: Fennoa resolves the buyer's
    // e-invoice routing from the customer card when it sends the invoice, so an
    // address here would be a second copy of something we do not own.
    `    <MessageReceiverDetails><ToIdentifier></ToIdentifier><ToIntermediator></ToIntermediator></MessageReceiverDetails>`,
    `    <MessageDetails><MessageIdentifier>${x(invoice.invoiceNumber)}</MessageIdentifier><MessageTimeStamp>${messageTimeStamp(generatedAt)}</MessageTimeStamp></MessageDetails>`,
    `  </MessageTransmissionDetails>`,
    `  <SellerPartyDetails>`,
    `    <SellerPartyIdentifier>${x(FINVOICE_SELLER.partyIdentifier)}</SellerPartyIdentifier>`,
    `    <SellerOrganisationName>${x(FINVOICE_SELLER.organisationName)}</SellerOrganisationName>`,
    `    <SellerPostalAddressDetails><SellerStreetName>${x(FINVOICE_SELLER.streetName)}</SellerStreetName><SellerTownName>${x(FINVOICE_SELLER.townName)}</SellerTownName><SellerPostCodeIdentifier>${x(FINVOICE_SELLER.postCodeIdentifier)}</SellerPostCodeIdentifier><CountryCode>${x(FINVOICE_SELLER.countryCode)}</CountryCode></SellerPostalAddressDetails>`,
    `  </SellerPartyDetails>`,
    `  <SellerInformationDetails>`,
    `    <SellerAccountDetails><SellerAccountID IdentificationSchemeName="IBAN">${x(FINVOICE_SELLER.iban)}</SellerAccountID><SellerBic IdentificationSchemeName="BIC">${x(FINVOICE_SELLER.bic)}</SellerBic></SellerAccountDetails>`,
    `    <SellerVatRegistrationText>${x(FINVOICE_SELLER.vatRegistrationText)}</SellerVatRegistrationText>`,
    `  </SellerInformationDetails>`,
    `  <BuyerPartyDetails>`,
    // The identifier is the Fennoa customer number and nothing else. Fennoa
    // matches the buyer on it, and an identifier that is not a customer number
    // does not fail the import — it CREATES a customer, which is the failure
    // this whole feature exists to avoid.
    `    <BuyerPartyIdentifier>${x(customer.fennoa_customer_no)}</BuyerPartyIdentifier>`,
    `    <BuyerOrganisationName>${x(customer.invoice_name)}</BuyerOrganisationName>`,
    // The postal address is required by the import even though the customer
    // card already holds one: a file without it is refused outright.
    `    <BuyerPostalAddressDetails><BuyerStreetName>${x(customer.street)}</BuyerStreetName><BuyerTownName>${x(customer.city)}</BuyerTownName><BuyerPostCodeIdentifier>${x(customer.postal_code)}</BuyerPostCodeIdentifier><CountryCode>${x(customer.country_code)}</CountryCode></BuyerPostalAddressDetails>`,
    `  </BuyerPartyDetails>`,
    `  <DeliveryDetails><DeliveryMethodText>${x(FINVOICE_DELIVERY_METHOD_TEXT)}</DeliveryMethodText></DeliveryDetails>`,
    `  <InvoiceDetails>`,
    `    <InvoiceTypeCode>${x(FINVOICE_INVOICE_TYPE.code)}</InvoiceTypeCode><InvoiceTypeText>${x(FINVOICE_INVOICE_TYPE.text)}</InvoiceTypeText><OriginCode>${x(FINVOICE_INVOICE_TYPE.originCode)}</OriginCode>`,
    `    <InvoiceNumber>${x(invoice.invoiceNumber)}</InvoiceNumber>`,
    `    <InvoiceDate Format="CCYYMMDD">${x(invoice.invoiceDate)}</InvoiceDate>`,
    `    <InvoiceTotalVatExcludedAmount AmountCurrencyIdentifier="EUR">${euros(invoice.netCents)}</InvoiceTotalVatExcludedAmount>`,
    `    <InvoiceTotalVatAmount AmountCurrencyIdentifier="EUR">${euros(invoice.vatCents)}</InvoiceTotalVatAmount>`,
    `    <InvoiceTotalVatIncludedAmount AmountCurrencyIdentifier="EUR">${euros(invoice.grossCents)}</InvoiceTotalVatIncludedAmount>`,
    `    <PaymentTermsDetails><InvoiceDueDate Format="CCYYMMDD">${x(invoice.dueDate)}</InvoiceDueDate><PaymentOverDueFineDetails><PaymentOverDueFineFreeText>${x(FINVOICE_OVERDUE_FINE_TEXT)}</PaymentOverDueFineFreeText></PaymentOverDueFineDetails></PaymentTermsDetails>`,
    `    <InvoiceFreeText>${x(invoice.freeText)}</InvoiceFreeText>`,
    `    <SellerReferenceIdentifier>${x(FINVOICE_SELLER_REFERENCE)}</SellerReferenceIdentifier>`,
    // Empty where the buyer has stated no reference, rather than omitted: the
    // element's presence is part of the shape the import was verified against.
    `    <BuyerReferenceIdentifier>${x(customer.your_reference ?? "")}</BuyerReferenceIdentifier>`,
    `  </InvoiceDetails>`,
    `  <VatSpecificationDetails><VatBaseAmount AmountCurrencyIdentifier="EUR">${euros(invoice.netCents)}</VatBaseAmount><VatRatePercent>${x(FINVOICE_VAT_RATE_TEXT)}</VatRatePercent><VatRateAmount AmountCurrencyIdentifier="EUR">${euros(invoice.vatCents)}</VatRateAmount></VatSpecificationDetails>`,
    ...invoice.rows.flatMap(serializeRow),
    `</Finvoice>`,
  ].join("\n");
}

function serializeRow(row: FinvoiceRow): string[] {
  return [
    `  <InvoiceRow>`,
    `    <RowNumber>${row.rowNumber}</RowNumber><ArticleIdentifier>${x(FINVOICE_ARTICLE.identifier)}</ArticleIdentifier><ArticleName>${x(FINVOICE_ARTICLE.name)}</ArticleName>`,
    `    <DeliveredQuantity QuantityUnitCode="${x(FINVOICE_QUANTITY_UNIT_CODE)}">${quantity(row.sessions)}</DeliveredQuantity>`,
    `    <UnitPriceAmount AmountCurrencyIdentifier="EUR">${euros(row.unitPriceCents)}</UnitPriceAmount>`,
    `    <RowVatRatePercent>${x(FINVOICE_VAT_RATE_TEXT)}</RowVatRatePercent>`,
    `    <RowVatAmount AmountCurrencyIdentifier="EUR">${euros(row.vatCents)}</RowVatAmount>`,
    `    <RowVatExcludedAmount AmountCurrencyIdentifier="EUR">${euros(row.netCents)}</RowVatExcludedAmount>`,
    `    <RowAmount AmountCurrencyIdentifier="EUR">${euros(row.grossCents)}</RowAmount>`,
    `    <RowFreeText>${x(row.text)}</RowFreeText>`,
    `    <RowIdentifier>${x(FINVOICE_ROW_DIMENSION)}</RowIdentifier><RowAccountDimensionText>${x(FINVOICE_ROW_DIMENSION)}</RowAccountDimensionText>`,
    `  </InvoiceRow>`,
  ];
}

/**
 * XML text escaping.
 *
 * All five predefined entities, including the two that only matter inside an
 * attribute value: a single escaper for every interpolation is one rule to
 * check rather than a per-call-site judgment about where the value lands, and
 * an over-escaped quote in element text is still exactly the same character
 * once parsed.
 */
function x(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Integer cents as `0.00`, built by splitting rather than dividing.
 *
 * `cents / 100` is a float, and a float formatted to two places is the one step
 * that could make a document whose rows foot exactly print a total that does
 * not. Splitting keeps the whole path integral.
 */
function euros(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

/** A whole number of sessions, written with the two decimals the file wants. */
function quantity(sessions: number): string {
  return `${sessions}.00`;
}

/**
 * The generation timestamp, `YYYY-MM-DDTHH:MM:SS`, with no zone designator —
 * which is the shape the previous system wrote and the shape the verified
 * imports carried.
 *
 * **Written in Helsinki, not in UTC.** A wall clock with no zone on it is read
 * as the writer's own, and the writer here is a Finnish company invoicing
 * Finnish municipalities from a server that could be anywhere; a UTC clock
 * stamped on a file raised at half past one in the morning would carry the
 * previous day's date for everyone who reads it.
 *
 * It is the only value in the document that is not a fact about the month, and
 * it is the reason the file is not byte-identical between two exports of the
 * same month. Nothing downstream reads it; the invoice is identified by its
 * number, and Fennoa replaces that on send anyway.
 */
function messageTimeStamp(generatedAt: Date): string {
  return formatInTimeZone(
    generatedAt,
    FINVOICE_TIME_ZONE,
    "yyyy-MM-dd'T'HH:mm:ss",
  );
}
