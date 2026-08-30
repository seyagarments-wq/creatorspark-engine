import { useEffect, useState } from "react";

interface Particle {
  id: number;
  x: number;
  startY: number;
  size: number;
  delay: number;
  duration: number;
  symbol: string;
  color: string;
}

interface PayoutCelebrationProps {
  show: boolean;
  onComplete?: () => void;
}

const SYMBOLS = ["💵", "$", "💰", "✨", "💸"];
const COLORS = [
  "hsl(142, 71%, 45%)",
  "hsl(142, 71%, 55%)",
  "hsl(45, 100%, 50%)",
  "hsl(155, 60%, 50%)",
];

export function PayoutCelebration({ show, onComplete }: PayoutCelebrationProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;

    setVisible(true);

    const newParticles: Particle[] = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: 5 + Math.random() * 90,
      startY: 110 + Math.random() * 20,
      size: 20 + Math.random() * 18,
      delay: Math.random() * 0.8,
      duration: 1.4 + Math.random() * 1.0,
      symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));

    setParticles(newParticles);

    const timer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 3500);

    return () => clearTimeout(timer);
  }, [show]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9998] pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute select-none"
          style={{
            left: `${p.x}%`,
            top: `${p.startY}%`,
            fontSize: p.size,
            color: p.color,
            animation: `payoutFloat ${p.duration}s ease-out ${p.delay}s forwards`,
            opacity: 0,
            filter: `drop-shadow(0 0 6px ${p.color})`,
          }}
        >
          {p.symbol}
        </div>
      ))}

      {/* Flash banner */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 bg-success/90 text-success-foreground px-6 py-3 rounded-2xl shadow-2xl font-bold text-xl backdrop-blur-sm"
        style={{
          animation: "payoutBanner 3s ease-out forwards",
          opacity: 0,
        }}
      >
        💸 Payout Received!
      </div>

      <style>{`
        @keyframes payoutFloat {
          0%   { transform: translateY(0) scale(0.5) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(-110vh) scale(1.2) rotate(${Math.random() > 0.5 ? "" : "-"}30deg); opacity: 0; }
        }
        @keyframes payoutBanner {
          0%   { opacity: 0; transform: translateX(-50%) scale(0.8); }
          15%  { opacity: 1; transform: translateX(-50%) scale(1.05); }
          70%  { opacity: 1; transform: translateX(-50%) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) scale(0.95); }
        }
      `}</style>
    </div>
  );
}
