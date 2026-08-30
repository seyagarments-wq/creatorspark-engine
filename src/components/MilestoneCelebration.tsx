import { useEffect, useState } from "react";
import { playSoundEffect } from "@/hooks/use-sound-effects";

interface MilestoneCelebrationProps {
  show: boolean;
  onComplete?: () => void;
  title?: string;
  subtitle?: string;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  type: "coin" | "sparkle" | "star";
}

export function MilestoneCelebration({
  show,
  onComplete,
  title = "Milestone Unlocked!",
  subtitle = "You've hit a major achievement!",
}: MilestoneCelebrationProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      
      // Play milestone sound
      playSoundEffect("milestone");
      
      // Generate particles
      const newParticles: Particle[] = [];
      const colors = [
        "hsl(45, 100%, 50%)",   // Gold
        "hsl(40, 100%, 60%)",   // Light gold
        "hsl(35, 100%, 45%)",   // Deep gold
        "hsl(50, 100%, 70%)",   // Bright gold
        "hsl(30, 100%, 55%)",   // Amber
      ];

      // Create coin-like particles
      for (let i = 0; i < 25; i++) {
        newParticles.push({
          id: i,
          x: Math.random() * 100,
          y: -10 - Math.random() * 20,
          size: 12 + Math.random() * 16,
          color: colors[Math.floor(Math.random() * colors.length)],
          delay: Math.random() * 0.5,
          duration: 1.5 + Math.random() * 1,
          type: "coin",
        });
      }

      // Create sparkle particles
      for (let i = 25; i < 50; i++) {
        newParticles.push({
          id: i,
          x: Math.random() * 100,
          y: Math.random() * 100,
          size: 4 + Math.random() * 8,
          color: colors[Math.floor(Math.random() * colors.length)],
          delay: Math.random() * 1,
          duration: 0.5 + Math.random() * 0.5,
          type: "sparkle",
        });
      }

      // Create star bursts from center
      for (let i = 50; i < 65; i++) {
        const angle = (i - 50) * (360 / 15);
        newParticles.push({
          id: i,
          x: 50,
          y: 50,
          size: 16 + Math.random() * 12,
          color: colors[Math.floor(Math.random() * colors.length)],
          delay: 0.2 + Math.random() * 0.3,
          duration: 0.8 + Math.random() * 0.4,
          type: "star",
        });
      }

      setParticles(newParticles);

      // Auto-hide after animation
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      {/* Background flash */}
      <div 
        className="absolute inset-0 bg-gradient-to-b from-yellow-500/20 via-transparent to-transparent"
        style={{
          animation: "flash 0.5s ease-out forwards",
        }}
      />

      {/* Particles */}
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute"
          style={{
            left: `${particle.x}%`,
            top: particle.type === "coin" ? `${particle.y}%` : `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            animationDelay: `${particle.delay}s`,
            animationDuration: `${particle.duration}s`,
            animation: particle.type === "coin" 
              ? `coinFall ${particle.duration}s ease-in ${particle.delay}s forwards`
              : particle.type === "sparkle"
              ? `sparkle ${particle.duration}s ease-out ${particle.delay}s infinite`
              : `starBurst ${particle.duration}s ease-out ${particle.delay}s forwards`,
          }}
        >
          {particle.type === "coin" ? (
            <div 
              className="w-full h-full rounded-full shadow-lg"
              style={{
                background: `radial-gradient(circle at 30% 30%, ${particle.color}, hsl(35, 100%, 35%))`,
                boxShadow: `0 0 10px ${particle.color}`,
              }}
            >
              <div 
                className="absolute inset-1 rounded-full opacity-50"
                style={{
                  background: `radial-gradient(circle at 40% 40%, white, transparent 60%)`,
                }}
              />
            </div>
          ) : particle.type === "sparkle" ? (
            <div 
              className="w-full h-full"
              style={{
                background: particle.color,
                clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
                filter: `drop-shadow(0 0 4px ${particle.color})`,
              }}
            />
          ) : (
            <div 
              className="w-full h-full"
              style={{
                background: particle.color,
                clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
                filter: `drop-shadow(0 0 8px ${particle.color})`,
                transform: `rotate(${particle.id * 24}deg)`,
              }}
            />
          )}
        </div>
      ))}

      {/* Center badge/achievement */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
        style={{
          animation: "badgeAppear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s forwards",
          opacity: 0,
          transform: "translate(-50%, -50%) scale(0.5)",
        }}
      >
        <div className="relative">
          {/* Glow ring */}
          <div 
            className="absolute -inset-8 rounded-full"
            style={{
              background: "radial-gradient(circle, hsl(45, 100%, 50%) 0%, transparent 70%)",
              animation: "pulseGlow 1.5s ease-in-out infinite",
            }}
          />
          
          {/* Badge */}
          <div className="relative bg-gradient-to-br from-yellow-400 via-yellow-500 to-amber-600 rounded-full p-8 shadow-2xl">
            <div className="absolute inset-1 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 opacity-50" />
            <div className="relative text-6xl">🏆</div>
          </div>
        </div>
        
        <h2 
          className="mt-6 text-2xl md:text-3xl font-bold text-foreground drop-shadow-lg"
          style={{
            textShadow: "0 0 20px hsl(45, 100%, 50%), 0 0 40px hsl(45, 100%, 50%)",
          }}
        >
          {title}
        </h2>
        <p className="mt-2 text-lg text-muted-foreground">{subtitle}</p>
      </div>

      <style>{`
        @keyframes flash {
          0% { opacity: 0.8; }
          100% { opacity: 0; }
        }
        
        @keyframes coinFall {
          0% {
            transform: translateY(0) rotate(0deg) scale(1);
            opacity: 1;
          }
          100% {
            transform: translateY(120vh) rotate(720deg) scale(0.5);
            opacity: 0;
          }
        }
        
        @keyframes sparkle {
          0%, 100% {
            transform: scale(0) rotate(0deg);
            opacity: 0;
          }
          50% {
            transform: scale(1) rotate(180deg);
            opacity: 1;
          }
        }
        
        @keyframes starBurst {
          0% {
            transform: translate(0, 0) scale(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translate(
              calc((var(--id, 0) - 7.5) * 15vw),
              calc((var(--id, 0) - 7.5) * 15vh)
            ) scale(1.5) rotate(360deg);
            opacity: 0;
          }
        }
        
        @keyframes badgeAppear {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        
        @keyframes pulseGlow {
          0%, 100% {
            transform: scale(1);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}