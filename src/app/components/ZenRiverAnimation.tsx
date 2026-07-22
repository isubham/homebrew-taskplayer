import React from "react";
import { motion } from "motion/react";

interface LeafConfig {
  id: number;
  x: number[];
  y: number[];
  rotate: number[];
  duration: number;
  delay: number;
}

const LEAVES: LeafConfig[] = [
  {
    id: 1,
    x: [160, 210, 190, 250, 220, 290, 260, 320],
    y: [140, 190, 240, 290, 340, 390, 440, 475],
    rotate: [0, 140, 280, 420, 560, 700, 840, 980],
    duration: 10,
    delay: 0
  },
  {
    id: 2,
    x: [220, 270, 240, 310, 270, 340, 300, 370],
    y: [120, 170, 220, 270, 320, 370, 420, 465],
    rotate: [45, 195, 345, 495, 645, 795, 945, 1095],
    duration: 12,
    delay: 2.5
  },
  {
    id: 3,
    x: [130, 180, 150, 210, 180, 250, 210, 270],
    y: [180, 230, 280, 330, 380, 430, 460, 480],
    rotate: [90, 240, 390, 540, 690, 840, 990, 1140],
    duration: 9,
    delay: 4.5
  },
  {
    id: 4,
    x: [180, 150, 200, 170, 230, 200, 260, 300],
    y: [150, 200, 250, 300, 350, 400, 445, 475],
    rotate: [0, -100, -200, -300, -400, -500, -600, -700],
    duration: 11,
    delay: 1.2
  },
  {
    id: 5,
    x: [250, 290, 270, 330, 300, 360, 330, 390],
    y: [130, 180, 230, 280, 330, 380, 430, 460],
    rotate: [30, 170, 310, 450, 590, 730, 870, 1010],
    duration: 13,
    delay: 6
  }
];

export function ZenRiverAnimation() {
  return (
    <div style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1, overflow: "hidden" }}>
      <svg
        viewBox="0 0 500 500"
        preserveAspectRatio="xMidYMid slice"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          background: "#093028",
          overflow: "hidden"
        }}
      >
        <defs>
          {/* Calm Teal Sky Gradient */}
          <linearGradient id="animeSun" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#3dbfac" />
          </linearGradient>

          {/* Sun background glow */}
          <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(61, 191, 172, 0.25)" />
            <stop offset="100%" stopColor="rgba(61, 191, 172, 0)" />
          </radialGradient>

          {/* Gradients for the tree canopy */}
          <linearGradient id="leafGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3dbfac" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#2f9e8f" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="leafGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2f9e8f" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#165a50" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="leafGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a8ff78" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#3dbfac" stopOpacity="0.85" />
          </linearGradient>

          {/* Gradient for trunk */}
          <linearGradient id="trunkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.25)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.05)" />
          </linearGradient>

          {/* Gradient for ground/bank */}
          <linearGradient id="groundGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(35, 122, 87, 0.55)" />
            <stop offset="100%" stopColor="rgba(9, 48, 40, 0.75)" />
          </linearGradient>

          {/* Gradient for wooden bench */}
          <linearGradient id="benchGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.35)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.15)" />
          </linearGradient>

          {/* Gradients for river waves */}
          <linearGradient id="riverGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(168, 255, 120, 0.15)" />
            <stop offset="50%" stopColor="rgba(35, 122, 87, 0.25)" />
            <stop offset="100%" stopColor="rgba(168, 255, 120, 0.15)" />
          </linearGradient>
          <linearGradient id="riverGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(35, 122, 87, 0.2)" />
            <stop offset="50%" stopColor="rgba(11, 72, 50, 0.3)" />
            <stop offset="100%" stopColor="rgba(35, 122, 87, 0.2)" />
          </linearGradient>

          {/* Person silhouette gradient */}
          <linearGradient id="personGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#3dbfac" />
          </linearGradient>

          {/* Falling leaf (Momiji) gradient */}
          <linearGradient id="momijiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a8ff78" />
            <stop offset="100%" stopColor="#3dbfac" />
          </linearGradient>

          {/* Light ray gradient */}
          <linearGradient id="rayGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(61, 191, 172, 0.12)" />
            <stop offset="100%" stopColor="rgba(61, 191, 172, 0)" />
          </linearGradient>
        </defs>

        {/* Dynamic Light Rays */}
        <polygon points="340,240 500,0 500,100" fill="url(#rayGrad)" />
        <polygon points="340,240 500,180 450,280" fill="url(#rayGrad)" />
        <polygon points="340,240 200,100 250,50" fill="url(#rayGrad)" />

        {/* Glowing Soft Sun */}
        <circle cx="340" cy="240" r="105" fill="url(#sunGlow)" />
        <circle cx="340" cy="240" r="85" fill="url(#animeSun)" />

        {/* Drifting Parallax Anime Mist/Clouds */}
        <motion.path
          d="M -50,180 C -30,165 0,165 20,180 C 40,165 70,165 90,180 C 110,165 140,165 160,180 C 180,180 190,195 180,210 L -50,210 Z"
          fill="rgba(255, 255, 255, 0.08)"
          animate={{ x: [-150, 450] }}
          transition={{ duration: 55, repeat: Infinity, ease: "linear" }}
        />
        <motion.path
          d="M -30,220 C -10,210 20,210 40,220 C 60,210 90,210 110,220 C 130,220 140,230 130,240 L -30,240 Z"
          fill="rgba(255, 255, 255, 0.05)"
          animate={{ x: [-100, 500] }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        />

        {/* Distant mountains/hills */}
        <path d="M 0,380 Q 150,335 300,390 T 500,360 L 500,500 L 0,500 Z" fill="rgba(255, 255, 255, 0.03)" />
        <path d="M 0,405 Q 200,375 350,415 T 500,395 L 500,500 L 0,500 Z" fill="rgba(255, 255, 255, 0.05)" />

        {/* River Base & Waves */}
        <path d="M 210,455 L 520,455 L 520,510 L 210,510 Z" fill="rgba(35, 122, 87, 0.15)" />
        
        <motion.path
          d="M 190,460 C 280,442 350,478 510,452 L 510,510 L 190,510 Z"
          fill="url(#riverGrad1)"
          animate={{
            d: [
              "M 190,460 C 280,442 350,478 510,452 L 510,510 L 190,510 Z",
              "M 190,468 C 290,458 340,468 510,462 L 510,510 L 190,510 Z",
              "M 190,460 C 280,442 350,478 510,452 L 510,510 L 190,510 Z"
            ]
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        
        <motion.path
          d="M 205,475 C 290,488 380,452 510,472 L 510,510 L 205,510 Z"
          fill="url(#riverGrad2)"
          animate={{
            d: [
              "M 205,475 C 290,488 380,452 510,472 L 510,510 L 205,510 Z",
              "M 205,465 C 300,462 370,482 510,468 L 510,510 L 205,510 Z",
              "M 205,475 C 290,488 380,452 510,472 L 510,510 L 205,510 Z"
          ]
        }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Grassy land/bank where tree and bench sit */}
      <path d="M -20,505 L 245,505 C 225,485 195,445 145,445 C 85,445 35,465 -20,475 Z" fill="url(#groundGrad)" />

      {/* Tree trunk & branches with a very subtle breathing sway */}
      <motion.path
        d="M 60,460 C 70,380 60,260 110,180 C 130,150 170,120 220,110 C 180,130 150,160 135,200 C 95,300 100,380 90,460 Z"
        fill="url(#trunkGrad)"
        animate={{ rotate: [0, 0.4, -0.4, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "60px 460px" }}
      />
      <motion.path
        d="M 120,200 C 170,170 230,160 280,180 C 240,195 180,205 145,215 Z"
        fill="url(#trunkGrad)"
        animate={{ rotate: [0, 0.5, -0.5, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "120px 200px" }}
      />
      <motion.path
        d="M 110,240 C 150,230 190,240 220,270 C 180,260 150,260 130,260 Z"
        fill="url(#trunkGrad)"
        animate={{ rotate: [0, 0.5, -0.5, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "110px 240px" }}
      />

      {/* Breathing Maple Tree Canopy (Teal/Green/Mint Momiji colors) */}
      <motion.g
        animate={{ scale: [1, 1.025, 1], rotate: [0, 0.6, -0.6, 0] }}
        transition={{ duration: 9, ease: "easeInOut", repeat: Infinity }}
        style={{ transformOrigin: "110px 180px" }}
      >
        <circle cx="110" cy="160" r="45" fill="url(#leafGrad1)" />
        <circle cx="160" cy="130" r="55" fill="url(#leafGrad2)" />
        <circle cx="220" cy="140" r="45" fill="url(#leafGrad3)" />
        <circle cx="130" cy="200" r="35" fill="url(#leafGrad1)" />
        <circle cx="190" cy="190" r="45" fill="url(#leafGrad2)" />
        <circle cx="255" cy="170" r="32" fill="url(#leafGrad3)" />
      </motion.g>

      {/* Rustic Wooden Bench */}
      <g>
        {/* Support lines */}
        <line x1="116" y1="416" x2="116" y2="445" stroke="rgba(255,255,255,0.18)" strokeWidth="3" />
        <line x1="172" y1="418" x2="172" y2="445" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
        {/* Backrest */}
        <rect x="110" y="414" width="68" height="8" rx="1.5" fill="url(#benchGrad)" transform="rotate(-5, 110, 414)" />
        {/* Bench seat */}
        <rect x="112" y="437" width="72" height="6" rx="1" fill="url(#benchGrad)" />
        {/* Legs */}
        <line x1="120" y1="443" x2="120" y2="455" stroke="rgba(255,255,255,0.2)" strokeWidth="3.2" />
        <line x1="178" y1="443" x2="178" y2="455" stroke="rgba(255,255,255,0.15)" strokeWidth="3.2" />
      </g>

      {/* Detailed Silhouette Profile of Person Writing / Journaling */}
      {/* Grouped for a slow breathing cycle (gently moving vertically) */}
      <motion.g
        animate={{ y: [0, -0.7, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Main Body (torso + legs + head profile + notebook) */}
        <path
          d="M 118,445 
             C 118,420 120,400 126,390 
             C 128,387 129,385 128,382 
             C 125,377 125,368 130,364 
             C 134,360 140,362 143,368 
             C 144,370 145,372 144,374 
             C 146,375 147,376 145,377 
             C 143,378 144,380 141,382 
             C 138,384 136,387 135,390 
             C 137,395 140,400 141,408 
             C 142,416 143,424 146,432 
             C 149,440 153,443 160,443 
             C 163,443 164,446 160,447 
             C 153,449 133,449 126,448 
             C 123,449 121,450 118,445 Z"
          fill="url(#personGrad)"
        />
        {/* Notebook/Journal shape */}
        <path
          d="M 148,422 L 158,416 L 163,423 L 152,428 Z"
          fill="#ffffff"
          opacity="0.9"
        />
        {/* Pen line */}
        <line x1="147" y1="416" x2="151" y2="421" stroke="#ffffff" strokeWidth="1.2" />
      </motion.g>

      {/* Overlapping Arm - Rotates slightly to simulate hand writing */}
      <motion.path
        d="M 130,394 
           C 133,394 136,396 136,400 
           C 138,408 141,418 146,426 
           C 148,428 151,430 154,430 
           C 157,430 158,432 155,433 
           C 149,435 143,428 140,420 
           C 137,412 134,402 130,398 Z"
        stroke="#093028"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="url(#personGrad)"
        animate={{ rotate: [0, 4, -2, 3, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "130px 394px" }}
      />

      {/* Mini Hourglass resting on the bench (Physical Time) */}
      <g transform="translate(172, 421)">
        {/* Glass Frame Plates */}
        <rect x="-1" y="-1" width="10" height="2" rx="0.5" fill="#3dbfac" />
        <rect x="-1" y="15" width="10" height="2" rx="0.5" fill="#3dbfac" />
        {/* Sides */}
        <line x1="0" y1="1" x2="0" y2="15" stroke="#3dbfac" strokeWidth="0.8" opacity="0.6" />
        <line x1="8" y1="1" x2="8" y2="15" stroke="#3dbfac" strokeWidth="0.8" opacity="0.6" />
        
        {/* Glass outline */}
        <path d="M 1,1 C 1,5 3,7 4,8 C 3,9 1,11 1,15" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
        <path d="M 7,1 C 7,5 5,7 4,8 C 5,9 7,11 7,15" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />

        {/* Top Sand: Shrinks/empties (scaleY -> 0) */}
        <motion.path
          d="M 1.5,1 C 1.5,4.5 3.5,6.5 4,7.5 C 4.5,6.5 6.5,4.5 6.5,1 Z"
          fill="url(#momijiGrad)"
          style={{ transformOrigin: "4px 7.5px" }}
          animate={{ scaleY: [1, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        />

        {/* Bottom Sand: Fills up (scaleY -> 1) */}
        <motion.path
          d="M 1.5,15 C 1.5,11.5 3.5,9.5 4,8.5 C 4.5,9.5 6.5,11.5 6.5,15 Z"
          fill="url(#momijiGrad)"
          style={{ transformOrigin: "4px 15px" }}
          animate={{ scaleY: [0, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        />

        {/* Falling Sand Trickle Dash Offset animation */}
        <motion.line
          x1="4" y1="7.5" x2="4" y2="13.5"
          stroke="#a8ff78"
          strokeWidth="0.8"
          strokeDasharray="1.5 3"
          animate={{ strokeDashoffset: [0, -4.5] }}
          transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
        />
      </g>

      {/* Cascading Falling Leaves */}
      {LEAVES.map((leaf) => (
        <motion.path
          key={leaf.id}
          // Detailed 5-pointed Momiji maple leaf shape
          d="M 0,-8 C 1.5,-11 4,-7 6.5,-7 C 8,-10.5 10,-5 8,-3 C 10,-1.5 8,1.5 5.5,0.7 C 4.5,4.5 1.5,4.5 0,7.5 C -1.5,4.5 -4.5,4.5 -5.5,0.7 C -8,1.5 -10,-1.5 -8,-3 C -10,-5 -8,-10.5 -6.5,-7 C -4,-7 -1.5,-11 0,-8 Z"
          fill="url(#momijiGrad)"
          style={{ transformOrigin: "center" }}
          animate={{
            x: leaf.x,
            y: leaf.y,
            rotate: leaf.rotate,
            opacity: [0, 1, 1, 1, 1, 1, 0.7, 0]
          }}
          transition={{
            duration: leaf.duration,
            repeat: Infinity,
            ease: "linear",
            delay: leaf.delay
          }}
        />
      ))}
    </svg>
  </div>
  );
}
