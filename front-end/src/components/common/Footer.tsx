import { motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router";
import { Separator } from "@/components/ui/separator";
import AnimatedSection from "@/components/landing/AnimatedSection";
import { slideInLeft, slideInRight } from "@/components/landing/motion";
import { School } from "lucide-react";

const navItems = ["features", "how-it-works", "roles"] as const;

export default function Footer() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const scrollToSection = (id: (typeof navItems)[number]) => {
    if (pathname === "/") {
      const element = document.getElementById(id);
      if (element) element.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate(`/#${id}`);
    }
  };

  return (
    <footer className="py-16 px-4 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <AnimatedSection className="grid md:grid-cols-2 gap-8 mb-8">
          <motion.div variants={slideInLeft}>
            <motion.div className="flex items-center gap-3 mb-4" whileHover={{ x: 5 }}>
              <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                <School className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <span className="font-bold text-xl text-foreground block">
                  College of Computing Studies
                </span>
                <span className="text-sm text-muted-foreground">
                  Western Mindanao State University
                </span>
              </div>
            </motion.div>
            <p className="text-muted-foreground max-w-sm">
              A secure enrollment document management portal for CCS students, advisers, and
              administrators.
            </p>
          </motion.div>

          <motion.div variants={slideInRight} className="flex flex-wrap gap-6 md:justify-end items-start">
            {navItems.map((item) => (
              <motion.button
                key={item}
                onClick={() => scrollToSection(item)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                whileHover={{ y: -2 }}
                type="button"
              >
                {item
                  .split("-")
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(" ")}
              </motion.button>
            ))}

            <motion.div whileHover={{ y: -2 }}>
              <Link
                to="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Student Login
              </Link>
            </motion.div>
          </motion.div>
        </AnimatedSection>

        <motion.div
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <Separator className="mb-8" />
        </motion.div>

        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          viewport={{ once: true }}
        >
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} College of Computing Studies, WMSU. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Enrollment Document Management System
          </p>
        </motion.div>
      </div>
    </footer>
  );
}

