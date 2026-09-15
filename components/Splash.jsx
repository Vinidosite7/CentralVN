"use client";
import { useEffect, useState } from "react";

/* Tela de abertura (splash) — logo grande centralizada, ~2s, fade suave.
   Aparece só no carregamento inicial do app. */
export default function Splash() {
  const [fase, setFase] = useState("in"); // in → hold → out → done

  useEffect(() => {
    const t1 = setTimeout(() => setFase("out"), 1800); // começa a sumir aos 1.8s
    const t2 = setTimeout(() => setFase("done"), 2400); // remove de vez aos 2.4s
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (fase === "done") return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#070812",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fase === "out" ? 0 : 1,
        transition: "opacity 0.6s ease",
        pointerEvents: fase === "out" ? "none" : "auto",
      }}
    >
      {/* glow de fundo atrás da logo */}
      <div
        style={{
          position: "absolute",
          width: 420,
          height: 420,
          background: "radial-gradient(circle, rgba(124,110,247,0.20) 0%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />
      <img
        src="/logo.png"
        alt="Central VN"
        style={{
          position: "relative",
          width: "min(56vw, 240px)",
          height: "auto",
          animation: "splashPop 0.8s cubic-bezier(0.16,1,0.3,1)",
        }}
      />
      <style>{`
        @keyframes splashPop {
          from { opacity: 0; transform: scale(0.82); }
          to   { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          img { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
