/** Purpose: runs the bounded AI-to-compiler repair loop. Connects: Studio requests to FastAPI and compileSource. */

export interface AssistantCompilerIssue { readonly line?: number; readonly column?: number; readonly message: string }
export type AssistantCompileResult = { readonly ok: true } | { readonly ok: false; readonly errors: readonly AssistantCompilerIssue[] };
export type AssistantPhase = "thinking" | "checking" | "fixing" | "done" | "failed";
export interface AssistantState { readonly phase: AssistantPhase; readonly repairAttempt?: number }
export interface AssistantLoopOptions {
  readonly text: string;
  readonly previousCode: string;
  readonly endpoint: string;
  readonly fetcher?: typeof fetch;
  readonly compile: (code: string) => AssistantCompileResult;
  readonly onCode: (code: string) => void;
  readonly onState?: (state: AssistantState) => void;
}
export type AssistantLoopResult =
  | { readonly kind: "valid"; readonly code: string }
  | { readonly kind: "invalid"; readonly code: string; readonly errors: readonly AssistantCompilerIssue[] }
  | { readonly kind: "question"; readonly question: string };

/** Distinguishes API/network failures from compiler errors so the panel can offer its offline examples. */
export class AssistantRequestError extends Error {
  public constructor(message: string, public readonly status: number | null) { super(message); this.name = "AssistantRequestError"; }
}

/** Requests source, compiles it, and makes at most two repair calls. @example invalid first code is sent back with its line messages once. */
export async function generateAndCheck(options: AssistantLoopOptions): Promise<AssistantLoopResult> {
  const fetcher = options.fetcher ?? fetch;
  let previousCode: string | undefined;
  let previousErrors: readonly string[] | undefined;
  for (let repairAttempt = 0; repairAttempt <= 2; repairAttempt += 1) {
    options.onState?.(repairAttempt === 0 ? { phase: "thinking" } : { phase: "fixing", repairAttempt });
    let response: Response;
    try {
      response = await fetcher(options.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: options.text, ...(previousCode === undefined ? {} : { previous_code: previousCode }), ...(previousErrors === undefined ? {} : { errors: previousErrors }) }),
      });
    } catch {
      throw new AssistantRequestError("Network blocked or the API could not be reached. Check that the local API is running and browser access is allowed.", null);
    }
    const payload = await readResponse(response);
    if (!response.ok) {
      const detail = isRecord(payload) && typeof payload.detail === "string" ? payload.detail : `The API returned an error (HTTP ${response.status}).`;
      throw new AssistantRequestError(detail, response.status);
    }
    if (!isRecord(payload)) throw new AssistantRequestError("The reply could not be read.", response.status);
    // FastAPI returns both nullable keys: the unused one is null. Missing and null
    // mean the same thing so the browser accepts both the current and older shape.
    if (typeof payload.code === "string" && payload.code.trim() !== "") {
      previousCode = payload.code;
      options.onCode(payload.code);
      options.onState?.({ phase: "checking" });
      const compiled = options.compile(payload.code);
      if (compiled.ok) {
        options.onState?.({ phase: "done" });
        return { kind: "valid", code: payload.code };
      }
      if (repairAttempt === 2) {
        options.onState?.({ phase: "failed" });
        return { kind: "invalid", code: payload.code, errors: compiled.errors };
      }
      previousErrors = compiled.errors.map(formatIssue);
      continue;
    }
    if (typeof payload.question === "string" && payload.question.trim() !== "") {
      options.onState?.({ phase: "done" });
      return { kind: "question", question: payload.question };
    }
    throw new AssistantRequestError("The reply could not be read.", response.status);
  }
  options.onState?.({ phase: "failed" });
  return { kind: "invalid", code: previousCode ?? options.previousCode, errors: [] };
}

/** Reads JSON without allowing malformed responses to escape as parser exceptions. @example a bad response body becomes an empty object for normal API handling. */
async function readResponse(response: Response): Promise<unknown> {
  try { return await response.json() as unknown; }
  catch { return null; }
}

/** Formats a compiler issue with its source line for the repair prompt. @example `{line:3,message:"Unknown name"}` becomes `Line 3: Unknown name`. */
function formatIssue(issue: AssistantCompilerIssue): string {
  const location = typeof issue.line === "number" ? `Line ${issue.line}${typeof issue.column === "number" ? `, column ${issue.column}` : ""}: ` : "Strategy: ";
  return `${location}${issue.message}`;
}

/** Narrows decoded response JSON before reading provider keys. @example `isRecord({code:"..."})` is true. */
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
