/** Purpose: adds AI and deterministic offline writing assistance to Strategy Studio. Connects: plain English, FastAPI, source compiler, and editor store. */
import { useState } from "react";
import { compileSource } from "@algotrace/compiler";
import { generateAndCheck, AssistantRequestError, type AssistantPhase, type AssistantState } from "./assistantClient.js";
import { findOfflineExample, OFFLINE_EXAMPLES } from "./offlineExamples.js";
import { useStudioEditorStore } from "./store.js";
import "./assistant.css";

const SENTENCE_EXAMPLES = OFFLINE_EXAMPLES.slice(0, 4);
type AssistantConfig = Readonly<Record<string, unknown>>;

interface AssistantPanelProps {
  readonly source: string;
  readonly config: AssistantConfig;
  readonly endpoint: string;
}

/** Lets a student request, inspect, repair, or undo generated code without starting a backtest. @example a sentence creates code only after passing compileSource. */
export function AssistantPanel({ source, config, endpoint }: AssistantPanelProps): React.JSX.Element {
  const applyAssistantCode = useStudioEditorStore((state) => state.applyAssistantCode);
  const assistantPreviousSource = useStudioEditorStore((state) => state.assistantPreviousSource);
  const undoAssistantChange = useStudioEditorStore((state) => state.undoAssistantChange);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<AssistantPhase | "idle">("idle");
  const [message, setMessage] = useState("");
  const [question, setQuestion] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [offlineMode, setOfflineMode] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Starts the real provider loop or the fixed local demo, without invoking the backtest worker. @example clicking Write the code fills the editor and checks it. */
  async function writeCode(): Promise<void> {
    setQuestion(""); setErrors([]); setMessage("");
    if (offlineMode) { writeOfflineCode(); return; }
    if (text.trim() === "") { setPhase("failed"); setMessage("Write one sentence describing what you want the strategy to do."); return; }
    setBusy(true);
    try {
      const result = await generateAndCheck({
        text,
        previousCode: source,
        endpoint,
        compile: (code) => {
          const compiled = compileSource(code, config);
          return compiled.ok ? { ok: true } : { ok: false, errors: compiled.errors.map((error) => ({
            ...(typeof error.line === "number" ? { line: error.line } : {}),
            ...(typeof error.column === "number" ? { column: error.column } : {}),
            message: error.message,
          })) };
        },
        onCode: (code) => applyAssistantCode(code, source),
        onState: updatePhase,
      });
      if (result.kind === "question") {
        setQuestion(result.question); setPhase("done"); setMessage("The assistant needs one detail before it can write the strategy.");
      } else if (result.kind === "valid") {
        setPhase("done"); setMessage("Checked by the compiler: valid");
      } else {
        const firstIssue = result.errors[0];
        setPhase("failed");
        setMessage(firstIssue
          ? `The code failed the compiler check after 2 repair attempts: ${formatIssue(firstIssue)}`
          : "The code failed the compiler check after 2 repair attempts. Edit it and try again.");
        setErrors(result.errors.slice(1).map(formatIssue));
      }
    } catch (error) {
      setPhase("failed");
      setMessage(error instanceof AssistantRequestError
        ? `${error.message} The Examples dropdown and Offline demo mode are still available.`
        : "The reply could not be read. The Examples dropdown and Offline demo mode are still available.");
    } finally { setBusy(false); }
  }

  /** Turns request-loop states into beginner-readable progress text. @example a second repair reports “attempt 2 of 2”. */
  function updatePhase(state: AssistantState): void {
    setPhase(state.phase);
    if (state.phase === "thinking") setMessage("Thinking about your request…");
    else if (state.phase === "checking") setMessage("Checking the code with the compiler…");
    else if (state.phase === "fixing") setMessage(`Fixing code (attempt ${state.repairAttempt ?? 1} of 2)…`);
  }

  /** Applies one exact built-in sample and still checks it with the production compiler. @example the offline crossover sentence fills the editor with SMA(10)/SMA(30). */
  function writeOfflineCode(): void {
    const example = findOfflineExample(text);
    if (!example) {
      setPhase("failed"); setMessage("Offline demo supports only its five fixed sample sentences. Choose a sentence below or type one exactly."); return;
    }
    const compiled = compileSource(example.code, config);
    applyAssistantCode(example.code, source);
    if (!compiled.ok) {
      setPhase("failed"); setMessage("A built-in example did not pass the compiler. Please choose another example.");
      setErrors(compiled.errors.map(formatIssue)); return;
    }
    setPhase("done"); setMessage("From a built-in example, not from the AI. Checked by the compiler: valid");
    setQuestion(""); setErrors([]);
  }

  const stateText = phase === "idle" ? "Ready when you are" : phase === "thinking" ? "Thinking…" : phase === "checking" ? "Checking…" : phase === "fixing" ? message : phase === "done" ? "Done" : "Needs attention";

  return <section className="assistant-panel" aria-label="AI strategy assistant" data-testid="assistant-panel">
    <div className="assistant-heading"><div><h2>Assistant</h2><p>Describe the rules you want in plain English. Review the code before you run anything.</p></div><span data-testid="assistant-phase" aria-live="polite">{stateText}</span></div>
    <label className="assistant-prompt-label" htmlFor="assistant-request">Describe your strategy in plain English</label>
    <textarea id="assistant-request" aria-label="Describe your strategy in plain English" value={text} onChange={(event) => setText(event.currentTarget.value)} rows={2} disabled={busy} />
    <div className="assistant-examples" aria-label="Example requests">{SENTENCE_EXAMPLES.map((example) => <button type="button" key={example.id} onClick={() => setText(example.sentence)} disabled={busy}>{example.sentence}</button>)}</div>
    <div className="assistant-actions"><button type="button" className="assistant-write" onClick={() => void writeCode()} disabled={busy}>{busy ? "Please wait…" : "Write the code"}</button><button type="button" onClick={() => setOfflineMode((current) => !current)} disabled={busy}>{offlineMode ? "Turn off Offline demo mode" : "Offline demo mode"}</button>{assistantPreviousSource !== null && <button type="button" onClick={undoAssistantChange} disabled={busy}>Undo assistant change</button>}</div>
    <p className="assistant-privacy">Your sentence is sent to the AI provider (Groq). The backtest itself runs on your computer.</p>
    {offlineMode && <div className="offline-demo-banner" role="note"><strong>Offline demo: built-in answers for five sample sentences, no AI is used.</strong><p>Results from this mode are from a built-in example, not from the AI. Enter one of the five exact sentences; the first four appear above.</p><button type="button" onClick={() => setText(OFFLINE_EXAMPLES[4]?.sentence ?? "")} disabled={busy}>Load the fifth offline sample</button></div>}
    {message && <p className={`assistant-message phase-${phase}`} role={phase === "failed" ? "alert" : "status"} data-testid="assistant-message">{message}</p>}
    {question && <p className="assistant-question" role="status">{question}</p>}
    {errors.length > 0 && <ul className="assistant-errors" aria-label="Compiler messages">{errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>}
  </section>;
}

/** Adds the source location to compiler feedback before it is sent for repair or shown to the user. @example `{line:2,message:"Unknown name"}` reads `Line 2: Unknown name`. */
function formatIssue(issue: { readonly line?: number; readonly column?: number; readonly message: string }): string {
  return `${typeof issue.line === "number" ? `Line ${issue.line}${typeof issue.column === "number" ? `, column ${issue.column}` : ""}: ` : "Strategy: "}${issue.message}`;
}
