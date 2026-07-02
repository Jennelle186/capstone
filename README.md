# Enrolment Document Management System

An AI-powered document management platform for academic institutions that automates the submission, classification, extraction, and verification of enrolment documents.

Students upload enrolment documents (e.g., birth certificates, report cards, admission forms), which are automatically classified and processed using artificial intelligence. Advisers review and verify submissions, while administrators configure school years, document requirements, and extraction schemas.

---

# Development Status

This repository contains the implementation of an ongoing Master's Capstone Project in Information Technology.

The project is currently under active development, with new features being implemented, evaluated, and validated before integration into the stable codebase. The repository follows a branch-based development workflow to maintain code quality and support iterative system enhancement.

While the `main` branch contains the latest stable implementation, active development is performed in dedicated feature and experimental branches.

---

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [System Workflow](#system-workflow)
- [User Roles](#user-roles)
- [Submission Lifecycle](#submission-lifecycle)
- [System Design Decisions](#system-design-decisions)
- [Security Considerations](#security-considerations)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [Authentication](#authentication)
- [AI Processing Pipeline](#ai-processing-pipeline)
- [Branch Overview](#branch-overview)
- [Research Contributions](#research-contributions)
- [Future Work](#future-work)
- [License](#license)

---

# Features

- AI-powered document classification
- Automated field extraction
- Student document submission portal
- Adviser document verification workflow
- Administrative management dashboard
- Google Cloud Storage integration
- Role-based authentication using Clerk
- Submission analytics and reporting
- Complete document audit trail
- Configurable AI extraction schemas

---

# Technology Stack

## Frontend

- React 19
- TypeScript 5.9
- Vite 7
- Tailwind CSS v4
- shadcn/ui
- Radix UI
- Clerk Authentication
- React Router v7
- React Hook Form
- Zod
- TanStack React Table
- Framer Motion
- Recharts
- Sonner
- Lucide React

## Backend

- Python 3.10+
- FastAPI
- SQLAlchemy 2.0 (Async)
- PostgreSQL
- asyncpg
- Alembic
- Clerk JWT Authentication

## AI Pipeline

- Google Vertex AI (Gemini 2.5 Flash)
- AI-powered document classification
- AI field extraction
- Schema blueprint generation
- Google Cloud Storage
- Ollama (Optional, for local processing)
- IBM Granite Docling
- Qwen2.5:3B

---

# System Architecture

```text
                        +------------------+
                        |     Student      |
                        +------------------+
                                 |
                                 |
                        React Frontend
                                 |
                                 |
                         FastAPI Backend
          +----------------------+----------------------+
          |                      |                      |
          |                      |                      |
     PostgreSQL         Google Cloud Storage     Clerk Authentication
          |                      |
          +-----------+----------+
                      |
               Vertex AI Gemini
      (Classification & Extraction)
```

The system follows a layered architecture. The React frontend communicates with the FastAPI backend over a REST API secured by Clerk-issued JWTs. The backend orchestrates document storage in Google Cloud Storage, persists structured data in PostgreSQL, and delegates classification and extraction tasks to Vertex AI Gemini.

---

# System Workflow

```text
Student
 |
 v
Upload Documents
 |
 v
AI Classification
 |
 v
Student Confirmation
 |
 v
AI Field Extraction
 |
 v
Submission
 |
 v
Adviser Review
 |
 +------------------+
 |                  |
 v                  v
Verified         Flagged
                    |
                    v
             Student Re-upload
```

---

# User Roles

## Student

- Register and authenticate using Clerk
- Upload enrolment documents
- Review AI classification results
- Correct document classifications before submission
- View extracted document information
- Track submission status
- Receive notifications
- Replace flagged submissions

## Adviser

- Review submitted documents
- Verify or reject submissions
- View extracted document information
- Monitor student submissions
- Access analytics dashboard
- Review submission history

## Administrator

- Manage school years
- Configure departments
- Assign advisers
- Manage document types
- Configure extraction schemas
- Configure document requirements
- Generate institutional reports

---

# Submission Lifecycle

```mermaid
graph TD
PENDING[PENDING]
UPLOADED[UPLOADED]
PROCESSING[PROCESSING]
CLASSIFIED[CLASSIFIED]
SUBMITTED[SUBMITTED]
IN_REVIEW[IN REVIEW]
VERIFIED[VERIFIED]
FLAGGED[FLAGGED]

PENDING --> UPLOADED
UPLOADED --> PROCESSING
PROCESSING --> CLASSIFIED
CLASSIFIED --> SUBMITTED
SUBMITTED --> IN_REVIEW
IN_REVIEW --> VERIFIED
CLASSIFIED -->|Low Confidence| FLAGGED
IN_REVIEW -->|Rejected| FLAGGED
FLAGGED -->|Student Re-upload| UPLOADED

style VERIFIED fill:#d4edda
style FLAGGED fill:#f8d7da
```

---

# System Design Decisions

## Audit Trail

Every document submission is versioned. Re-uploading creates a new submission while preserving previous versions using:

- `parent_submission_id`
- Document submission history

## Cost Optimization

Duplicate document detection is performed before AI extraction to reduce unnecessary processing costs.

## Immutable Verified Documents

Verified document types cannot be replaced. Validation is enforced on both the frontend and backend.

## No Hard Deletes

Flagged submissions are retained in the database to preserve audit history.

## Complete History

Every document state transition is recorded in the `DocumentSubmissionHistory` table.

---

# Security Considerations

The system incorporates several security mechanisms:

- Clerk Authentication with JWT verification
- Role-Based Access Control (Student, Adviser, Administrator)
- Signed URLs for secure document uploads
- Validation of uploaded file types
- Immutable verified submissions
- Complete audit logging
- Server-side authorization for all protected resources

---

# Project Structure

```text
backend/
|
+-- app/
|   +-- api.py
|   +-- models.py
|   +-- auth.py
|   +-- rbac.py
|   |
|   +-- routers/
|   |   +-- documents/
|   |   +-- admin/
|   |   +-- adviser.py
|   |   +-- notifications.py
|   |   +-- users.py
|   |
|   +-- services/
|       +-- gcp_pipeline.py
|       +-- gcp_storage.py
|       +-- processor.py
|       +-- submissions.py
|       +-- students.py
|       +-- analytics.py
|       +-- helpers.py
|
+-- alembic/
+-- tests/
+-- requirements.txt

front-end/
|
+-- src/
|   +-- routes.tsx
|   +-- pages/
|   +-- components/
|   +-- hooks/
|   +-- types/
|   +-- config/
|
+-- package.json
+-- vite.config.ts

README.md
```

---

# Getting Started

## Prerequisites

Ensure the following software is installed before running the project:

- Python 3.10 or later
- Node.js 18 or later (20+ recommended)
- PostgreSQL
- Google Cloud Platform project
- Google Cloud Storage bucket
- Clerk account

---

# Environment Variables

## Backend (`backend/.env`)

```env
# Database
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/enrolment_db

# Clerk Authentication
CLERK_API_KEY=sk_test_xxxxxxxxx
CLERK_JWT_ISSUER=https://your-clerk-instance.clerk.accounts.dev

# Google Cloud
GCP_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=your-bucket-name
GOOGLE_APPLICATION_CREDENTIALS=config/vertex-ai-service-account.json

# Optional Local AI Pipeline
OLLAMA_BASE_URL=http://localhost:11434
```

## Frontend (`front-end/.env`)

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxx
```

---

# Backend Setup

```bash
cd backend
```

Create a virtual environment.

```bash
python -m venv venv
```

Activate the environment.

**Windows**

```bash
venv\Scripts\activate
```

**macOS/Linux**

```bash
source venv/bin/activate
```

Install dependencies.

```bash
pip install -r requirements.txt
```

Run database migrations.

```bash
alembic upgrade head
```

Start the development server.

```bash
uvicorn app.api:app --reload
```

The backend will be available at:

```
http://localhost:8000
```

---

# Frontend Setup

Navigate to the frontend directory.

```bash
cd ../front-end
```

Install dependencies.

```bash
npm install
```

Start the development server.

```bash
npm run dev
```

The frontend will be available at:

```
http://localhost:5173
```

---

# Authentication

The application uses Clerk Authentication with role-based access control.

Supported roles include:

- Student
- Adviser
- Administrator

Authorization is enforced using JWT verification within the FastAPI backend.

---

# AI Processing Pipeline

```text
Document Upload
 |
 v
Keyword Classification
 |
 v
Gemini Classification
 |
 v
Student Confirmation
 |
 v
Field Extraction
 |
 v
Database Storage
```

Fallback processing pipeline:

```text
Keyword Matching
 |
 v
Gemini Classification
 |
 v
Flag for Manual Review
```

The student confirmation step exists to reduce misclassification risk before extraction is performed. Because extraction is schema-driven, confirming the correct document type first ensures the correct field-extraction schema is applied, reducing wasted processing and downstream correction effort.

---

# Branch Overview

The repository follows a feature-branch workflow throughout the development of the capstone project.

## Stable Branch

| Branch | Description |
|---|---|
| `main` | Stable implementation containing validated and merged features. |

## Active Development

| Branch | Description |
|---|---|
| `adviser-modules` | Current development branch implementing the Adviser Module, including the adviser dashboard, document review workflow, notifications, analytics, submission history, duplicate detection, and verified-document protection. Changes from this branch will be merged into `main` after testing and validation. |

## Major Feature Branches

| Branch | Description |
|---|---|
| `feature/fastapi-backend` | Initial FastAPI backend architecture, database models, and API foundation. |
| `feature/clerk-auth` | Clerk authentication, JWT verification, role-based access control, and user synchronization. |
| `feature/admin-school-year-requirements` | School-year configuration, document requirements, and extraction schema management. |
| `feature/student-classification-requirements` | Student classification workflow and dynamic document requirement filtering. |
| `features/admission-form-schema` | Admission form extraction schema implementation using LlamaCloud. |

## Research and Experimental Branches

| Branch | Description |
|---|---|
| `aws-pipeline` | Initial AWS S3-based document storage pipeline. |
| `document-classification` | Early document classification implementation using LlamaCloud. |
| `gcp-pipeline-gemini-vertex-ai` | Migration to Google Cloud Storage and Vertex AI Gemini for document classification, extraction, and schema generation. |
| `local-ocr-llm` | Experimental local-only document processing pipeline using Ollama, IBM Granite Docling, and Qwen2.5:3B for privacy-sensitive deployments. |

---

# Research Contributions

This project investigates the application of artificial intelligence to automate enrolment document processing within higher education institutions.

Major contributions include:

- AI-assisted document classification
- Configurable extraction schemas
- Automated information extraction
- Cloud-native document processing architecture
- Evaluation of cloud-based versus local AI pipelines
- Configurable document requirements across school years

---

# Future Work

Planned enhancements include:

- Human-in-the-loop feedback for model improvement
- Confidence-based automatic routing
- OCR benchmarking across multiple engines
- Queue-based background processing
- Multi-page document extraction
- Fine-tuned document classification models
- Active learning for extraction schema refinement

---

# License

This project was developed for academic research and educational purposes.
