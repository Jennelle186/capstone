import { useEffect } from "react";
import { useLocation } from "react-router";
import CtaSection from "@/components/landing/CtaSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import HeroSection from "@/components/landing/HeroSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import RolesSection from "@/components/landing/RolesSection";

export default function HomePage() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const element = document.getElementById(id);
    if (!element) return;

    const timeout = window.setTimeout(() => {
      element.scrollIntoView({ behavior: "smooth" });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [location.hash]);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <RolesSection />
      <CtaSection />
    </div>
  );
}

