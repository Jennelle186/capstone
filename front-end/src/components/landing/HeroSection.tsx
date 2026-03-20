import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChevronRight,
  FileText,
  GraduationCap,
  Sparkles,
  Upload,
} from "lucide-react";
import { fadeInUp, staggerContainer } from "./motion";

export default function HeroSection() {
  const heroRef = useRef<HTMLElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const heroY = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.95]);
  const mockupY = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const mockupRotate = useTransform(scrollYProgress, [0, 1], [0, -3]);

  return (
    <section
      ref={heroRef}
      className="relative min-h-screen pt-32 pb-20 px-4 overflow-hidden"
    >
      <motion.div className="absolute inset-0 -z-10" style={{ y: heroY, opacity: heroOpacity }}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-background" />
        <motion.div
          className="absolute top-20 right-20 w-72 h-72 bg-primary/10 rounded-full blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-40 left-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl"
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[70vh]">
          <motion.div
            style={{ y: heroY, opacity: heroOpacity }}
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp} className="flex items-center gap-2 mb-6">
              <motion.div
                className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full"
                whileHover={{ scale: 1.05 }}
              >
                <GraduationCap className="w-4 h-4 text-primary" />
                <span className="text-sm text-primary font-medium">CCS Students • WMSU</span>
              </motion.div>
            </motion.div>

            <motion.h1
              variants={fadeInUp}
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-6"
            >
              Your Enrollment, <span className="text-primary">Simplified</span>
            </motion.h1>

            <motion.p variants={fadeInUp} className="text-lg text-muted-foreground mb-8 max-w-lg">
              Welcome to the College of Computing Studies (CCS) enrollment document portal of
              Western Mindanao State University. Upload requirements, track status, and stay
              informed every step of the way.
            </motion.p>

            <motion.div variants={fadeInUp} className="flex flex-wrap gap-4">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button asChild variant="default" size="lg" className="shadow-lg shadow-primary/25">
                  <Link to="/auth/login">
                    Access Your Portal
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button asChild variant="outline" size="lg">
                  <a href="#features">Learn More</a>
                </Button>
              </motion.div>
            </motion.div>

            <motion.div variants={fadeInUp} className="flex gap-8 mt-12">
              {[
                { value: "Role-Based", label: "Access Control" },
                { value: "Secure", label: "Uploads & Storage" },
                { value: "Clear", label: "Status Tracking" },
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 + index * 0.1 }}
                >
                  <div className="text-2xl font-bold text-primary">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            style={{ y: mockupY, rotate: mockupRotate, scale: heroScale }}
            initial={{ opacity: 0, x: 100, rotate: 5 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          >
            <motion.div whileHover={{ scale: 1.02, rotate: 1 }} transition={{ duration: 0.3 }}>
              <Card className="border border-border shadow-2xl bg-gradient-to-br from-card to-background backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 4, repeat: Infinity }}
                    >
                      <Upload className="w-5 h-5 text-primary" />
                    </motion.div>
                    <div>
                      <CardTitle className="text-base">Your Documents</CardTitle>
                      <p className="text-xs text-muted-foreground">CCS Enrollment</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { name: "birth_certificate.pdf", status: "Approved", variant: "default" as const },
                      { name: "report_card.pdf", status: "Under Review", variant: "secondary" as const },
                      { name: "medical_certificate.pdf", status: "Pending", variant: "outline" as const },
                    ].map((file, index) => (
                      <motion.div
                        key={file.name}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + index * 0.1 }}
                        whileHover={{ x: 5, backgroundColor: "hsl(var(--primary)/0.1)" }}
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-primary" />
                          <span className="text-sm">{file.name}</span>
                        </div>
                        <Badge
                          variant={file.variant}
                          className={file.status === "Approved" ? "bg-primary text-primary-foreground" : ""}
                        >
                          {file.status}
                        </Badge>
                      </motion.div>
                    ))}
                  </div>
                  <motion.div
                    className="mt-4 flex items-center justify-between"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.9 }}
                  >
                    <span className="text-xs text-muted-foreground">1 of 3 documents approved</span>
                    <div className="flex items-center gap-2">
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                        <Sparkles className="w-4 h-4 text-primary" />
                      </motion.div>
                      <span className="text-xs text-primary">In Progress</span>
                    </div>
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              className="absolute -top-4 -right-4 w-16 h-16 bg-primary/20 rounded-xl backdrop-blur-sm border border-primary/20"
              animate={{ y: [0, -10, 0], rotate: [0, 5, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute -bottom-6 -left-6 w-12 h-12 bg-primary/15 rounded-full backdrop-blur-sm"
              animate={{ y: [0, 10, 0], scale: [1, 1.1, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            />
          </motion.div>
        </div>
      </div>

      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="w-6 h-10 border-2 border-primary/30 rounded-full flex justify-center pt-2">
          <motion.div
            className="w-1.5 h-1.5 bg-primary rounded-full"
            animate={{ y: [0, 12, 0], opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
      </motion.div>
    </section>
  );
}

