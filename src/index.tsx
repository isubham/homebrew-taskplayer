import React from "react";
import ReactDOM from "react-dom/client";
import { MusicProvider } from "./music.jsx";
import { AppProvider } from "./app/context/AppContext.jsx";
import { App } from "./app/App.jsx";

import { ErrorBoundary } from "./app/components/ErrorBoundary.jsx";

const container = document.getElementById("root");
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <ErrorBoundary>
      <MusicProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </MusicProvider>
    </ErrorBoundary>
  );
}
