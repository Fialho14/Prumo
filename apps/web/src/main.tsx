import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { initialiseTheme } from "./components/theme-toggle";
import "./styles.css";

initialiseTheme();

const root = document.getElementById("root");
if (!root) throw new Error("Prumo could not find its application root.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
