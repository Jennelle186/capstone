import { motion } from "motion/react";
import { fadeUp } from "@/lib/motion";

export default function TermsPage() {
  return (
    <main className="bg-white">
      <section className="border-b border-slate-200 bg-slate-50">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="max-w-5xl mx-auto px-6 md:px-10 py-16 md:py-20"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Terms and Conditions
          </p>
          <h1 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
            Data Privacy Act Compliance
          </h1>
          <p className="mt-4 text-base text-slate-600">
            This system complies with the Philippine Data Privacy Act of 2012
            (Republic Act No. 10173). The terms below explain how enrollment
            information is collected, processed, and protected.
          </p>
        </motion.div>
      </section>

      <div className="max-w-5xl mx-auto px-6 md:px-10 py-14 md:py-16 space-y-10">
        <section aria-labelledby="data-collection">
          <h2 id="data-collection" className="text-xl font-semibold text-slate-900">
            Data Collection and Usage
          </h2>
          <p className="mt-3 text-slate-600">
            The Enrollment Document Management System collects personal and academic
            information for enrollment purposes only. Data is used to validate
            requirements, confirm eligibility, and support academic administration.
          </p>
        </section>

        <section aria-labelledby="protection">
          <h2 id="protection" className="text-xl font-semibold text-slate-900">
            Data Protection and Security
          </h2>
          <p className="mt-3 text-slate-600">
            Data is stored in secure systems with access controls, encryption in transit, and
            restricted administrative access. Regular reviews aim to prevent unauthorized use,
            alteration, or disclosure.
          </p>
        </section>

        <section aria-labelledby="ocr-processing">
          <h2 id="ocr-processing" className="text-xl font-semibold text-slate-900">
            OCR Processing of Uploaded Documents
          </h2>
          <p className="mt-3 text-slate-600">
            Uploaded documents are processed using OCR to convert text into a digital
            format. OCR outputs are reviewed to improve accuracy and to reduce manual
            transcription errors.
          </p>
        </section>

        <section aria-labelledby="storage-retention">
          <h2 id="storage-retention" className="text-xl font-semibold text-slate-900">
            Data Storage and Retention
          </h2>
          <p className="mt-3 text-slate-600">
            Enrollment records are stored securely and retained only for the period
            required by institutional policies and applicable regulations. Access is
            limited to authorized CCS personnel.
          </p>
        </section>

        <section aria-labelledby="responsibilities">
          <h2 id="responsibilities" className="text-xl font-semibold text-slate-900">
            User Responsibilities
          </h2>
          <p className="mt-3 text-slate-600">
            Users are responsible for providing accurate information, submitting
            legitimate documents, and protecting their access credentials. Any misuse
            of the system or unauthorized sharing of access may lead to administrative
            action.
          </p>
        </section>

        <section aria-labelledby="access-control">
          <h2 id="access-control" className="text-xl font-semibold text-slate-900">
            Access Control and Authorization
          </h2>
          <p className="mt-3 text-slate-600">
            Access is role-based and limited to students, faculty, advisers, and
            authorized administrative staff. The system applies safeguards to protect
            against unauthorized access, disclosure, or misuse of personal data.
          </p>
        </section>

        <section aria-labelledby="data-rights">
          <h2 id="data-rights" className="text-xl font-semibold text-slate-900">
            Respect for Data Subject Rights
          </h2>
          <p className="mt-3 text-slate-600">
            CCS respects the rights of students and faculty under the Data Privacy
            Act, including the right to be informed, to access, and to correct personal
            information as permitted by law and institutional policy.
          </p>
        </section>

        <section aria-labelledby="ra10173">
          <h2 id="ra10173" className="text-xl font-semibold text-slate-900">
            Compliance with RA 10173 (Data Privacy Act of 2012)
          </h2>
          <p className="mt-3 text-slate-600">
            CCS commits to the principles of transparency, legitimate purpose, and proportionality.
            Requests to exercise data rights under RA 10173 will be honored in accordance with
            university policies and applicable regulations.
          </p>
        </section>
      </div>
    </main>
  );
}
