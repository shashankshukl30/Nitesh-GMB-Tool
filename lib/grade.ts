// Score → letter grade. Extracted so the scoring engine carries no dependency
// on any wider audit toolkit — this is the only piece it ever used.

export type Grade = "A+" | "A" | "B" | "C" | "D" | "F";

export function scoreToGrade(score: number): Grade {
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}
