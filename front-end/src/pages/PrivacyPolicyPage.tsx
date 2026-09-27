import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { fadeUp } from "@/lib/motion";
import { API_BASE_URL } from "@/config/api";
import { FileText, Lock, Search, ShieldCheck } from "lucide-react";

interface ExtractedField {
  key: string;
  description: string;
  type: string;
  options?: string[] | null;
}

interface RequiredDocument {
  name: string;
  code: string;
  description: string;
  extractedFields: ExtractedField[];
}

interface ActiveSchoolYear {
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface PrivacyInfo {
  activeSchoolYear: ActiveSchoolYear | null;
  requiredDocuments: RequiredDocument[];
}

const staticSections = [
  {
    id: "introduction",
    title: "Introduction",
    body:
      "The College of Computing Studies (CCS) operates the Enrollment Document Management System to process student enrollment requirements. This Privacy Policy explains what personal information we collect, how we process it, and the measures we take to protect it, in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173).",
  },
  {
    id: "automated-processing",
    title: "Automated Processing of Your Documents",
    body:
      "Uploaded documents are processed using optical character recognition (OCR) and AI-assisted classification and data extraction to convert them into structured, verifiable records. Classification assigns each document to a document type, while extraction reads the specific fields described below. Every automated result is reviewed and verified by an academic adviser before it is accepted as part of your record.",
  },
  {
    id: "usage",
    title: "How We Use Your Information",
    body:
      "The information we collect is used solely for enrollment purposes: to verify eligibility, confirm the authenticity of submitted requirements, maintain accurate academic records, and support academic administration. We do not use your personal information for purposes unrelated to these functions.",
  },
  {
    id: "storage-security",
    title: "Storage and Security",
    body:
      "Documents and extracted data are stored in secure cloud storage with encryption in transit and at rest. Access is role-based and restricted to you, your assigned academic adviser, and authorized administrative staff. Regular safeguards are applied to prevent unauthorized access, alteration, or disclosure.",
  },
  {
    id: "retention",
    title: "Data Retention",
    body:
      "Enrollment records are retained only for the period required by institutional policy and applicable regulations. Once the retention period has lapsed, records are disposed of or anonymized in a secure manner.",
  },
  {
    id: "sharing",
    title: "Data Sharing and Disclosure",
    body:
      "CCS does not sell or rent your personal information. Data is shared only with authorized CCS personnel in the course of their duties and, where required, with regulatory authorities in compliance with applicable law.",
  },
  {
    id: "rights",
    title: "Your Rights Under RA 10173",
    body:
      "As a data subject, you have the right to be informed, to access your personal data, to correct or rectify inaccuracies, to object to processing, and to request erasure or blocking under the Data Privacy Act of 2012. To exercise these rights, contact the CCS Data Protection Officer through the college administration office.",
  },
  {
    id: "changes",
    title: "Changes to This Policy",
    body:
      "We may update this Privacy Policy from time to time to reflect changes in our practices or legal obligations. The most recent version is always published on this page. Significant changes will be communicated through the system.",
  },
];

const fieldTypeLabels: Record<string, string> = {
  string: "Text",
  number: "Number",
  integer: "Whole number",
  boolean: "Yes / No",
  select: "Choice",
  "multi-select": "Multiple choice",
};

export default function PrivacyPolicyPage() {
  const [privacyInfo, setPrivacyInfo] = useState<PrivacyInfo | null>(null);
  const [privacyError, setPrivacyError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/public/privacy-info`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load"))))
      .then((data: PrivacyInfo | null) => {
        if (!cancelled && data) setPrivacyInfo(data);
      })
      .catch(() => {
        if (!cancelled) setPrivacyError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const documents = privacyInfo?.requiredDocuments ?? [];
  const schoolYear = privacyInfo?.activeSchoolYear ?? null;
  const hasDynamicData = documents.length > 0;

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
            Privacy Policy
          </p>
          <h1 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
            How We Protect Your Information
          </h1>
          <p className="mt-4 text-base text-slate-600">
            This policy explains how the College of Computing Studies (CCS)
            collects, processes, and protects the personal information you
            submit through the Enrollment Document Management System. It
            complies with the Philippine Data Privacy Act of 2012 (RA 10173).
          </p>
        </motion.div>
      </section>

      <div className="max-w-5xl mx-auto px-6 md:px-10 py-14 md:py-16 space-y-12">
        {schoolYear && (
          <motion.section
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4"
          >
            <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm text-slate-700">
              This policy reflects the{" "}
              <span className="font-semibold text-slate-900">
                {schoolYear.name}
              </span>{" "}
              enrollment cycle. The document requirements listed below may
              change for future school years.
            </p>
          </motion.section>
        )}

        <motion.section
          id="information-we-collect"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
        >
          <h2 className="text-xl font-semibold text-slate-900">
            Information We Collect
          </h2>
          <p className="mt-3 text-slate-600">
            We collect the personal information you provide when creating your
            account (your name, email address, and student number) together
            with the academic documents you submit for enrollment. For the
            current school year, the system requires the following documents:
          </p>

          {hasDynamicData ? (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {documents.map((doc) => (
                <li
                  key={doc.code}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-slate-900">{doc.name}</p>
                      {doc.description ? (
                        <p className="mt-1 text-sm text-slate-600">
                          {doc.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : privacyError ? (
            <p className="mt-5 text-sm text-red-600">
              Unable to load document requirements. Please refresh the page or
              try again later.
            </p>
          ) : (
            <p className="mt-5 text-sm text-slate-500">
              Document requirements for the current enrollment cycle are being
              prepared. Please check back once enrollment opens.
            </p>
          )}
        </motion.section>

        {hasDynamicData && (
          <motion.section
            id="data-extracted"
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
          >
            <h2 className="text-xl font-semibold text-slate-900">
              Data Extracted From Your Documents
            </h2>
            <p className="mt-3 text-slate-600">
              For each document type, our system reads the following fields to
              verify your enrollment eligibility. All extracted values are
              reviewed by an academic adviser before they are accepted.
            </p>

            <div className="mt-5 space-y-6">
              {documents.map((doc) => (
                <div
                  key={doc.code}
                  className="rounded-xl border border-slate-200 p-5"
                >
                  <p className="font-semibold text-slate-900">{doc.name}</p>
                  {doc.extractedFields.length > 0 ? (
                    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                      {doc.extractedFields.map((field) => (
                        <li
                          key={field.key}
                          className="flex items-start gap-3"
                        >
                          <Search className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              {field.description || field.key}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {fieldTypeLabels[field.type] ?? field.type}
                              {field.options && field.options.length > 0
                                ? `: ${field.options.join(", ")}`
                                : ""}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">
                      This document is collected for verification purposes and
                      no structured data is extracted from it.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.section>
        )}

        <motion.section
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4"
        >
          <Lock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <p className="text-sm text-slate-700">
            We apply encryption and role-based access controls at every stage of
            the verification process so your information is only ever visible to
            you, your adviser, and authorized CCS staff.
          </p>
        </motion.section>

        <div className="space-y-10">
          {staticSections.map((section) => (
            <motion.section
              key={section.id}
              id={section.id}
              layout
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
            >
              <h2 className="text-xl font-semibold text-slate-900">
                {section.title}
              </h2>
              <p className="mt-3 text-slate-600">{section.body}</p>
            </motion.section>
          ))}
        </div>
      </div>
    </main>
  );
}
