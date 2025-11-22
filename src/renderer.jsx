import React from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { createRoot } from 'react-dom/client';

import NotesPage from "./pages/notes";
import HomePage from "./pages/home";

import Navigation from './components/Navigationbar';

const App =() =>{
 
  return (
    <Router>
      <Navigation/>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/notes" element={<NotesPage />} />
      </Routes>
    </Router>
  );
}

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<App/>);