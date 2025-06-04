import React, { useState, useEffect, useRef } from "react";
import "../styles/FloorPlans.css";

const FloorPlans = ({ plans, onExit }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [floorPlans, setFloorPlans] = useState([]);
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

  useEffect(() => {
    if (plans && plans.list) {
      const plansList = Array.from(plans.list).map(([id, plan]) => ({
        id,
        name: plan.name || `Floor Plan ${id}`,
      }));
      setFloorPlans(plansList);
    }
  }, [plans]);

  const handlePlanClick = async (planId) => {
    try {
      await plans.goTo(planId);
      console.log(`Navigated to floor plan: ${planId}`);
    } catch (error) {
      console.error("Error navigating to floor plan:", error);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="floor-plans">
      <button
        className="phone-menu-toggler"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        ☰
      </button>
      <div
        ref={panelRef}
        className={`floor-plans-content ${
          isMobileMenuOpen ? "options-menu-visible" : ""
        }`}
      >
        <h2 className="panel-title">Floor Plans</h2>
        <div className="panel-section">
          <p>💡 Click a floor plan to navigate to it.</p>
        </div>
        <div className="panel-section">
          <h3>Available Floor Plans</h3>
          {floorPlans.length > 0 ? (
            <ul className="floor-plan-list">
              {floorPlans.map((plan) => (
                <li
                  key={plan.id}
                  className="floor-plan-item"
                  onClick={() => handlePlanClick(plan.id)}
                >
                  {plan.name}
                </li>
              ))}
            </ul>
          ) : (
            <p>No floor plans available.</p>
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

export default FloorPlans;
