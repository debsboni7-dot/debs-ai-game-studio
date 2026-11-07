import { useState } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { Check, Copy } from "lucide-react";

export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="overflow-hidden rounded-lg border bg-code">
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{language}</span>
        <button onClick={copy} className="flex items-center gap-1 rounded px-2 py-1 hover:bg-muted hover:text-foreground" aria-label="Copier le code">
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <Highlight code={code} language={language} theme={themes.vsDark}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="overflow-x-auto p-3 font-mono text-[0.8rem] leading-relaxed">
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })} style={undefined}>
                {line.map((token, k) => {
                  const p = getTokenProps({ token });
                  return <span key={k} className={p.className} style={{ color: p.style?.color }}>{p.children}</span>;
                })}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
