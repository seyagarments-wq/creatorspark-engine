import { useEffect, useRef, useState, useCallback } from "react";

type Sun = {
  id: number;
  x: number; // percent
  y: number; // percent
  size: number; // px
  spawnedAt: number;
  ttl: number; // ms
};

const GAME_DURATION = 30_000;

export default function Maintenance() {
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [highScore, setHighScore] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("maint_sun_hi") || 0);
  });
  const [suns, setSuns] = useState<Sun[]>([]);
  const arenaRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  // Game loop: spawn suns + countdown
  useEffect(() => {
    if (!playing) return;
    const start = Date.now();

    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const left = Math.max(0, GAME_DURATION - elapsed);
      setTimeLeft(left);
      if (left <= 0) {
        setPlaying(false);
      }
      // expire old suns
      setSuns((prev) => prev.filter((s) => Date.now() - s.spawnedAt < s.ttl));
    }, 100);

    const spawn = setInterval(() => {
      const ttl = 1400 - Math.min(600, (Date.now() - start) / 30);
      setSuns((prev) => [
        ...prev,
        {
          id: ++idRef.current,
          x: 8 + Math.random() * 84,
          y: 10 + Math.random() * 75,
          size: 44 + Math.random() * 28,
          spawnedAt: Date.now(),
          ttl,
        },
      ]);
    }, 650);

    return () => {
      clearInterval(tick);
      clearInterval(spawn);
    };
  }, [playing]);

  // Save high score when game ends
  useEffect(() => {
    if (!playing && score > 0 && score > highScore) {
      setHighScore(score);
      try {
        localStorage.setItem("maint_sun_hi", String(score));
      } catch {}
    }
  }, [playing, score, highScore]);

  const startGame = useCallback(() => {
    setScore(0);
    setSuns([]);
    setTimeLeft(GAME_DURATION);
    setPlaying(true);
  }, []);

  const hitSun = useCallback((id: number) => {
    setSuns((prev) => {
      if (!prev.find((s) => s.id === id)) return prev;
      return prev.filter((s) => s.id !== id);
    });
    setScore((s) => s + 1);
  }, []);

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-black text-white px-4 py-8 overflow-hidden select-none">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-xs sm:text-sm uppercase tracking-[0.3em] text-white/50">
          Creators Control
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-light">
          App is <span className="italic font-serif">down</span>
        </h1>
        <p className="text-white/70 text-base sm:text-lg">
          We'll be back soon.
        </p>

        {/* Game arena */}
        <div className="relative mx-auto w-full">
          {/* Sky / arena */}
          <div
            ref={arenaRef}
            className="relative w-full h-64 sm:h-72 rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-b from-orange-950/30 via-black to-black touch-none"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {/* Arc track (subtle) */}
            <svg
              viewBox="0 0 200 100"
              className="absolute inset-0 w-full h-full pointer-events-none"
              preserveAspectRatio="none"
            >
              <path
                d="M 10 80 Q 100 -20 190 80"
                fill="none"
                stroke="hsl(0 0% 100% / 0.08)"
                strokeWidth="0.5"
                strokeDasharray="2 3"
              />
            </svg>

            {/* Horizon */}
            <div className="absolute bottom-8 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black to-transparent pointer-events-none" />

            {/* Idle ambient sun (only when not playing) */}
            {!playing && (
              <div className="sun-orbit absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                <div className="sun-glow w-12 h-12 rounded-full bg-[radial-gradient(circle,_hsl(35_100%_70%)_0%,_hsl(20_100%_55%)_60%,_transparent_75%)] shadow-[0_0_40px_hsl(30_100%_60%/0.6)]" />
              </div>
            )}

            {/* Playable suns */}
            {playing &&
              suns.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    hitSun(s.id);
                  }}
                  className="absolute rounded-full sun-pop"
                  style={{
                    left: `${s.x}%`,
                    top: `${s.y}%`,
                    width: s.size,
                    height: s.size,
                    transform: "translate(-50%, -50%)",
                    background:
                      "radial-gradient(circle, hsl(45 100% 75%) 0%, hsl(25 100% 55%) 55%, transparent 78%)",
                    boxShadow: "0 0 30px hsl(30 100% 60% / 0.65)",
                    border: "none",
                    cursor: "pointer",
                    touchAction: "manipulation",
                  }}
                  aria-label="Tap the sun"
                />
              ))}

            {/* Overlay: start / game over */}
            {!playing && (
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-6 gap-3 bg-gradient-to-t from-black/70 via-transparent to-transparent">
                {score > 0 && (
                  <div className="text-white/80 text-sm">
                    Final score: <span className="font-semibold text-white">{score}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={startGame}
                  className="px-6 py-2.5 rounded-full bg-white text-black text-sm font-semibold tracking-wide hover:bg-white/90 active:scale-[0.98] transition touch-manipulation"
                >
                  {score > 0 ? "Play again" : "Catch the sun"}
                </button>
              </div>
            )}

            {/* HUD */}
            {playing && (
              <div className="absolute top-2 left-2 right-2 flex items-center justify-between text-xs font-mono pointer-events-none">
                <span className="px-2 py-1 rounded-md bg-white/10 backdrop-blur-sm">
                  Score {score}
                </span>
                <span className="px-2 py-1 rounded-md bg-white/10 backdrop-blur-sm">
                  {(timeLeft / 1000).toFixed(1)}s
                </span>
              </div>
            )}
          </div>

          {/* High score */}
          <div className="mt-3 text-[11px] uppercase tracking-[0.25em] text-white/40">
            Best · {highScore}
          </div>
        </div>

        <p className="text-white/40 text-[11px] sm:text-xs uppercase tracking-[0.25em]">
          Maintenance in progress
        </p>
      </div>

      <style>{`
        @keyframes sun-arc {
          0%   { transform: translate(-120px, 30px) scale(0.85); opacity: 0; }
          10%  { opacity: 1; }
          50%  { transform: translate(0px, -30px) scale(1); opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translate(120px, 30px) scale(0.85); opacity: 0; }
        }
        @keyframes sun-pulse {
          0%, 100% { filter: brightness(1); }
          50%      { filter: brightness(1.15); }
        }
        @keyframes sun-pop-in {
          0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
          60%  { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        .sun-orbit { animation: sun-arc 6s ease-in-out infinite; }
        .sun-glow  { animation: sun-pulse 2s ease-in-out infinite; }
        .sun-pop   { animation: sun-pop-in 0.22s ease-out; }

        @media (max-width: 480px) {
          .sun-orbit { animation-duration: 5s; }
        }
      `}</style>
    </div>
  );
}
