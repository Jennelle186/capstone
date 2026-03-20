import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, ClipboardList, Upload } from "lucide-react";
import AnimatedSection from "./AnimatedSection";
import { fadeInUp, staggerContainer } from "./motion";

const steps = [
  {
    icon: Upload,
    title: "Upload Your Documents",
    description:
      "Securely upload your CCS enrollment requirements and supporting files in one place.",
  },
  {
    icon: ClipboardList,
    title: "CCS Review & Verification",
    description:
      "CCS staff and advisers review submissions and request corrections when needed.",
  },
  {
    icon: Bell,
    title: "Get Notified",
    description:
      "Receive updates when your documents are approved, pending, or require changes.",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-24 py-24 px-4 bg-muted/30">
      <div className="max-w-6xl mx-auto">
        <AnimatedSection className="text-center mb-16">
          <motion.div variants={fadeInUp}>
            <Badge variant="outline" className="mb-4">
              Simple Process
            </Badge>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4"
          >
            How It Works
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            className="text-muted-foreground max-w-2xl mx-auto text-lg"
          >
            Three easy steps to complete your CCS enrollment submission
          </motion.p>
        </AnimatedSection>

        <AnimatedSection className="grid md:grid-cols-3 gap-8" variants={staggerContainer}>
          {steps.map((step, index) => (
            <motion.div key={step.title} variants={fadeInUp}>
              <Card className="group h-full border-0 shadow-lg hover:shadow-xl transition-all duration-500 bg-gradient-to-br from-card to-background overflow-hidden">
                <CardContent className="pt-8 pb-8 relative">
                  <motion.div
                    className="absolute top-4 right-4 w-10 h-10 rounded-full bg-primary flex items-center justify-center"
                    whileHover={{ scale: 1.1, rotate: 10 }}
                  >
                    <span className="text-sm font-bold text-primary-foreground">
                      {index + 1}
                    </span>
                  </motion.div>

                  <motion.div
                    className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors"
                    whileHover={{ rotate: [0, -10, 10, 0] }}
                    transition={{ duration: 0.5 }}
                  >
                    <step.icon className="w-8 h-8 text-primary" />
                  </motion.div>

                  <h3 className="text-xl font-semibold text-foreground mb-3">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatedSection>
      </div>
    </section>
  );
}

