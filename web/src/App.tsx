/** Purpose: switches between the code-first Studio, advanced canvas, and existing quick demo. Connects: the three strategy workflows through simple tabs. */
import { useState } from "react";
import { StrategyStudio } from "./studio/StrategyStudio.js";
import { StrategyCanvas } from "./canvas/StrategyCanvas.js";
import { BacktestDemo } from "./BacktestDemo.js";
import "./workspace.css";

type WorkspaceView = "studio" | "builder" | "backtest";

/** Makes Strategy Studio the default workspace and keeps the canvas and quick demo reachable. @example opening the app displays the code editor first. */
export function App(): React.JSX.Element {
  const [view, setView] = useState<WorkspaceView>("studio");
  return <div className="app-workspace">
    <nav className="workspace-nav" aria-label="AlgoTrace workspaces">
      <a href="#studio" className="workspace-brand" onClick={(event) => { event.preventDefault(); setView("studio"); }}>AlgoTrace</a>
      <div role="tablist" aria-label="Workspace">
        <button type="button" role="tab" aria-selected={view === "studio"} onClick={() => setView("studio")}>Strategy Studio</button>
        <button type="button" role="tab" aria-selected={view === "builder"} onClick={() => setView("builder")}>Visual canvas (advanced)</button>
        <button type="button" role="tab" aria-selected={view === "backtest"} onClick={() => setView("backtest")}>Quick demo</button>
      </div>
    </nav>
    {view === "studio" ? <StrategyStudio /> : view === "builder" ? <StrategyCanvas /> : <BacktestDemo />}
  </div>;
}
