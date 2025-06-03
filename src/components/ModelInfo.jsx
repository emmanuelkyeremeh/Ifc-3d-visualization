import React, { useState, useEffect, useRef } from "react";
import "../styles/ModelInfo.css";

const ModelInfo = ({ selectedElement, onExit }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="model-info">
      <button
        className="phone-menu-toggler"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        ☰
      </button>
      <div
        ref={panelRef}
        className={`model-info-content ${
          isMobileMenuOpen ? "options-menu-visible" : ""
        }`}
      >
        <h2 className="panel-title">Model Information</h2>
        <div className="panel-section">
          <p>💡 Click any element in the viewer to see its name.</p>
        </div>
        <div className="panel-section">
          <h3>Selected Element</h3>
          {selectedElement ? (
            <p>Element Name: {selectedElement.name}</p>
          ) : (
            <p>💡 No element selected.</p>
          )}
        </div>
        <div className="panel-section">
          <button
            className="close-button"
            onClick={() => {
              setIsVisible(false);
              onExit();
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModelInfo;
