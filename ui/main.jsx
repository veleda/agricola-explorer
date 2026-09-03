import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app.jsx";
import { AuthProvider } from "./auth.jsx";

createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
