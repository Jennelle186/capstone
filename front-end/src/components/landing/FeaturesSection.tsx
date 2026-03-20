import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, CheckCircle, FileText, Shield, Upload, Users } from "lucide-react";
import AnimatedSection from "./AnimatedSection";
import { fadeInUp, scaleIn, staggerContainer } from "./motion";

const features = [
  {
    icon: Upload,
    title: "Easy Document Upload",
    description: "Upload PDFs and images for your CCS enrollment requirements in a single portal.",
  },
  {
    icon: Shield,
    title: "Secure & Private",
    description: "Documents are protected and accessible only to authorized CCS personnel.",
  },
  {
    icon: CheckCircle,
    title: "Clear Status Updates",
    description: "Track progress and see what’s approved, under review, or needs changes.",
  },
  {
    icon: FileText,
    title: "Document Checklist",
    description: "Know exactly what’s required so you don’t miss any CCS enrollment item.",
  },
  {
    icon: Bell,
    title: "Notifications",
    description: "Get alerts when your documents move to the next step of verification.",
  },
  {
    icon: Users,
    title: "Support Workflow",
    description: "Students, advisers, and administrators stay aligned through one system.",
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-24 py-24 px-4 relative overflow-hidden">
      <motion.div
        className="absolute top-1/2 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-y-1/2"
        animate={{ x: [-50, 50, -50] }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      />

      <div className="max-w-6xl mx-auto relative">
        <AnimatedSection className="text-center mb-16">
          <motion.div variants={fadeInUp}>
            <Badge variant="outline" className="mb-4">
              Student Features
            </Badge>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4"
          >
            Everything You Need
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Tools designed to make your CCS enrollment workflow smooth and transparent
          </motion.p>
        </AnimatedSection>

        <AnimatedSection className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" variants={staggerContainer}>
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={scaleIn}
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="group h-full border-0 shadow-md hover:shadow-xl transition-all duration-500 bg-gradient-to-br from-card to-background">
                <CardContent className="pt-6">
                  <motion.div
                    className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors"
                    whileHover={{ rotate: 5 }}
                  >
                    <feature.icon className="w-7 h-7 text-primary" />
                  </motion.div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatedSection>
      </div>
    </section>
  );
}

