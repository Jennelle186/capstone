import { useRef, type ReactNode } from "react";
import { motion, useInView, type Variants } from "framer-motion";
import { staggerContainer } from "./motion";

export default function AnimatedSection({
  children,
  className = "",
  variants = staggerContainer,
}: {
  children: ReactNode;
  className?: string;
  variants?: Variants;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={variants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

