/**
 * Purpose: mounts the first AlgoTrace browser screen.
 * Connects: Vite's HTML entry point to the React application.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import { App } from "./App.js";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("The root element is missing from index.html.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

