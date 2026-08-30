import { useEffect, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";

interface CountdownTimerProps {
  endDate: Date;
  onExpire?: () => void;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

export function CountdownTimer({ endDate, onExpire }: CountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(calculateTimeRemaining());

  function calculateTimeRemaining(): TimeRemaining {
    const now = new Date().getTime();
    const target = endDate.getTime();
    const diff = target - now;

    if (diff <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    }

    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((diff % (1000 * 60)) / 1000),
      expired: false,
    };
  }

  useEffect(() => {
    const interval = setInterval(() => {
      const newTime = calculateTimeRemaining();
      setTimeRemaining(newTime);
      
      if (newTime.expired && onExpire) {
        onExpire();
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [endDate, onExpire]);

  const isUrgent = timeRemaining.days === 0 && timeRemaining.hours < 24;
  const isCritical = timeRemaining.days === 0 && timeRemaining.hours < 6;

  if (timeRemaining.expired) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <AlertTriangle className="w-4 h-4" />
        <span className="font-medium">Expired</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${isCritical ? "text-destructive" : isUrgent ? "text-warning" : "text-muted-foreground"}`}>
      <Clock className={`w-4 h-4 ${isCritical ? "animate-pulse" : ""}`} />
      <div className="flex items-center gap-1 text-sm font-medium">
        {timeRemaining.days > 0 && (
          <span className="tabular-nums">{timeRemaining.days}d</span>
        )}
        <span className="tabular-nums">{String(timeRemaining.hours).padStart(2, "0")}h</span>
        <span className="tabular-nums">{String(timeRemaining.minutes).padStart(2, "0")}m</span>
        {timeRemaining.days === 0 && (
          <span className="tabular-nums">{String(timeRemaining.seconds).padStart(2, "0")}s</span>
        )}
      </div>
    </div>
  );
}