import { Fragment } from "react";
import {
  geduContractLines,
  type GeduContractBlock,
  type GeduContractDocument,
  type GeduContractText,
} from "./contract-document";

/**
 * One piece of contract text: its bold runs marked up, its hard line breaks
 * kept. Bold means "defined term" in this document, so it renders in the body
 * colour rather than the muted one — a defined term is the thing a reader
 * scanning the clause is looking for.
 */
function ContractText({ text }: { text: GeduContractText }) {
  return (
    <>
      {geduContractLines(text).map((segments, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex > 0 && <br />}
          {segments.map((segment, segmentIndex) =>
            segment.bold ? (
              <strong
                key={segmentIndex}
                className="font-semibold text-foreground"
              >
                {segment.text}
              </strong>
            ) : (
              <Fragment key={segmentIndex}>{segment.text}</Fragment>
            ),
          )}
        </Fragment>
      ))}
    </>
  );
}

/**
 * Spacing is per block rather than a container `space-y-*`: a heading needs
 * more air above it than one clause needs above the next, and the two ways of
 * setting margin-top would otherwise fight over the same property.
 */
function ContractBlock({ block }: { block: GeduContractBlock }) {
  switch (block.kind) {
    case "heading":
      return block.level === 2 ? (
        <h2 className="mt-10 text-xl font-bold tracking-tight first:mt-0 sm:text-2xl">
          <ContractText text={block.text} />
        </h2>
      ) : (
        <h3 className="mt-6 text-lg font-semibold">
          <ContractText text={block.text} />
        </h3>
      );
    case "paragraph":
      return (
        <p className="mt-4 text-muted-foreground first:mt-0">
          <ContractText text={block.text} />
        </p>
      );
    case "bullets":
      return (
        <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
          {block.items.map((item, index) => (
            <li key={index}>
              <ContractText text={item} />
            </li>
          ))}
        </ul>
      );
    case "table":
      // The parties block. Its cells hold whole sentences, so it needs a real
      // minimum width and scrolls inside its own container on a narrow
      // viewport rather than letting the document scroll sideways.
      return (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-border last:border-b-0"
                >
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-4 py-3 align-top text-muted-foreground"
                    >
                      <ContractText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "separator":
      return <hr className="my-8 border-border" />;
  }
}

interface GeduContractDocumentViewProps {
  document: GeduContractDocument;
}

/**
 * Renders the Gedu contract — the binding terms themselves, nothing around
 * them. Purely presentational: no hooks, no data fetching and no state, so it
 * renders identically on the server, inside the acceptance dialog, and on a
 * preview scene.
 *
 * It is a sibling of the legal-page pattern rather than a reuse of it: those
 * pages are message-key-driven plain-language policies, this is a verbatim
 * legal text that lives in the repo (see `contract-document.ts`). The
 * typography deliberately matches them, because a reader meeting both should
 * not be able to tell that two different renderers drew them.
 *
 * The caller owns the page around the document — the title chrome, the accept
 * affordance, the scroll container — and any note explaining which of the
 * contract's equally binding languages this text is, and why it is that one.
 */
export function GeduContractDocumentView({
  document,
}: GeduContractDocumentViewProps) {
  return (
    <article
      // `lang` on the article, not the page: the document's language is a
      // property of the text rather than of the app around it — a Finnish
      // reader with the app in English meets Finnish clauses either way — and a
      // screen reader reading Finnish sentences with an English voice is
      // unusable.
      lang={document.language}
      className="mx-auto max-w-3xl text-sm leading-relaxed sm:text-base"
    >
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        <ContractText text={document.title} />
      </h1>
      <div className="mt-6">
        {document.blocks.map((block, index) => (
          <ContractBlock key={index} block={block} />
        ))}
      </div>
    </article>
  );
}
