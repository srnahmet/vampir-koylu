import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/nunito";
import "@fontsource-variable/pixelify-sans";
import App from "./App";
import "./style.css";
const root = createRoot(document.getElementById("root")!);
if (
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has("sahneler")
) {
  void import("./ScenePreview").then(({ default: ScenePreview }) =>
    root.render(<ScenePreview />),
  );
} else
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
