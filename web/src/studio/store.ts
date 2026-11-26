/** Purpose: stores the code-editor draft and source feedback. Connects: browser storage and the Strategy Studio editor. */
import { create } from "zustand";

export const STUDIO_CODE_KEY = "algotrace.strategy-studio.source.v1";
export interface EditorLocation { readonly line: number; readonly column: number }
export interface CodeStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface StudioEditorState {
  readonly source: string;
  readonly activeExample: string;
  readonly assistantPreviousSource: string | null;
  setSource(source: string): void;
  loadExample(name: string, source: string): void;
  applyAssistantCode(source: string, previousSource?: string): void;
  undoAssistantChange(): void;
}

/** Creates a small editor store and remembers source in the supplied browser storage. @example `createStudioEditorStore(memoryStorage).getState().source` starts with the saved text. */
export function createStudioEditorStore(storage?: CodeStorage) {
  const availableStorage = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const initialSource = availableStorage?.getItem(STUDIO_CODE_KEY) ?? blankTemplate;
  return create<StudioEditorState>((set) => ({
    source: initialSource,
    activeExample: "blank",
    assistantPreviousSource: null,
    setSource: (source) => {
      availableStorage?.setItem(STUDIO_CODE_KEY, source);
      set({ source, activeExample: "custom" });
    },
    loadExample: (name, source) => {
      availableStorage?.setItem(STUDIO_CODE_KEY, source);
      set({ source, activeExample: name, assistantPreviousSource: null });
    },
    applyAssistantCode: (source, previousSource) => {
      set((state) => {
        availableStorage?.setItem(STUDIO_CODE_KEY, source);
        return { source, activeExample: "assistant", assistantPreviousSource: previousSource ?? state.assistantPreviousSource ?? state.source };
      });
    },
    undoAssistantChange: () => set((state) => {
      if (state.assistantPreviousSource === null) return state;
      availableStorage?.setItem(STUDIO_CODE_KEY, state.assistantPreviousSource);
      return { source: state.assistantPreviousSource, activeExample: "custom", assistantPreviousSource: null };
    }),
  }));
}

/** Supplies the friendly location attached to a compiler message when it exists. @example `locationForError({line:4,column:7})` returns `{line:4,column:7}`. */
export function locationForError(error: { readonly line?: number; readonly column?: number; readonly startColumn?: number }): EditorLocation | null {
  if (typeof error.line !== "number" || !Number.isFinite(error.line)) return null;
  const column = error.column ?? error.startColumn ?? 1;
  return { line: error.line, column: Number.isFinite(column) ? column : 1 };
}

const blankTemplate = "# Write one statement on each line.\n# Assign values before using them.\nbuy when close > 0\nsell when close < 0\n";

/** Exposes one persistent editor store for the mounted application. @example `useStudioEditorStore((state) => state.source)` reads the draft. */
export const useStudioEditorStore = createStudioEditorStore();
