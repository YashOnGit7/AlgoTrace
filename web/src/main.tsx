/**
 * Purpose: mounts the first AlgoTrace browser screen.
 * Connects: Vite's HTML entry point to the React application.
 */
import React from "react";
import { createRoot } from "react-dom/client";

/**
 * Displays the current scaffold state while project features are added phase by phase.
 * Example: rendering `<App />` shows the AlgoTrace heading and scaffold note.
 */
function App(): React.JSX.Element {
  return (
    <main>
      <h1>AlgoTrace</h1>
      <p>The project scaffold is ready for the compiler and engine phases.</p>
    </main>
  );
}

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("The root element is missing from index.html.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

