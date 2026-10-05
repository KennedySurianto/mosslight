export interface GuideProgress {
  moved: boolean;
  jumped: boolean;
  mined: boolean;
  collected: boolean;
  backpack: boolean;
}
export interface GuideStats {
  broken: number;
  placed: number;
  planted: number;
  harvested: number;
}
export const GUIDE_KEYS = [
  "moved",
  "jumped",
  "mined",
  "collected",
  "backpack",
] as const;
export function initialGuide(
  saved: GuideProgress | undefined,
  stats: GuideStats,
): GuideProgress {
  if (saved) return { ...saved };
  // Existing accomplished worlds should not be forced to redo the introduction.
  const experienced =
    stats.placed > 0 || stats.planted > 0 || stats.harvested > 0;
  return {
    moved: experienced,
    jumped: experienced,
    mined: stats.broken > 0,
    collected: stats.broken > 0,
    backpack: experienced,
  };
}
export function guideSteps(progress: GuideProgress, stats: GuideStats) {
  return [
    {
      title: "Move & jump",
      done: progress.moved && progress.jumped,
      help: "Walk with A / D and jump with W. Touch a wooden sign to read its tip.",
    },
    {
      title: "Break & collect",
      done: progress.mined && progress.collected,
      help: progress.mined
        ? "Walk over the dropped resources to collect them."
        : "Hold left click on nearby earth or grass to break a block. Then walk over its drops.",
    },
    {
      title: "Open your backpack",
      done: progress.backpack,
      help: "Drag the handle above the hotbar upward, or press E. Drag stacks between slots to organize them.",
    },
    {
      title: "Place a block",
      done: stats.placed > 0,
      help: "Select Earth or Cedar wood in your hotbar. Right click an empty nearby tile. Clear any foliage first.",
    },
    {
      title: "Plant a seed",
      done: stats.planted > 0,
      help: "Select the cedar seed in your hotbar. Right click an empty tile directly above earth or grass.",
    },
    {
      title: "Grow & harvest",
      done: stats.harvested > 0,
      help: "Wait 45 seconds for your cedar tree to mature. Left click its trunk to harvest. Hover to see the time left.",
    },
  ];
}
