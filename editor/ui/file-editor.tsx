import MarkdownIt from "markdown-it";
import { useEffect, useState } from "react";

/** HTML written in a file is shown as text, never run: a template may come from anyone. */
const markdown = new MarkdownIt({ html: false });

/** A file's Markdown as a reader sees it, the settings at its top kept apart as they are written. */
function rendered(text: string): string {
  const front = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!front) return markdown.render(text);
  return `<pre>${markdown.utils.escapeHtml(front[1]!)}</pre>${markdown.render(text.slice(front[0].length))}`;
}

/** A file's text to write, and for Markdown how it reads; what was written is set when the person leaves it. */
export function FileEditor({ path, text, onSet }: { path: string; text: string; onSet: (text: string) => void }) {
  const [draft, setDraft] = useState(text);
  const [reading, setReading] = useState(false);
  // A change made elsewhere, such as an undo, is what the file now says.
  useEffect(() => {
    setDraft(text);
  }, [text]);
  const isMarkdown = path.endsWith(".md");
  return (
    <section className="file">
      <header>
        <p className="section">{path}</p>
        {isMarkdown ? (
          <div className="tabs">
            <button
              type="button"
              className={reading ? "" : "on"}
              onClick={() => {
                setReading(false);
              }}
            >
              Write
            </button>
            <button
              type="button"
              className={reading ? "on" : ""}
              onClick={() => {
                setReading(true);
              }}
            >
              Read
            </button>
          </div>
        ) : null}
      </header>
      {reading && isMarkdown ? (
        <div className="prose" dangerouslySetInnerHTML={{ __html: rendered(draft) }} />
      ) : (
        <textarea
          value={draft}
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={() => {
            if (draft !== text) onSet(draft);
          }}
        />
      )}
    </section>
  );
}
