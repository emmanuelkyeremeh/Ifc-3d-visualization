import React, { useState } from "react";
import IfcViewer from "./components/IfcViewer";
import "./styles/App.css";

function App() {
  const [file, setFile] = useState(null);
  const [guid, setGuid] = useState("");

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleGuidChange = (event) => {
    setGuid(event.target.value);
  };

  return (
    <div className="app">
      <div className="container">
        <div className="input-group">
          <label className="upload-button">
            <span>Upload IFC File</span>
            <input
              type="file"
              accept=".ifc"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </label>
          <input
            type="text"
            placeholder="Enter GUID to highlight"
            value={guid}
            onChange={handleGuidChange}
            className="guid-input"
          />
        </div>
      </div>
      <h1 className="app-title">🏗️ IFC Viewer</h1>
      <IfcViewer ifcFile={file} guid={guid} />
    </div>
  );
}

export default App;
