import type { TargetAndTransition, Variants } from "motion";

/// Motion variants for Framer Motion animations
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: "easeOut" },
  },
};

// Staggered animation for child elements
export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.08 } },
};

// Hover effect to lift the element slightly and add a subtle scale
export const liftHover: TargetAndTransition = {
  y: -6,
  scale: 1.01,
  transition: { type: "spring", stiffness: 220, damping: 22 },
};
