import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { setupPwa } from "./pwa/register";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/shell.css";
import "./styles/plan.css";
import "./styles/setup.css";

setupPwa();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
