import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ClipboardList, Settings, Users } from "lucide-react";
import AnimatedSection from "./AnimatedSection";
import { fadeInUp, staggerContainer } from "./motion";

const roles = [
  {
    icon: Users,
    badge: "You",
    title: "Student",
    items: [
      "Upload required enrollment documents",
      "Track your submission status",
      "Receive review and correction feedback",
      "Complete your CCS enrollment requirements",
    ],
  },
  {
    icon: ClipboardList,
    badge: "CCS",
    title: "Advisers & Staff",
    items: [
      "Review submitted documents",
      "Verify requirements and authenticity",
      "Request corrections when needed",
      "Approve eligible submissions",
    ],
  },
  {
    icon: Settings,
    badge: "Admin",
    title: "CCS Administration",
    items: [
      "Oversee enrollment processing",
      "Manage accounts and permissions",
      "Generate enrollment reports",
      "Ensure system security and compliance",
    ],
  },
];

export default function RolesSection() {
  return (
    <section id="roles" className="scroll-mt-24 py-24 px-4 bg-muted/30">
      <div className="max-w-6xl mx-auto">
        <AnimatedSection className="text-center mb-16">
          <motion.div variants={fadeInUp}>
            <Badge variant="outline" className="mb-4">
              Who's Involved
            </Badge>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4"
          >
            Your Support Team
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Meet the people who will guide you through CCS enrollment verification
          </motion.p>
        </AnimatedSection>

        <AnimatedSection className="grid md:grid-cols-3 gap-8" variants={staggerContainer}>
          {roles.map((role) => (
            <motion.div key={role.title} variants={fadeInUp} whileHover={{ y: -10 }}>
              <Card className="group h-full border-0 shadow-lg hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-card to-background overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/50 to-primary" />
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between mb-4">
                    <motion.div
                      className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                    >
                      <role.icon className="w-7 h-7 text-primary" />
                    </motion.div>
                    <Badge className="bg-primary text-primary-foreground px-3 py-1">{role.badge}</Badge>
                  </div>
                  <CardTitle className="text-2xl">{role.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-4">
                    {role.items.map((item, index) => (
                      <motion.li
                        key={item}
                        className="flex items-start gap-3 text-muted-foreground"
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 * index }}
                        viewport={{ once: true }}
                      >
                        <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <span>{item}</span>
                      </motion.li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatedSection>
      </div>
    </section>
  );
}

