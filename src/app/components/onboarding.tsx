import React, { useState, useEffect } from "react";
import { AnimatedModal } from "./motion-transitions.jsx";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "../context/AppContext.jsx";
import { LIFE_AREAS } from "../utils.jsx";
import { MUSIC_STORAGE_KEYS, MUSIC_STORAGE_VALUES, ONBOARDING_WELCOME } from "../constants.jsx";

const { invoke } = window.__TAURI__.core;

const ASRS_QUESTIONS = [
  "How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?",
  "How often do you have difficulty getting things in order when you have to do a task that requires organization?",
  "How often do you have problems remembering appointments or obligations?",
  "When you have a task that requires a lot of thought, how often do you avoid or delay getting started?",
  "How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?",
  "How often do you feel overly active and compelled to do things, like you were driven by a motor?",
  "How often do you make careless mistakes when you have to work on a boring or difficult project?",
  "How often do you have difficulty keeping your attention when you are doing boring or repetitive work?",
  "How often do you have difficulty concentrating on what people say to you, even when they are speaking to you directly?",
  "How often do you misplace or have difficulty finding things at home or at work?",
  "How often are you distracted by activity or noise around you?",
  "How often do you leave your seat in meetings or other situations in which you are expected to remain seated?",
  "How often do you feel restless or fidgety?",
  "How often do you have difficulty unwinding and relaxing when you have time to yourself?",
  "How often do you find yourself talking too much when you are in social situations?",
  "When you're in a conversation, how often do you find yourself finishing the sentences of the people you are talking to, before they can finish them themselves?",
  "How often do you have difficulty waiting your turn in situations when turn taking is required?",
  "How often do you interrupt others when they are busy?"
];

const OPTIONS = [
  "Never",
  "Rarely",
  "Sometimes",
  "Often",
  "Very Often"
];

// Abstract graphic that morphs based on index
const AbstractGraphic = ({ index }: { index: number }) => {
  // Different abstract SVG paths that we can morph between
  const paths = [
    "M45,20 C60,20 70,35 70,50 C70,65 60,80 45,80 C30,80 20,65 20,50 C20,35 30,20 45,20 Z",
    "M50,15 C70,25 80,45 75,65 C70,85 45,90 25,80 C5,70 10,40 30,20 C40,10 45,10 50,15 Z",
    "M40,25 C65,15 85,35 80,60 C75,85 50,85 30,75 C10,65 15,40 25,30 C30,25 35,28 40,25 Z",
    "M55,20 C75,25 80,50 65,70 C50,90 25,85 15,65 C5,45 20,20 40,15 C45,13 50,18 55,20 Z",
    "M35,30 C55,15 75,30 80,55 C85,80 60,85 40,75 C20,65 10,45 20,35 C25,30 30,35 35,30 Z"
  ];
  
  const currentPath = paths[index % paths.length];
  const nextPath = paths[(index + 1) % paths.length];
  
  const colors = [
    "rgba(255,255,255,0.4)",
    "rgba(200,230,255,0.4)",
    "rgba(255,220,200,0.4)",
    "rgba(220,255,220,0.4)"
  ];
  const color = colors[index % colors.length];

  return (
    <motion.svg viewBox="0 0 100 100" style={{ width: "100%", maxWidth: "500px", filter: "drop-shadow(0px 10px 30px rgba(0,0,0,0.2))" }}>
      <motion.path
        animate={{ d: [currentPath, nextPath, currentPath] }}
        transition={{ duration: 8, ease: "easeInOut", repeat: Infinity }}
        fill={color}
        style={{ backdropFilter: "blur(10px)" }}
      />
      <motion.circle 
        cx="50" cy="50" r="15" 
        fill="rgba(255,255,255,0.2)"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
      />
    </motion.svg>
  );
};

// Official ASRS v1.1 Scoring for Part A (first 6 questions)
// Q1-3: "Sometimes", "Often", "Very Often" (index 2, 3, 4) = 1 pt
// Q4-6: "Often", "Very Often" (index 3, 4) = 1 pt
const calculateASRSScore = (answers: number[]) => {
  let score = 0;
  for (let i = 0; i < 6; i++) {
    if (i < 3 && answers[i] >= 2) score++;
    else if (i >= 3 && answers[i] >= 3) score++;
  }
  return score;
};

export function OnboardingModal() {
  const { state, actions } = useApp();
  const [step, setStep] = useState("welcome"); // welcome, questions, branch, preferences
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>(new Array(18).fill(-1));
  const [lifeAreas, setLifeAreas] = useState<string[]>([]);
  const [musicEnabled, setMusicEnabled] = useState(true);

  useEffect(() => {
    if (state.S.account && !state.S.syncing) {
      const intent = localStorage.getItem('authIntent');
      const isReturningUser = state.S.lists && state.S.lists.length > 0;
      
      if (isReturningUser) {
        if (intent === 'signup') {
          console.log("Existing account found. Skipping onboarding.");
        }
        localStorage.removeItem('authIntent');
        actions.setHasCompletedOnboarding(true);
        window.location.reload();
      } else {
        localStorage.removeItem('authIntent');
        setStep("questions");
        setQuestionIndex(0);
      }
    }
  }, [state.S.account, state.S.syncing, state.S.lists, actions]);

  const handleNextQuestion = () => {
    if (answers[questionIndex] === -1) return; // Prevent advancing if no answer

    if (questionIndex === 5) {
      setStep("branch");
    } else if (questionIndex === ASRS_QUESTIONS.length - 1) {
      // Completed the whole thing
      setStep("preferences");
    } else {
      setQuestionIndex(i => i + 1);
    }
  };

  const handlePrevQuestion = () => {
    if (questionIndex > 0) {
      setQuestionIndex(i => i - 1);
    }
  };

  const setAnswer = (idx: number) => {
    setAnswers(prev => {
      const copy = [...prev];
      copy[questionIndex] = idx;
      return copy;
    });
  };

  const handleFinish = async () => {
    for (const areaKey of lifeAreas) {
      const area = LIFE_AREAS.find(a => a.key === areaKey);
      const name = area ? area.label : "My Tasks";

      // Prevent creating duplicate lists if the user runs onboarding again
      const exists = state.S.lists.some((l: any) => l.lifeArea === areaKey || l.name === name);
      if (exists) continue;

      const emojiMap: Record<string, string> = {
        work: "💼", home: "🏠", health: "🏋️", money: "💰",
        creative: "🎨", learning: "🧠", nature: "🌱",
        travel: "✈️", social: "🤝"
      };
      const emoji = emojiMap[areaKey] || "📁";
      const color = area ? area.color : "#6e6e6e";
      
      try {
        const snap = await invoke("add_list", { name });
        // Assume the backend appends the new list, so we take the last one
        // or one that wasn't in the initial state
        const newList = snap.lists.find((l: any) => !state.S.lists.some((old: any) => old.id === l.id)) || snap.lists[snap.lists.length - 1];
        await invoke("set_list_style", { id: newList.id, emoji, color });
        await invoke("set_list_life_tag", { id: newList.id, area: areaKey, direction: "increase" });
      } catch (err) {
        console.error("Error creating onboarding list for area " + areaKey, err);
      }
    }

    try {
      // Save the ASRS answers to the backend
      await invoke("save_asrs_answers", { answers });
    } catch (err) {
      console.error("Error saving ASRS answers", err);
    }

    localStorage.setItem(MUSIC_STORAGE_KEYS.flowEnabled, musicEnabled ? MUSIC_STORAGE_VALUES.enabled : MUSIC_STORAGE_VALUES.disabled);
    actions.setHasCompletedOnboarding(true);
    window.location.reload();
  };

  if (step === "welcome") {
    return (
      <AnimatedModal id="onboarding-modal" onClose={() => {}} className="full-page-onboarding" overlayClassName="overlay show z-max onboarding-overlay">
        {/* Full-bleed static background image */}
        <img
          src="/onboarding-bg.jpg"
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            zIndex: 1,
            pointerEvents: "none"
          }}
        />

        {/* Center overlay content */}
        <div style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: "24px"
        }}>
          <div className="ob-glass-card" style={{
            background: "rgba(18, 18, 18, 0.75)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(61, 191, 172, 0.25)",
            borderRadius: "24px",
            padding: "48px 40px",
            maxWidth: "520px",
            width: "100%",
            textAlign: "center",
            boxShadow: "0 25px 60px rgba(0, 0, 0, 0.5)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: "relative"
          }}>
            <h1 style={{
              fontSize: "40px",
              fontWeight: 700,
              marginBottom: "16px",
              background: "linear-gradient(135deg, #ffffff 0%, var(--green-hi) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              lineHeight: 1.2,
              letterSpacing: "-0.5px"
            }}>
              {ONBOARDING_WELCOME.title}
            </h1>
            <p className="ob-subtitle" style={{
              fontSize: "16px",
              color: "rgba(255, 255, 255, 0.75)",
              lineHeight: 1.6,
              maxWidth: "420px",
              margin: "0 auto 32px auto"
            }}>
              {ONBOARDING_WELCOME.subtitle}
            </p>
            <div style={{ display: 'flex', gap: 16, width: "100%", maxWidth: "380px" }}>
              <button
                className="ob-glass-btn"
                style={{
                  margin: 0,
                  flex: 1,
                  padding: "16px 20px",
                  fontSize: "16px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  cursor: "pointer"
                }}
                onClick={() => {
                  localStorage.setItem('authIntent', 'signin');
                  actions.signInGoogle();
                }}
              >
                {ONBOARDING_WELCOME.signIn}
              </button>
              <button
                className="ob-glass-btn primary"
                style={{
                  margin: 0,
                  flex: 1,
                  padding: "16px 20px",
                  fontSize: "16px",
                  background: "var(--green)",
                  borderColor: "var(--green-hi)",
                  cursor: "pointer"
                }}
                onClick={() => {
                  localStorage.setItem('authIntent', 'signup');
                  actions.signInGoogle();
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--green-hi)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--green)";
                }}
              >
                {ONBOARDING_WELCOME.signUp}
              </button>
            </div>
            
            <button
              style={{
                marginTop: 24,
                background: "none",
                border: "none",
                color: "rgba(255, 255, 255, 0.5)",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "color 0.2s",
                textDecoration: "underline"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--green-hi)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255, 255, 255, 0.5)")}
              onClick={() => setStep("questions")}
            >
              {ONBOARDING_WELCOME.continueAsGuest}
            </button>
          </div>
        </div>
      </AnimatedModal>
    );
  }

  if (step === "questions") {
    const totalQuestions = 18;
    return (
      <AnimatedModal id="onboarding-modal" onClose={() => {}} className="full-page-onboarding" overlayClassName="overlay show z-max onboarding-overlay">
        <div className="ob-progress-container">
          <div className="ob-progress-fill" style={{ width: `${((questionIndex) / totalQuestions) * 100}%` }} />
        </div>
        
        <div className="ob-split-layout">
          <div className="ob-left-col">
            <AnimatePresence mode="wait">
              <motion.div
                key={questionIndex}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                style={{ width: "100%" }}
              >
                <h2 className="ob-title" style={{ textAlign: "left" }}>
                  {ASRS_QUESTIONS[questionIndex]}
                </h2>
                <div style={{ width: "100%", maxWidth: "400px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {OPTIONS.map((opt, idx) => {
                    const isSelected = answers[questionIndex] === idx;
                    return (
                      <button 
                        key={opt} 
                        className={`ob-glass-btn ${isSelected ? 'primary' : ''}`} 
                        onClick={() => setAnswer(idx)} 
                        style={{ textAlign: "left", paddingLeft: "32px", margin: 0, opacity: answers[questionIndex] !== -1 && !isSelected ? 0.6 : 1 }}
                      >
                        {opt}
                      </button>
                    );
                  })}
                  
                  <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                    {questionIndex > 0 && (
                      <button className="ob-glass-btn" onClick={handlePrevQuestion} style={{ margin: 0, flex: 1, textAlign: "center" }}>
                        Back
                      </button>
                    )}
                    <button 
                      className="ob-glass-btn primary" 
                      onClick={handleNextQuestion} 
                      disabled={answers[questionIndex] === -1}
                      style={{ margin: 0, flex: 1, textAlign: "center", opacity: answers[questionIndex] === -1 ? 0.4 : 1, cursor: answers[questionIndex] === -1 ? "not-allowed" : "pointer" }}
                    >
                      {questionIndex === 5 || questionIndex === 17 ? "Finish" : "Next"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          
          <div className="ob-right-col">
            <AbstractGraphic index={questionIndex} />
          </div>
        </div>
      </AnimatedModal>
    );
  }

  if (step === "branch") {
    const score = calculateASRSScore(answers);
    const hasADHD = score >= 4;
    
    return (
      <AnimatedModal id="onboarding-modal" onClose={() => {}} className="full-page-onboarding" overlayClassName="overlay show z-max onboarding-overlay">
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: "600px", textAlign: "center", gap: "24px", padding: "40px" }}
          >
            <div style={{ padding: "20px", background: "rgba(255,255,255,0.1)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(10px)" }}>
              <h2 className="ob-title" style={{ fontSize: "2rem", marginBottom: "16px" }}>
                {hasADHD ? "Your brain works differently." : "You've completed Part A."}
              </h2>
              <p className="ob-subtitle" style={{ fontSize: "1.1rem", lineHeight: "1.6" }}>
                {hasADHD 
                  ? "Based on your answers, your symptoms are highly consistent with ADHD. This app is designed precisely for brains like yours—to structure your time, reward your focus, and keep you on track."
                  : "Based on your answers, your symptoms are not highly consistent with ADHD. However, everyone struggles with focus and executive function at times. The tools in this app can still help you build powerful routines."}
              </p>
              <div style={{ marginTop: "16px", fontSize: "0.85rem", opacity: 0.6 }}>
                *This is a standard screening tool, not a medical diagnosis.
              </div>
            </div>

            <div style={{ display: "flex", gap: "16px", marginTop: "24px", width: "100%" }}>
              <button 
                className="ob-glass-btn" 
                onClick={() => setStep("preferences")} 
                style={{ flex: 1, margin: 0, padding: "16px", background: "rgba(255,255,255,0.05)" }}
              >
                Skip the rest and Setup
              </button>
              <button 
                className="ob-glass-btn primary" 
                onClick={() => { setStep("questions"); setQuestionIndex(6); }}
                style={{ flex: 1, margin: 0, padding: "16px" }}
              >
                Continue Part B
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </AnimatedModal>
    );
  }

  const toggleArea = (key: string) => {
    setLifeAreas(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= 3) return prev;
      return [...prev, key];
    });
  };

  const moveArea = (index: number, dir: number) => {
    setLifeAreas(prev => {
      const copy = [...prev];
      const newIdx = index + dir;
      if (newIdx < 0 || newIdx >= copy.length) return copy;
      [copy[index], copy[newIdx]] = [copy[newIdx], copy[index]];
      return copy;
    });
  };

  if (step === "preferences") {
    return (
      <AnimatedModal id="onboarding-modal" onClose={() => {}} className="full-page-onboarding" overlayClassName="overlay show z-max onboarding-overlay">
        <h2 className="ob-title" style={{ marginBottom: "8px" }}>What needs the most attention?</h2>
        <p className="ob-subtitle">Select up to 3 life areas ({lifeAreas.length}/3)</p>
        
        {lifeAreas.length > 0 && (
          <div style={{ marginBottom: "40px", background: "rgba(255,255,255,0.05)", backdropFilter: "blur(10px)", padding: "16px", borderRadius: "12px", width: "100%", maxWidth: "480px" }}>
            <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", color: "rgba(255,255,255,0.7)", textAlign: "center" }}>Prioritized Focus Areas</div>
            {lifeAreas.map((areaKey, i) => {
              const area = LIFE_AREAS.find(a => a.key === areaKey);
              return (
                <div key={areaKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(255,255,255,0.1)", marginBottom: "8px", borderRadius: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ background: "rgba(255,255,255,0.2)", color: "#fff", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "bold" }}>{i + 1}</span>
                    <span style={{ fontSize: "16px" }}>{area?.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => moveArea(i, -1)} disabled={i === 0} style={{ background: "transparent", border: "none", color: "#fff", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.3 : 1, fontSize: "18px" }}>↑</button>
                    <button onClick={() => moveArea(i, 1)} disabled={i === lifeAreas.length - 1} style={{ background: "transparent", border: "none", color: "#fff", cursor: i === lifeAreas.length - 1 ? "default" : "pointer", opacity: i === lifeAreas.length - 1 ? 0.3 : 1, fontSize: "18px" }}>↓</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "48px", width: "100%", maxWidth: "480px" }}>
          {LIFE_AREAS.map(a => {
            const idx = lifeAreas.indexOf(a.key);
            const isSelected = idx !== -1;
            const isDisabled = !isSelected && lifeAreas.length >= 3;
            return (
              <button 
                key={a.key} 
                className={`ob-glass-btn ${isSelected ? 'primary' : ''}`}
                style={{ margin: 0, padding: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", opacity: isDisabled ? 0.4 : 1, cursor: isDisabled ? "not-allowed" : "pointer", maxWidth: "100%" }}
                onClick={() => !isDisabled && toggleArea(a.key)}
              >
                {isSelected && <span style={{ background: "rgba(255,255,255,0.3)", width: "20px", height: "20px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "bold" }}>{idx + 1}</span>}
                {a.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: "32px", gap: "16px", width: "100%", maxWidth: "480px" }}>
          <span style={{ fontSize: "18px" }}>Enable Focus Music?</span>
          <input 
            type="checkbox" 
            checked={musicEnabled} 
            onChange={e => setMusicEnabled(e.target.checked)} 
            style={{ cursor: "pointer", width: "24px", height: "24px", accentColor: "rgba(255,255,255,0.5)" }}
          />
        </div>

        <button className="ob-glass-btn primary" onClick={handleFinish}>Complete Setup</button>
      </AnimatedModal>
    );
  }

  return null;
}
