import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { motion, useSpring, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";

const navItems = ["features", "how-it-works", "roles"] as const;

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isSmallScreen = useMediaQuery("(max-width: 767px)");
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const springConfig = { stiffness: 100, damping: 30, restDelta: 0.001 };
  const navbarBg = useSpring(
    isScrolled || isSmallScreen || isMobileMenuOpen ? 1 : 0,
    springConfig,
  );
  const forceSolidNavbar = isSmallScreen || isMobileMenuOpen;

  const animatedBackgroundColor = useTransform(
    navbarBg,
    [0, 1],
    ["rgba(255,255,255,0)", "rgba(255,255,255,0.92)"],
  );
  const animatedBackdropFilter = useTransform(navbarBg, [0, 1], ["blur(0px)", "blur(12px)"]);
  const animatedBorderBottom = useTransform(
    navbarBg,
    [0, 1],
    ["1px solid transparent", "1px solid hsl(var(--border))"],
  );

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: (typeof navItems)[number]) => {
    if (pathname === "/") {
      const element = document.getElementById(id);
      if (element) element.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate(`/#${id}`);
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      style={{
        backgroundColor: forceSolidNavbar
          ? "hsl(var(--background))"
          : animatedBackgroundColor,
        backdropFilter: forceSolidNavbar ? "blur(12px)" : animatedBackdropFilter,
        borderBottom: forceSolidNavbar ? "1px solid hsl(var(--border))" : animatedBorderBottom,
      }}
    >
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <motion.div
            className="flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-white border border-border flex items-center justify-center p-1">
                <img
                  src="/ccs-logo.jpg"
                  alt="CCS logo"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm text-foreground leading-tight">
                  CCS • WMSU
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  Enrollment Portal
                </span>
              </div>
            </Link>
          </motion.div>

          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item, index) => (
              <motion.button
                key={item}
                onClick={() => scrollToSection(item)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors relative"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index + 0.3 }}
                whileHover={{ y: -2 }}
                type="button"
              >
                {item
                  .split("-")
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(" ")}
              </motion.button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
            >
              <Button asChild variant="default" size="sm" className="hidden md:flex">
                <Link to="/auth/login">Login</Link>
              </Button>
            </motion.div>

            <motion.button
              className="md:hidden p-2"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              whileTap={{ scale: 0.9 }}
              type="button"
              aria-label="Toggle menu"
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-foreground" />
              ) : (
                <Menu className="w-5 h-5 text-foreground" />
              )}
            </motion.button>
          </div>
        </div>

        <motion.div
          initial={false}
          animate={{
            height: isMobileMenuOpen ? "auto" : 0,
            opacity: isMobileMenuOpen ? 1 : 0,
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="md:hidden overflow-hidden bg-background"
        >
          <div className="py-4 border-t border-border">
            <div className="flex flex-col gap-4">
              {navItems.map((item, index) => (
                <motion.button
                  key={item}
                  onClick={() => scrollToSection(item)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{
                    opacity: isMobileMenuOpen ? 1 : 0,
                    x: isMobileMenuOpen ? 0 : -20,
                  }}
                  transition={{ delay: 0.05 * index }}
                  type="button"
                >
                  {item
                    .split("-")
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(" ")}
                </motion.button>
              ))}

              <Button asChild variant="default" size="sm" className="w-full">
                <Link to="/auth/login" onClick={() => setIsMobileMenuOpen(false)}>
                  Login
                </Link>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.nav>
  );
}
