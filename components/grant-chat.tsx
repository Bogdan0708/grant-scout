"use client";

import { useChat } from "@ai-sdk/react";
import { FormEvent, useMemo, useState } from "react";

const EXAMPLES = [
  "Which programmes could fit a Romanian SME building public-sector AI?",
  "Could a UK university join a Horizon Europe consortium?",
  "Find climate funding for a city authority, with deadlines.",
];

type ToolPart = {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

type SourceMatch = {
  id: string;
  title: string;
  programme: string;
  summary: string;
  budgetLabel: string;
  deadlineLabel: string;
  source: { label: string; url: string };
  similarity: number;
};

function isToolPart(part: { type: string }): part is typeof part & ToolPart {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

function toolName(part: ToolPart) {
  return part.type === "dynamic-tool"
    ? "tool"
    : part.type.replace(/^tool-/, "");
}

function outputMatches(output: unknown): SourceMatch[] {
  if (!output || typeof output !== "object" || !("matches" in output)) return [];
  const matches = (output as { matches?: unknown }).matches;
  return Array.isArray(matches) ? (matches as SourceMatch[]) : [];
}

function ToolTrace({ part }: { part: ToolPart }) {
  const name = toolName(part);
  const done = part.state === "output-available";
  const failed = part.state === "output-error";
  const matches = outputMatches(part.output);

  return (
    <div className={`tool-trace ${done ? "is-done" : ""} ${failed ? "is-error" : ""}`}>
      <div className="tool-trace-head">
        <span className="tool-icon" aria-hidden="true">{done ? "✓" : failed ? "!" : "↻"}</span>
        <span>{name === "searchCalls" ? "Searching funding snapshot" : name === "checkEligibility" ? "Checking eligibility rules" : "Running tool"}</span>
        <code>{name}</code>
      </div>
      {matches.length > 0 && (
        <div className="source-grid">
          {matches.map((match) => (
            <a className="source-card" href={match.source.url} key={match.id} target="_blank" rel="noreferrer">
              <div className="source-card-meta"><span>{match.programme}</span><code>{match.id}</code></div>
              <strong>{match.title}</strong>
              <p>{match.summary}</p>
              <div className="source-card-foot"><span>{match.deadlineLabel}</span><span>Official source ↗</span></div>
            </a>
          ))}
        </div>
      )}
      {failed && <p className="tool-error">{part.errorText ?? "The tool could not complete."}</p>}
    </div>
  );
}

export function GrantChat() {
  const [input, setInput] = useState("");
  const [friendlyError, setFriendlyError] = useState<string | null>(null);
  const { messages, sendMessage, status, stop } = useChat({
    onError: (error) => {
      const message = error.message.includes("429")
        ? "The public demo has reached its request limit. Please try again shortly."
        : "The model is temporarily unavailable. The corpus and source links are still visible in the repository.";
      setFriendlyError(message);
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;
  const canSend = input.trim().length > 0 && !busy;
  const title = useMemo(() => hasMessages ? "Evidence thread" : "Start with a real funding question", [hasMessages]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    const text = input.trim();
    setInput("");
    setFriendlyError(null);
    await sendMessage({ text });
  }

  async function sendExample(example: string) {
    if (busy) return;
    setFriendlyError(null);
    await sendMessage({ text: example });
  }

  return (
    <div className="chat-panel">
      <div className="chat-topbar">
        <div>
          <span className="section-kicker">Live agent</span>
          <h2>{title}</h2>
        </div>
        <div className="live-badge"><span /> streaming tools</div>
      </div>

      <div className={`messages ${hasMessages ? "has-messages" : ""}`} aria-live="polite">
        {!hasMessages && (
          <div className="empty-state">
            <div className="radar" aria-hidden="true"><span /><span /><span /></div>
            <p>Try a project, organisation, or location. Grant Scout will show what it searched before it answers.</p>
            <div className="example-list">
              {EXAMPLES.map((example) => (
                <button type="button" key={example} onClick={() => sendExample(example)}>
                  <span>{example}</span><b aria-hidden="true">↗</b>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <article className={`message message-${message.role}`} key={message.id}>
            <div className="message-label">{message.role === "user" ? "You" : "Grant Scout"}</div>
            <div className="message-body">
              {message.parts.map((part, index) => {
                if (part.type === "text") {
                  return <div className="answer-text" key={`${message.id}-${index}`}>{part.text}</div>;
                }
                if (isToolPart(part)) {
                  return <ToolTrace key={`${message.id}-${index}`} part={part} />;
                }
                return null;
              })}
            </div>
          </article>
        ))}

        {busy && status === "submitted" && (
          <div className="thinking"><span /><span /><span /> Preparing evidence search</div>
        )}
        {friendlyError && <div className="friendly-error" role="alert">{friendlyError}</div>}
      </div>

      <form className="composer" onSubmit={submit}>
        <label htmlFor="grant-question">Ask about funding fit, eligibility, budgets, or deadlines</label>
        <div className="composer-row">
          <textarea
            id="grant-question"
            value={input}
            maxLength={1200}
            rows={2}
            placeholder="Describe your organisation and project…"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          {busy ? (
            <button className="send-button stop" type="button" onClick={stop}>Stop</button>
          ) : (
            <button className="send-button" type="submit" disabled={!canSend} aria-label="Send question">Ask <span>↗</span></button>
          )}
        </div>
        <div className="composer-note"><span>↵ send · shift ↵ newline</span><span>{input.length}/1200</span></div>
      </form>
    </div>
  );
}
