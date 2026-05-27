# Enrollment Document Management System 

**Project Status:** Ongoing Development

An AI-powered enrollment document management system designed to automate document classification, organization, and retrieval of student-related records. The project integrates OCR workflows, document understanding models, and locally hosted Large Language Models (LLMs) to reduce manual processing and improve enrollment document handling efficiency.

---

## Overview

Educational institutions process large volumes of enrollment-related documents with varying structures and formats. Manual document handling and organization can be repetitive, time-consuming, and prone to inconsistencies.

This project aims to streamline enrollment workflows through AI-powered document processing capable of handling both standardized and handwritten records using automated classification and information extraction pipelines.

---

## Currently Implemented Features

Current implementation primarily focuses on the **administrator module**.

### Administrator Module

- Upload and manage enrollment documents
- Store and organize uploaded records
- Search and retrieve documents
- Role-based access management
- Document management workflows

### Current Document Support

The system currently supports:

- Medical Certificates
- Birth Certificates
- College Entrance Test (CET) Results
- Report Cards
- Good Moral Certificates
- Admission Forms

---

## Ongoing Development

The following features are currently under active development and local experimentation.

### LlamaClassify Integration

Currently implementing automated document classification workflows for categorizing uploaded records.

### LlamaExtract Integration

Currently developing information extraction workflows for converting uploaded documents into structured and searchable information.

### Dynamic Handwritten Form Processing

Currently experimenting with AI workflows for processing handwritten forms and dynamically extracting user-provided information.

### Local LLM Integration

A locally hosted Large Language Model is currently being implemented to:

- Improve document classification quality
- Generate contextual document descriptions
- Enhance extracted information
- Reduce dependency on external APIs
- Improve flexibility in document interpretation

Current experimentation and model testing are being performed locally.

---

## System Workflow

### Current Workflow

```text
Upload Document
        ↓
Admin Processing
        ↓
Document Storage
        ↓
Search and Retrieval
```

### Planned AI Workflow

```text
Upload Document
        ↓
OCR Processing
        ↓
LlamaClassify
        ↓
LlamaExtract
        ↓
Local LLM Processing
        ↓
Database Storage
        ↓
Search and Retrieval
```

---

## Tech Stack

### Frontend

- Reactjs + Vite
- TypeScript
- Tailwind CSS
- Shadcn UI

### Backend and Database

- PostgreSQL

### AI and Machine Learning

- LlamaClassify *(ongoing implementation)*
- LlamaExtract *(ongoing implementation)*
- OCR Pipeline *(ongoing implementation)*
- Local LLM Hosting *(ongoing implementation)*

### Development Tools

- Git
- GitHub

---

## Current Development Focus

Current areas under active development include:

- Dynamic handwritten form extraction
- Local LLM integration
- Document classification improvements
- Information extraction optimization
- Support for additional document variations
- AI performance evaluation

---

## Planned Features

- Semantic document search
- AI-generated document summaries
- Advanced filtering and retrieval
- Analytics dashboard
- Multi-document relationship mapping

---

## Contributors

Ceed Jennelle B. Lorenzo
Lead Developer / Researcher

---

## Note

This project is currently under active development. Features, AI workflows, and system architecture may continue to evolve as experimentation and evaluation progress.
