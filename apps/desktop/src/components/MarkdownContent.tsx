import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { decodeString } from "micromark-util-decode-string";
import type { Parent, Root, RootContent } from "mdast";
import type { CitationOccurrence } from "../studio";

// Position checks use original UTF-16 offsets, never the rendered text as evidence.
export const MarkdownContent = memo(function MarkdownContent({
  content,
  occurrences = [],
  onCitation,
}: {
  content: string;
  occurrences?: CitationOccurrence[];
  onCitation?: (item: CitationOccurrence) => void;
}) {
  const citations = () => (tree: Root) => {
    const walk = (parent: Parent) => {
      parent.children = parent.children.flatMap((child): RootContent[] => {
        if (child.type === "link" || child.type === "linkReference")
          return [child];
        if ("children" in child) walk(child as Parent);
        if (child.type !== "text" || !child.position) return [child];
        const start = child.position.start.offset;
        const end = child.position.end.offset;
        if (start === undefined || end === undefined) return [child];
        const pieces: RootContent[] = [];
        let cursor = 0;
        for (const item of occurrences) {
          if (
            item.start < start ||
            item.end > end ||
            content.slice(item.start, item.end) !== item.label
          )
            continue;
          const prefix = decodeString(content.slice(start, item.start)).replace(
            /\r\n?/g,
            "\n",
          );
          const offset = prefix.length;
          if (
            offset < cursor ||
            !child.value.startsWith(prefix) ||
            child.value.slice(offset, offset + item.label.length) !== item.label
          )
            continue;
          pieces.push({
            type: "text",
            value: child.value.slice(cursor, offset),
          });
          pieces.push({
            type: "citation",
            data: {
              hName: "button",
              hProperties: { "data-citation-start": item.start },
            },
            children: [{ type: "text", value: item.label }],
          } as unknown as RootContent);
          cursor = offset + item.label.length;
        }
        return cursor
          ? [...pieces, { type: "text", value: child.value.slice(cursor) }]
          : [child];
      });
    };
    walk(tree);
  };
  return (
    <Markdown
      remarkPlugins={[remarkGfm, citations]}
      urlTransform={(url) => (/^(https?:\/\/|mailto:)/i.test(url) ? url : "")}
      components={{
        button: ({ node, children }) => {
          const start = Number(node?.properties["data-citation-start"]);
          const item = occurrences.find((item) => item.start === start);
          if (!item || !onCitation) return <span>{children}</span>;
          return (
            <button
              type="button"
              className={`answer-citation${item.error ? " invalid" : ""}`}
              aria-label={`${item.label}，${item.error ? "无法定位" : "查看引用文字"}`}
              title={item.error ?? "查看本次发给模型的文字"}
              onClick={() => onCitation(item)}
            >
              {children}
            </button>
          );
        },
        a: ({ href, children }) =>
          href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ) : (
            <span>{children}</span>
          ),
        // Documents and model output cannot silently fetch remote images.
        img: ({ alt }) => (
          <span className="markdown-image">[图片：{alt || "未提供说明"}]</span>
        ),
        table: ({ children }) => (
          <div className="markdown-table-scroll">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {content}
    </Markdown>
  );
});
