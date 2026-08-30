import { useCallback, useRef } from "react";

type SoundType = "celebration" | "cha-ching" | "notification" | "success" | "milestone";

// Web Audio API synthesized sounds - no external dependencies needed
const createAudioContext = () => {
  return new (window.AudioContext || (window as any).webkitAudioContext)();
};

const playCelebrationSound = (ctx: AudioContext) => {
  const now = ctx.currentTime;
  
  // Create a cheerful ascending arpeggio
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + i * 0.1);
    
    gain.gain.setValueAtTime(0, now + i * 0.1);
    gain.gain.linearRampToValueAtTime(0.3, now + i * 0.1 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
    
    osc.start(now + i * 0.1);
    osc.stop(now + i * 0.1 + 0.4);
  });

  // Add a final shimmer
  const shimmer = ctx.createOscillator();
  const shimmerGain = ctx.createGain();
  shimmer.connect(shimmerGain);
  shimmerGain.connect(ctx.destination);
  shimmer.type = "sine";
  shimmer.frequency.setValueAtTime(2093, now + 0.4);
  shimmerGain.gain.setValueAtTime(0, now + 0.4);
  shimmerGain.gain.linearRampToValueAtTime(0.2, now + 0.45);
  shimmerGain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
  shimmer.start(now + 0.4);
  shimmer.stop(now + 0.9);
};

const playChaChingSound = (ctx: AudioContext) => {
  const now = ctx.currentTime;
  
  // Cash register "cha" - metallic click
  const click1 = ctx.createOscillator();
  const click1Gain = ctx.createGain();
  const click1Filter = ctx.createBiquadFilter();
  
  click1.connect(click1Filter);
  click1Filter.connect(click1Gain);
  click1Gain.connect(ctx.destination);
  
  click1.type = "square";
  click1.frequency.setValueAtTime(800, now);
  click1.frequency.exponentialRampToValueAtTime(200, now + 0.05);
  click1Filter.type = "highpass";
  click1Filter.frequency.setValueAtTime(400, now);
  click1Gain.gain.setValueAtTime(0.3, now);
  click1Gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
  
  click1.start(now);
  click1.stop(now + 0.1);

  // "Ching" - bright bell sound
  const bell1 = ctx.createOscillator();
  const bell1Gain = ctx.createGain();
  bell1.connect(bell1Gain);
  bell1Gain.connect(ctx.destination);
  bell1.type = "sine";
  bell1.frequency.setValueAtTime(2637, now + 0.08); // E7
  bell1Gain.gain.setValueAtTime(0, now + 0.08);
  bell1Gain.gain.linearRampToValueAtTime(0.4, now + 0.1);
  bell1Gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
  bell1.start(now + 0.08);
  bell1.stop(now + 0.6);

  // Harmonic overtone
  const bell2 = ctx.createOscillator();
  const bell2Gain = ctx.createGain();
  bell2.connect(bell2Gain);
  bell2Gain.connect(ctx.destination);
  bell2.type = "sine";
  bell2.frequency.setValueAtTime(3951, now + 0.08); // B7
  bell2Gain.gain.setValueAtTime(0, now + 0.08);
  bell2Gain.gain.linearRampToValueAtTime(0.2, now + 0.1);
  bell2Gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
  bell2.start(now + 0.08);
  bell2.stop(now + 0.5);

  // Second "ching" for the iconic double ring
  setTimeout(() => {
    const bell3 = ctx.createOscillator();
    const bell3Gain = ctx.createGain();
    bell3.connect(bell3Gain);
    bell3Gain.connect(ctx.destination);
    bell3.type = "sine";
    bell3.frequency.setValueAtTime(3136, now + 0.25); // G7
    bell3Gain.gain.setValueAtTime(0.35, now + 0.25);
    bell3Gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
    bell3.start(now + 0.25);
    bell3.stop(now + 0.8);
  }, 170);
};

const playNotificationSound = (ctx: AudioContext) => {
  const now = ctx.currentTime;
  
  // Gentle two-tone notification
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(880, now); // A5
  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(0.2, now + 0.02);
  gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
  osc1.start(now);
  osc1.stop(now + 0.2);

  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1318.5, now + 0.12); // E6
  gain2.gain.setValueAtTime(0, now + 0.12);
  gain2.gain.linearRampToValueAtTime(0.2, now + 0.14);
  gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
  osc2.start(now + 0.12);
  osc2.stop(now + 0.35);
};

const playSuccessSound = (ctx: AudioContext) => {
  const now = ctx.currentTime;
  
  // Quick success chime
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(784, now); // G5
  osc.frequency.setValueAtTime(988, now + 0.1); // B5
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
  gain.gain.setValueAtTime(0.25, now + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
  osc.start(now);
  osc.stop(now + 0.35);
};

const playMilestoneSound = (ctx: AudioContext) => {
  const now = ctx.currentTime;
  
  // Epic fanfare - triumphant brass-like sound
  const createBrassNote = (freq: number, startTime: number, duration: number, volume: number) => {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc1.type = "sawtooth";
    osc2.type = "square";
    osc1.frequency.setValueAtTime(freq, startTime);
    osc2.frequency.setValueAtTime(freq * 2, startTime);
    
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2000, startTime);
    filter.Q.setValueAtTime(2, startTime);
    
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.03);
    gain.gain.setValueAtTime(volume * 0.8, startTime + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
    
    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + duration);
    osc2.stop(startTime + duration);
  };
  
  // Triumphant fanfare melody: G4 - C5 - E5 - G5 (held)
  createBrassNote(392, now, 0.15, 0.2);           // G4
  createBrassNote(523.25, now + 0.12, 0.15, 0.25); // C5  
  createBrassNote(659.25, now + 0.24, 0.15, 0.3);  // E5
  createBrassNote(783.99, now + 0.36, 0.6, 0.35); // G5 (held longer)
  
  // Add shimmer/sparkle overlay
  const shimmerNotes = [1046.5, 1318.5, 1568]; // C6, E6, G6
  shimmerNotes.forEach((freq, i) => {
    const shimmer = ctx.createOscillator();
    const shimmerGain = ctx.createGain();
    shimmer.connect(shimmerGain);
    shimmerGain.connect(ctx.destination);
    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(freq, now + 0.5 + i * 0.08);
    shimmerGain.gain.setValueAtTime(0, now + 0.5 + i * 0.08);
    shimmerGain.gain.linearRampToValueAtTime(0.15, now + 0.52 + i * 0.08);
    shimmerGain.gain.exponentialRampToValueAtTime(0.01, now + 1.0 + i * 0.08);
    shimmer.start(now + 0.5 + i * 0.08);
    shimmer.stop(now + 1.1 + i * 0.08);
  });
  
  // Final victory chord
  setTimeout(() => {
    const chordFreqs = [523.25, 659.25, 783.99, 1046.5]; // C major chord
    chordFreqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.9);
    });
  }, 700);
};

// Haptic feedback utility
const triggerHaptic = (pattern: "light" | "medium" | "heavy" | "success" | "warning") => {
  if (!navigator.vibrate) return;
  
  switch (pattern) {
    case "light":
      navigator.vibrate(10);
      break;
    case "medium":
      navigator.vibrate(25);
      break;
    case "heavy":
      navigator.vibrate(50);
      break;
    case "success":
      navigator.vibrate([10, 50, 20, 50, 30]); // Ascending pattern
      break;
    case "warning":
      navigator.vibrate([50, 30, 50]); // Alert pattern
      break;
  }
};

export function useSoundEffects() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = createAudioContext();
    }
    // Resume context if suspended (browser autoplay policy)
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const playSound = useCallback((type: SoundType, withHaptic = true) => {
    try {
      const ctx = getAudioContext();
      
      switch (type) {
        case "celebration":
          playCelebrationSound(ctx);
          if (withHaptic) triggerHaptic("success");
          break;
        case "cha-ching":
          playChaChingSound(ctx);
          if (withHaptic) triggerHaptic("heavy");
          break;
        case "notification":
          playNotificationSound(ctx);
          if (withHaptic) triggerHaptic("light");
          break;
        case "success":
          playSuccessSound(ctx);
          if (withHaptic) triggerHaptic("medium");
          break;
        case "milestone":
          playMilestoneSound(ctx);
          if (withHaptic) triggerHaptic("success");
          break;
      }
    } catch (error) {
      console.warn("Sound effect failed:", error);
    }
  }, [getAudioContext]);

  return { playSound, triggerHaptic };
}

// Singleton for use outside React components
let globalAudioContext: AudioContext | null = null;

export const playSoundEffect = (type: SoundType, withHaptic = true) => {
  try {
    if (!globalAudioContext) {
      globalAudioContext = createAudioContext();
    }
    if (globalAudioContext.state === "suspended") {
      globalAudioContext.resume();
    }
    
    switch (type) {
      case "celebration":
        playCelebrationSound(globalAudioContext);
        if (withHaptic) triggerHaptic("success");
        break;
      case "cha-ching":
        playChaChingSound(globalAudioContext);
        if (withHaptic) triggerHaptic("heavy");
        break;
      case "notification":
        playNotificationSound(globalAudioContext);
        if (withHaptic) triggerHaptic("light");
        break;
      case "success":
        playSuccessSound(globalAudioContext);
        if (withHaptic) triggerHaptic("medium");
        break;
      case "milestone":
        playMilestoneSound(globalAudioContext);
        if (withHaptic) triggerHaptic("success");
        break;
    }
  } catch (error) {
    console.warn("Sound effect failed:", error);
  }
};
