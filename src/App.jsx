import React, { useState } from "react";
import IfcViewer from "./components/IfcViewer";
import "./styles/App.css";

function App() {
  const [file, setFile] = useState(null);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  return (
    <div className="app">
      <div className="container">
        <label className="upload-button">
          <span>Upload IFC File</span>
          <input
            type="file"
            accept=".ifc"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </label>
      </div>
      <h1 className="app-title">🏗️ IFC Viewer</h1>
      <IfcViewer ifcFile={file} />
    </div>
  );
}

export default App;
