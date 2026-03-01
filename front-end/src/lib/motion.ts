import type { TargetAndTransition, Variants } from "motion";

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: "easeOut" },
  },
};

export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.08 } },
};

export const liftHover: TargetAndTransition = {
  y: -6,
  scale: 1.01,
  transition: { type: "spring", stiffness: 220, damping: 22 },
};
