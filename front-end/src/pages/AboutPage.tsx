import { motion } from "motion/react";
import { fadeUp, stagger } from "@/lib/motion";

export default function AboutPage() {
  return (
    <main className="bg-white">
      <section className="border-b border-slate-200 bg-slate-50">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="max-w-5xl mx-auto px-6 md:px-10 py-16 md:py-20"
        >
          <motion.p
            variants={fadeUp}
            className="text-xs uppercase tracking-[0.2em] text-slate-500"
          >
            College of Computing Studies
          </motion.p>
          <motion.h1
            variants={fadeUp}
            className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight text-slate-900"
          >
            About the College of Computing Studies
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-4 text-base text-slate-600">
            The College of Computing Studies (CCS) of Western Mindanao State University
            advances academic excellence in computing, information technology, and
            applied digital innovation.
          </motion.p>
        </motion.div>
      </section>

      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        className="max-w-5xl mx-auto px-6 md:px-10 py-14 md:py-16"
        aria-labelledby="ccs-mission"
      >
        <motion.h2
          variants={fadeUp}
          id="ccs-mission"
          className="text-2xl font-semibold text-slate-900"
        >
          Academic Excellence and Innovation
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-3 text-slate-600">
          CCS cultivates responsible computing professionals who value integrity,
          precision, and innovation. The college emphasizes ethical use of technology
          to improve academic processes and support institutional growth.
        </motion.p>
      </motion.section>

      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        className="max-w-5xl mx-auto px-6 md:px-10 py-14 md:py-16"
        aria-labelledby="system-purpose"
      >
        <motion.h2
          variants={fadeUp}
          id="system-purpose"
          className="text-2xl font-semibold text-slate-900"
        >
          Purpose of the Enrollment Document Management System
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-3 text-slate-600">
          The Enrollment Document Management System supports CCS digital
          transformation by streamlining document intake, OCR-based processing, and
          verification workflows. It improves administrative efficiency, ensures data
          accuracy, and preserves the integrity of academic records.
        </motion.p>
      </motion.section>

      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        className="max-w-5xl mx-auto px-6 md:px-10 pb-16 md:pb-20"
        aria-labelledby="data-commitment"
      >
        <motion.h2
          variants={fadeUp}
          id="data-commitment"
          className="text-2xl font-semibold text-slate-900"
        >
          Commitment to Responsible Data Handling
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-3 text-slate-600">
          CCS upholds responsible use of computing systems through secure access
          controls, accurate recordkeeping, and compliance with institutional and
          national data protection standards. The system is designed to protect
          student and faculty information while enabling timely academic administration.
        </motion.p>
      </motion.section>
    </main>
  );
}
