import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/app.tsx";
import "@fontsource-variable/red-hat-display";
import "@fontsource-variable/red-hat-mono";
import "@fontsource-variable/red-hat-text";
import "@xyflow/react/dist/style.css";
import "./ui/editor.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
