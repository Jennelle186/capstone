import { motion, useScroll, useTransform } from "motion/react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { fadeUp, stagger, liftHover } from "@/lib/motion";

const MotionButton = motion.create(Button);

export default function HomePage() {
  const { scrollY } = useScroll();
  const ySlow = useTransform(scrollY, [0, 600], [0, 24]);
  const yMedium = useTransform(scrollY, [0, 600], [0, 42]);
  const yFast = useTransform(scrollY, [0, 600], [0, 60]);

  return (
    <div className="bg-white">
      <section className="relative overflow-hidden bg-linear-to-b from-slate-50 via-white to-white">
        <motion.div
          style={{ y: ySlow }}
          className="pointer-events-none absolute -top-28 right-0 h-72 w-72 rounded-full bg-emerald-100/50 blur-3xl"
        />
        <motion.div
          style={{ y: yMedium }}
          className="pointer-events-none absolute -bottom-28 left-0 h-72 w-72 rounded-full bg-sky-100/50 blur-3xl"
        />
        <motion.div
          style={{ y: yFast }}
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(15,23,42,0.06),transparent_45%)]"
        />
        <motion.div
          style={{ y: ySlow }}
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(148,163,184,0.12)_0%,transparent_40%,rgba(226,232,240,0.6)_100%)]"
        />
        <motion.div
          style={{ y: yMedium }}
          className="pointer-events-none absolute inset-0 opacity-60 mask-[radial-gradient(circle_at_center,rgba(0,0,0,1),rgba(0,0,0,0))]"
        />

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="max-w-7xl mx-auto px-6 md:px-10 py-20 md:py-28"
        >
          <motion.p
            variants={fadeUp}
            className="text-xs uppercase tracking-[0.2em] text-slate-500"
          >
            College of Computing Studies - Western Mindanao State University
          </motion.p>
          <motion.h1
            variants={fadeUp}
            className="mt-4 text-3xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-slate-900"
          >
            Enrollment Document Management System for CCS
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className="mt-5 max-w-2xl text-base md:text-lg text-slate-600"
          >
            A web-based system for students, faculty, and administrative staff to submit,
            process, and verify enrollment documents. OCR-powered capture accelerates review,
            reduces manual errors, and maintains centralized academic records.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-10 flex flex-wrap gap-3">
            <MotionButton asChild whileTap={{ scale: 0.97 }}>
              <Link to="/auth/login">Login</Link>
            </MotionButton>
            <MotionButton
              asChild
              variant="outline"
              className="border-slate-300"
              whileTap={{ scale: 0.97 }}
            >
              <Link to="/auth/signup">Get Started</Link>
            </MotionButton>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mt-14 grid gap-6 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm md:grid-cols-3"
            layout
          >
            <motion.div whileHover={liftHover} layout>
              <p className="text-sm font-semibold text-slate-900">Document Intake</p>
              <p className="mt-2 text-sm text-slate-600">
                Upload enrollment requirements in PDF or image formats in one place.
              </p>
            </motion.div>
            <motion.div whileHover={liftHover} layout>
              <p className="text-sm font-semibold text-slate-900">OCR & Editing</p>
              <p className="mt-2 text-sm text-slate-600">
                Extract and validate document text before verification and approval.
              </p>
            </motion.div>
            <motion.div whileHover={liftHover} layout>
              <p className="text-sm font-semibold text-slate-900">Verification Flow</p>
              <p className="mt-2 text-sm text-slate-600">
                Teachers and advisers verify physical documents and approve submissions
                with audit-ready status tracking.
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.25 }}
        className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-20"
        aria-labelledby="features-title"
      >
        <motion.h2
          variants={fadeUp}
          id="features-title"
          className="text-2xl md:text-3xl font-semibold text-slate-900"
        >
          Key Features
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-3 max-w-2xl text-slate-600">
          Built for CCS operations with tools that reduce manual work and improve data accuracy.
        </motion.p>

        <motion.div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4" layout>
          {[
            {
              title: "Secure Document Intake",
              description: "Collect student requirements with role-based access.",
            },
            {
              title: "OCR Processing",
              description: "Automated text extraction to speed up data review.",
            },
            {
              title: "Physical Verification",
              description: "Teachers and advisers confirm physical copies before approval.",
            },
            {
              title: "Status Tracking",
              description: "Monitor pending, processing, and verified submissions.",
            },
          ].map((feature) => (
            <motion.div
              key={feature.title}
              variants={fadeUp}
              whileHover={liftHover}
              layout
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-semibold text-slate-900">{feature.title}</p>
              <p className="mt-2 text-sm text-slate-600">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.25 }}
        className="bg-slate-50"
        aria-labelledby="roles-title"
      >
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-20">
          <motion.h2
            variants={fadeUp}
            id="roles-title"
            className="text-2xl md:text-3xl font-semibold text-slate-900"
          >
            Designed for Every Role
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-3 max-w-2xl text-slate-600">
            A tailored experience for students and CCS advisers, with permissions aligned to school policy.
          </motion.p>

          <motion.div className="mt-8 grid gap-6 md:grid-cols-2" layout>
            <motion.div
              variants={fadeUp}
              whileHover={liftHover}
              layout
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-sm font-semibold text-slate-900">Students</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>Upload required documents and track submission status</li>
                <li>Review OCR results and edit before final submission</li>
                <li>Receive clear feedback after adviser verification</li>
              </ul>
            </motion.div>
            <motion.div
              variants={fadeUp}
              whileHover={liftHover}
              layout
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-sm font-semibold text-slate-900">Teachers & Advisers</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>Verify physical documents and confirm authenticity</li>
                <li>Approve or request corrections with documented notes</li>
                <li>Track progress for CCS administration</li>
              </ul>
            </motion.div>
          </motion.div>
        </div>
      </motion.section>

      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.25 }}
        className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-20"
        aria-labelledby="benefits-title"
      >
        <motion.h2
          variants={fadeUp}
          id="benefits-title"
          className="text-2xl md:text-3xl font-semibold text-slate-900"
        >
          Benefits for the Institution
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-3 max-w-2xl text-slate-600">
          Reduce administrative workload while improving data quality and compliance.
        </motion.p>

        <motion.div className="mt-8 grid gap-6 md:grid-cols-3" layout>
          {[
            {
              title: "Efficiency",
              description: "OCR and routing minimize manual data entry.",
            },
            {
              title: "Accuracy",
              description: "Structured editing and verification reduce errors.",
            },
            {
              title: "Centralized Records",
              description: "One secure repository for CCS enrollment documentation.",
            },
          ].map((benefit) => (
            <motion.div
              key={benefit.title}
              variants={fadeUp}
              whileHover={liftHover}
              layout
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-sm font-semibold text-slate-900">{benefit.title}</p>
              <p className="mt-2 text-sm text-slate-600">{benefit.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      <motion.section
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.25 }}
        className="border-t border-slate-200 bg-slate-50"
        aria-labelledby="cta-title"
      >
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 md:py-14 flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 id="cta-title" className="text-xl md:text-2xl font-semibold text-slate-900">
              Ready to streamline CCS enrollment verification?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Provide students and advisers with a secure, transparent workflow.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <MotionButton asChild whileTap={{ scale: 0.97 }}>
              <Link to="/auth/login">Login</Link>
            </MotionButton>
            <MotionButton
              asChild
              variant="outline"
              className="border-slate-300"
              whileTap={{ scale: 0.97 }}
            >
              <Link to="/auth/signup">Get Started</Link>
            </MotionButton>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
