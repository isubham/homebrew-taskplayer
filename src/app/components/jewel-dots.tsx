import React from "react";

export function JewelDots({ payout, areaColor }) {
  if (!payout) return null;
  return (
    <>
      {payout.amount < 0 ? <span className="jewel-sign">−</span> : null}
      {Array.from({ length: Math.abs(payout.amount) }, (_, i) => (
        <i
          key={i}
          className={`jewel-dot${payout.amount < 0 ? " neg" : ""}`}
          style={payout.amount > 0 && areaColor ? { background: areaColor } : undefined}
        />
      ))}
    </>
  );
}
