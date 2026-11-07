import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code({ className, children }) {
            const match = /language-([\w-]+)/.exec(className || "");
            const text = String(children).replace(/\n$/, "");
            if (!match && !text.includes("\n")) return <code className="md-inline-code">{children}</code>;
            return <CodeBlock code={text} language={match?.[1] ?? "text"} />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
