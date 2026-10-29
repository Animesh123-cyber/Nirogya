Nirogya is an advanced, portfolio-grade healthcare platform engineered to streamline clinical workflows and combat electronic health record fatigue. Designed with a robust full-stack architecture, the application integrates a high-performance FastAPI and Python backend with a modern, responsive Next.js and TypeScript frontend, backed by a PostgreSQL database utilizing pgvector for similarity searches.

At its core, the platform tackles the heavy administrative burdens faced by modern medical professionals. It securely ingests unstructured doctor-patient notes, lab reports, and vital statistics, transforming raw data into actionable insights. Utilizing structured LLM outputs and strict Pydantic validation schemas, MedFlow AI automatically generates standardized SOAP notes—organizing information into Subjective, Objective, Assessment, and Plan formats—saving clinicians hours of manual documentation every week.

Beyond summarization, patient safety takes center stage through automated safety guardrails. The system cross-references active prescriptions against known patient allergies and pharmacological databases to flag high-risk drug-drug interactions in real time. Furthermore, an evidence-based Retrieval-Augmented Generation pipeline allows practitioners to query medical guidelines, delivering precise, trustworthy answers accompanied by direct source citations to verified literature.

Structured with clean separation of concerns, role-based access control patterns, and thorough unit testing, Nirogya demonstrates full-stack engineering excellence, secure data handling, and product-focused design, making it an exceptional centerpiece for any developer's GitHub portfolio.


---

## 🚀 Key Features

* **Automated SOAP Note Generation:** Parses raw clinical notes/transcripts into standardized Subjective, Objective, Assessment, and Plan formats using structured LLM outputs (Pydantic).
* **Smart Interaction & Allergy Checker:** Cross-references active prescriptions against known patient allergies and drug databases to flag critical medical conflicts in real time.
* **Evidence-Based RAG Search:** Query medical guidelines and reference texts with AI-generated answers backed by precise document page and paragraph citations.
* **Secure Patient Dashboard:** Full-stack interface displaying real-time vitals, historical timelines, and structured clinical summaries with role-based access control (RBAC) patterns.

---

## 🛠️ Tech Stack

* **Frontend:** Next.js (TypeScript), Tailwind CSS, Lucide Icons
* **Backend:** Python, FastAPI, Uvicorn (Asynchronous API processing)
* **Database & Vector Store:** PostgreSQL, pgvector (for semantic medical guideline search)
* **AI Orchestration:** LangChain / LlamaIndex, Pydantic for data validation

---


