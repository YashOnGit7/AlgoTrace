/** Purpose: switches between graph construction and the existing backtest demonstration. Connects: strategy editor and results demo without mixing their scopes. */
import { useState } from "react";
import { StrategyCanvas } from "./canvas/StrategyCanvas.js";
import { BacktestDemo } from "./BacktestDemo.js";
import "./workspace.css";

type WorkspaceView = "builder" | "backtest";

/** Makes the canvas the default workspace and keeps the earlier WASM example reachable. @example opening the app displays the strategy builder first. */
export function App(): React.JSX.Element {
  const [view, setView] = useState<WorkspaceView>("builder");
  return <div className="app-workspace">
    <nav className="workspace-nav" aria-label="AlgoTrace workspaces">
      <a href="#builder" className="workspace-brand" onClick={(event) => { event.preventDefault(); setView("builder"); }}>AlgoTrace</a>
      <div role="tablist" aria-label="Workspace">
        <button type="button" role="tab" aria-selected={view === "builder"} onClick={() => setView("builder")}>Strategy canvas</button>
        <button type="button" role="tab" aria-selected={view === "backtest"} onClick={() => setView("backtest")}>WASM demo</button>
      </div>
    </nav>
    {view === "builder" ? <StrategyCanvas /> : <BacktestDemo />}
  </div>;
}
