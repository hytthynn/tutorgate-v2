import { Fragment, type ReactNode } from "react";
import { normalizedMarks, type RichContent } from "@/features/chats/rich-text";

export function RichMessage({ content }: { content: RichContent }) {
  return <>{content.map((run,i) => {
    let node: ReactNode = run.text;
    for (const mark of normalizedMarks(run.marks).reverse()) {
      switch (mark.type) {
        case "bold": node = <strong>{node}</strong>; break;
        case "italic": node = <em>{node}</em>; break;
        case "underline": node = <u>{node}</u>; break;
        case "strike": node = <s>{node}</s>; break;
        case "code": node = <code>{node}</code>; break;
        case "blockquote": node = <span className="chat-quote">{node}</span>; break;
        case "link": node = <a href={mark.href} target="_blank" rel="noopener noreferrer">{node}</a>; break;
      }
    }
    return <Fragment key={i}>{node}</Fragment>;
  })}</>;
}
