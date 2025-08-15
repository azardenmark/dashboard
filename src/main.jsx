import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";             // بدون .tsx
import "./index.css";
import { UsersProvider } from "./store/UsersContext"; // حسب اسم الملف الذي غيّرناه


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <UsersProvider>
        <App />
      </UsersProvider>
    </BrowserRouter>
  </React.StrictMode>
);
