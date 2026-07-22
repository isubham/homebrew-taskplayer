import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext.jsx";

const TOUR_STEPS = [
  {
    target: "#tbhome",
    title: "Home",
    content: "Return to your main dashboard to see an overview of your active tasks."
  },
  {
    target: "#topbarSearchWrap",
    title: "Search",
    content: "Quickly find any task or list across your entire workspace."
  },
  {
    target: "[data-tour-id='sidebar-lists']",
    title: "Life Areas",
    content: "Here are your life areas. We've created one based on your focus."
  },
  {
    target: "[data-tour-id='add-list-btn']",
    title: "Add Lists",
    content: "Create more lists to categorize your tasks naturally without overthinking."
  },
  {
    target: "[data-tour-id='planner-nav']",
    title: "Planner",
    content: "Plan your days by making time physical."
  },
  {
    target: "[data-tour-id='insights-nav']",
    title: "Insights",
    content: "Track your progress. Remember, no permanent negative records here."
  },
  {
    target: "#topbarIcons",
    title: "Settings",
    content: "Configure your preferences, manage data, or restart the guide from here."
  }
];

export function TourOverlay() {
  const { actions } = useApp();
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  
  const step = TOUR_STEPS[stepIndex];

  useEffect(() => {
    const updateRect = () => {
      const el = document.querySelector(step.target);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        });
      }
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    // Slight delay to allow UI to settle if there's an animation
    const timeout = setTimeout(updateRect, 300);
    
    return () => {
      window.removeEventListener("resize", updateRect);
      clearTimeout(timeout);
    };
  }, [step.target]);

  const handleNext = () => {
    if (stepIndex === TOUR_STEPS.length - 1) {
      actions.setHasCompletedTour(true);
    } else {
      setStepIndex(i => i + 1);
    }
  };

  const handleSkip = () => {
    actions.setHasCompletedTour(true);
  };

  if (!targetRect) return null;

  // Calculate tooltip position (right of target by default)
  let tooltipTop = targetRect.top;
  let tooltipLeft = targetRect.left + targetRect.width + 16;
  
  // Basic bounds checking for the tooltip (width is ~280px)
  if (tooltipLeft + 300 > window.innerWidth) {
    // If it overflows on the right, render it on the left side of the target
    tooltipLeft = targetRect.left - 280 - 16;
    
    // Fallback if it now overflows on the left
    if (tooltipLeft < 16) {
      tooltipLeft = window.innerWidth - 300;
      tooltipTop = targetRect.top + targetRect.height + 16; // Push below target
    }
  }

  return (
    <div className="tour-overlay-container">
      {/* Background Mask */}
      <div 
        className="tour-mask"
        style={{
          clipPath: `polygon(
            0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%,
            ${targetRect.left - 4}px ${targetRect.top - 4}px,
            ${targetRect.left + targetRect.width + 4}px ${targetRect.top - 4}px,
            ${targetRect.left + targetRect.width + 4}px ${targetRect.top + targetRect.height + 4}px,
            ${targetRect.left - 4}px ${targetRect.top + targetRect.height + 4}px,
            ${targetRect.left - 4}px ${targetRect.top - 4}px
          )`
        }}
      />
      
      {/* Target Highlight Ring */}
      <div 
        className="tour-highlight"
        style={{
          top: targetRect.top - 6,
          left: targetRect.left - 6,
          width: targetRect.width + 12,
          height: targetRect.height + 12
        }}
      />

      {/* Tooltip */}
      <div 
        className="tour-tooltip"
        style={{
          top: tooltipTop,
          left: tooltipLeft,
        }}
      >
        <h3>{step.title}</h3>
        <p>{step.content}</p>
        <div className="tour-actions">
          <span className="dim">{stepIndex + 1} of {TOUR_STEPS.length}</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn" onClick={handleSkip}>Skip</button>
            <button className="btn primary" onClick={handleNext}>
              {stepIndex === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
