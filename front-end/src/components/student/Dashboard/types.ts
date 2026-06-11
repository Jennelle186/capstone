export type Submission = {
  id: string;
  documentName: string;
  documentType: string;
  uploadDate: string;
  status: "verified" | "in-review" | "flagged" | "uploaded";
  fileType: string;
  fileSize: string;
};

export type SubmissionStatus = Submission["status"];

export const placeholderSubmissions: Submission[] = [
  {
    id: "1",
    documentName: "Official University Transcript - Fall 2023",
    documentType: "Academic Transcript",
    uploadDate: "Oct 14, 2023",
    status: "verified",
    fileType: "PDF",
    fileSize: "2.4 MB",
  },
  {
    id: "2",
    documentName: "Bachelor of Science Diploma",
    documentType: "Diploma",
    uploadDate: "Sep 28, 2023",
    status: "in-review",
    fileType: "PDF",
    fileSize: "1.8 MB",
  },
  {
    id: "3",
    documentName: "National ID Card - Front & Back",
    documentType: "Identity Document",
    uploadDate: "Aug 15, 2023",
    status: "verified",
    fileType: "Image",
    fileSize: "3.2 MB",
  },
  {
    id: "4",
    documentName: "Secondary School Certificate",
    documentType: "Academic Record",
    uploadDate: "Jul 20, 2023",
    status: "flagged",
    fileType: "PDF",
    fileSize: "1.1 MB",
  },
  {
    id: "5",
    documentName: "Certificate of Enrolment - 2024",
    documentType: "Enrolment Certificate",
    uploadDate: "Jun 5, 2024",
    status: "verified",
    fileType: "PDF",
    fileSize: "0.9 MB",
  },
  {
    id: "6",
    documentName: "Good Moral Character Certificate",
    documentType: "Character Reference",
    uploadDate: "May 22, 2024",
    status: "in-review",
    fileType: "Image",
    fileSize: "2.1 MB",
  },
  {
    id: "7",
    documentName: "Medical Clearance Form",
    documentType: "Medical Document",
    uploadDate: "Apr 10, 2024",
    status: "flagged",
    fileType: "PDF",
    fileSize: "1.5 MB",
  },
  {
    id: "8",
    documentName: "Birth Certificate (PSA)",
    documentType: "Identity Document",
    uploadDate: "Mar 3, 2024",
    status: "verified",
    fileType: "PDF",
    fileSize: "4.0 MB",
  },
];

export const statusConfig: Record<SubmissionStatus, { label: string; badge: string; dot: string }> = {
  verified: {
    label: "Verified",
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
  },
  "in-review": {
    label: "In Review",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
  },
  flagged: {
    label: "Flagged",
    badge: "bg-rose-100 text-rose-700",
    dot: "bg-rose-500",
  },
  uploaded: {
    label: "Uploaded",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
  },
};
