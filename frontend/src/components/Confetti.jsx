import { useEffect, useState } from "react";
import { usePalette } from "@/hooks/useSystemTheme";

export const Confetti = () => {
  const p = usePalette();
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    const colors = [p.lime, p.teal, p.orange, p.danger, p.muted];
    const newPieces = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      size: 6 + Math.random() * 8,
    }));
    setPieces(newPieces);
  }, [p]);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="confetti-piece"
          style={{
            left: `${piece.left}%`,
            animationDelay: `${piece.delay}s`,
            backgroundColor: piece.color,
            width: `${piece.size}px`,
            height: `${piece.size}px`,
            transform: `rotate(${piece.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
};
