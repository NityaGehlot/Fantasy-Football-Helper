// app/backend/utils/season.ts

// NFL seasons are labeled by the year they start; Jan-Feb games belong to the previous season.
export function getCurrentNFLSeason(date: Date = new Date()): number {
  return date.getMonth() + 1 >= 3 ? date.getFullYear() : date.getFullYear() - 1;
}
