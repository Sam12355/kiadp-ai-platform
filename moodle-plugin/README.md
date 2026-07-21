# EduAI Moodle Plugin (`local_eduai`)

Connects your Moodle instance to the EduAI knowledge base backend.  
Students can ask questions inside any course and get AI answers grounded in that course's materials.

## How it works

1. Teacher uploads a PDF/Word file to a Moodle course as a **Resource**
2. Plugin automatically sends the file to EduAI for ingestion (chunking + embedding)
3. Student opens the AI Assistant page for that course
4. Student asks a question → EduAI searches **only that course's documents** → returns a grounded answer

## Installation

1. Copy the `local_eduai` folder into `<moodle>/local/`
2. Visit **Site Administration → Notifications** to run the install
3. Go to **Site Administration → Plugins → Local plugins → EduAI Knowledge Assistant**
4. Set:
   - **Server URL**: your EduAI backend (e.g. `https://api.yourschool.com`)
   - **API Key**: the `sk-kh-...` key generated from the EduAI admin panel

## Generating an API Key

In the EduAI admin panel (or via API):
```
POST /api/moodle/api-keys
Authorization: Bearer <admin-jwt>
{ "name": "Royal College Moodle", "tenantId": "<institution-uuid>" }
```
The raw key is returned once — copy it into the Moodle plugin settings.

## Student access

Add a link to `/local/eduai/ask.php?courseid=<id>` anywhere in the course  
(course menu, block, activity description, etc.).

## What gets synced

Only **Resource** module type files are synced. Assignments, quizzes, forums, and other  
activity types are **never** sent to EduAI — students cannot get assignment answers from this.

Supported file types: PDF, Word (.doc/.docx), plain text.

## Privacy

Student questions are sent to the EduAI server. No student identity is transmitted —  
only the question text and course ID. Configure your EduAI server's data retention policy accordingly.
