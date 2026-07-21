# AI Knowledge Base System for Sri Lankan Education

## Overview

This is a sophisticated AI-powered knowledge base system designed specifically for educational institutions in Sri Lanka. The application allows schools, universities, and educational organizations to upload their curriculum materials, textbooks, and documents, then provides students and educators with an intelligent question-answering system that delivers grounded, accurate responses based solely on the uploaded content.

The system is built as a monorepo with a Node.js/TypeScript backend and a modern React frontend, featuring advanced AI capabilities including multi-provider LLM support, vector-based semantic search, and real-time voice interactions via WhatsApp.

## Architecture

### Tech Stack
- **Backend**: Node.js v25.9.0 with TypeScript ESM, Express.js framework
- **Frontend**: React with Vite, TypeScript, Tailwind CSS
- **Database**: PostgreSQL with Prisma ORM
- **Vector Search**: Pinecone for semantic similarity search
- **AI Providers**: OpenAI GPT-4, Google Gemini, Groq (Llama models)
- **Storage**: Cloudinary for file uploads and image hosting
- **Communication**: WhatsApp Cloud API for voice note support
- **Deployment**: Docker containerized with nginx reverse proxy

### System Components

#### Backend Services
- **Authentication Service**: JWT-based auth with role-based access control (Admin/Client)
- **Document Ingestion Service**: Processes PDFs, images, and text documents into searchable chunks
- **QA Service**: Core AI logic with provider fallback chain and grounding to uploaded content
- **Voice Service**: Real-time WebSocket-based voice interactions using Gemini Live API
- **Storage Service**: Cloudinary integration for file uploads and media hosting
- **Embedding Service**: Converts text chunks to vector embeddings using OpenAI text-embedding-3-small

#### Frontend Components
- **Admin Panel**: Dashboard for system management, user control, document uploads, and analytics
- **Client Interface**: Knowledge assistant with chat interface and document search
- **Settings Management**: User profile and system configuration
- **Voice Mode**: Real-time audio interaction component

## Key Features

### 1. Intelligent Document Processing
- **Multi-format Support**: Handles PDFs, images (with OCR), and rich text content
- **Automatic Chunking**: Splits documents into semantically meaningful chunks for optimal retrieval
- **Vector Embeddings**: Uses OpenAI's text-embedding-3-small for high-quality semantic search
- **Metadata Extraction**: Captures document structure, page numbers, and image descriptions

### 2. Grounded Question Answering
- **Context-Aware Responses**: Answers are based solely on uploaded literature, preventing hallucination
- **Multi-Language Support**: Currently supports English and Arabic, extensible to Sinhala and Tamil
- **Source Attribution**: Provides references to specific pages and excerpts from source documents
- **Confidence Scoring**: Indicates answer reliability and identifies knowledge gaps

### 3. AI Provider Flexibility
- **Admin-Configurable Provider Selection**:
  - **Auto Mode**: GPT-4o primary with Gemini and Groq fallbacks for reliability
  - **OpenAI Only**: Forces GPT-4o exclusively
  - **Gemini Only**: Uses Google's Gemini cascade (2.5-flash → 2.5-flash-lite → 2.0-flash)
  - **Groq Only**: Uses Groq's Llama models for cost-effective inference
- **Automatic Fallback**: Handles rate limits and quota exhaustion gracefully
- **Usage Tracking**: Monitors API costs and performance across all providers

### 4. WhatsApp Integration
- **Voice Note Support**: Students can send audio messages, automatically transcribed and answered
- **Real-time Responses**: Immediate text replies with optional voice synthesis
- **Language Detection**: Automatically detects Arabic vs English for appropriate processing
- **Media Handling**: Downloads, processes, and responds with audio files via Cloudinary

### 5. Admin Management System
- **User Management**: Create, approve, and manage user accounts with role-based permissions
- **Document Library**: Upload, categorize, and manage educational materials
- **Analytics Dashboard**: Track usage, question patterns, and system performance
- **API Status Monitoring**: Real-time health checks for all integrated services
- **Question Analytics**: Identify frequently asked questions and knowledge gaps

### 6. External API Integration
- **RESTful API**: `POST /api/v1/ask` endpoint for external integrations
- **Authentication**: JWT-based security with rate limiting
- **Webhook Support**: WhatsApp webhook handling for automated responses
- **Extensible Architecture**: Ready for integration with LMS platforms like Moodle

## Current Implementation Status

### ✅ Completed Features
- Full document ingestion pipeline with PDF processing and image OCR
- Vector-based semantic search with Pinecone integration
- Multi-provider AI system with admin-configurable provider selection
- WhatsApp Cloud API integration with voice note transcription and TTS responses
- Complete admin panel with user management, document uploads, and analytics
- Real-time voice bridge using Gemini Live API for WebSocket audio streaming
- Grounded QA system with source attribution and confidence scoring
- Multi-language support (English/Arabic) with automatic language detection
- Docker containerization with nginx reverse proxy
- Comprehensive error handling and logging

### 🔄 Recent Additions
- AI provider selector in admin panel with real-time switching
- Enhanced logging for model usage tracking
- Improved fallback logic with per-provider isolation
- Database schema for app settings persistence

### 🚀 Production Ready
- Both backend (port 3001) and frontend (port 5173) servers running
- PostgreSQL database with vector extensions
- ngrok tunnel for external webhook access
- Comprehensive API documentation with Swagger

## Next Steps: Sri Lankan Education Sector Plan

### Phase 1: Per-Institution Isolation (Critical Foundation)
**Goal**: Enable multi-tenant architecture where each school/university has isolated knowledge bases.

**Technical Implementation**:
1. Add `tenantId` field to `Document`, `Question`, `Answer`, and `User` models in Prisma schema
2. Modify Pinecone vector metadata to include `tenantId` for filtered searches
3. Update ingestion service to tag vectors with institution-specific metadata
4. Implement tenant-based query filtering in QA service
5. Create institution registration and management endpoints

**Business Impact**: Allows schools to upload their own syllabi without cross-contamination.

### Phase 2: API Key Authentication System
**Goal**: Replace JWT with long-lived API keys for machine-to-machine integrations.

**Technical Implementation**:
1. Create `ApiKey` model with tenant association and rate limiting
2. Build API key issuance interface in admin panel
3. Implement API key middleware for `/api/v1/ask` endpoint
4. Add per-key usage tracking and billing preparation
5. Create key management dashboard for institutions

**Business Impact**: Enables seamless integration with existing LMS platforms.

### Phase 3: Sinhala and Tamil Language Support
**Goal**: Extend multi-language capabilities to Sri Lanka's primary languages.

**Technical Implementation**:
1. Add Sinhala/Tamil language detection to QA service
2. Configure Gemini for Sinhala/Tamil text processing
3. Update language prompts and response formatting
4. Test with educational content in local languages
5. Add language-specific UI elements in frontend

**Business Impact**: Makes the system accessible to Sinhala and Tamil-speaking students.

### Phase 4: Integration Ecosystem
**Goal**: Build connectors for popular Sri Lankan educational platforms.

**Integration Points**:
1. **Moodle Plugin**: Direct integration with Sri Lankan university Moodle instances
2. **WhatsApp School Groups**: Dedicated WhatsApp numbers per institution
3. **Google Classroom**: Apps Script integration for automated Q&A
4. **iFrame Widget**: Embeddable chat interface for school websites
5. **n8n/Zapier**: No-code automation workflows

**Business Impact**: Zero-friction adoption for existing educational infrastructure.

### Phase 5: Educational-Specific Features
**Goal**: Add features tailored to Sri Lankan curriculum needs.

**Enhancements**:
1. **Curriculum Mapping**: Link answers to specific syllabus topics and grades
2. **Assessment Generation**: Create MCQs and practice questions from uploaded content
3. **Progress Tracking**: Monitor student question patterns and learning gaps
4. **Teacher Dashboard**: Analytics for educational content effectiveness
5. **Offline Mode**: Cached responses for areas with poor internet connectivity

### Phase 6: Monetization and Scaling
**Goal**: Establish sustainable business model and prepare for growth.

**Revenue Models**:
1. **SaaS Subscription**: LKR 15,000–50,000/month per institution based on document volume
2. **Pay-per-Question**: Usage-based pricing with free tier (500 questions/month)
3. **Premium Features**: Advanced analytics and custom integrations

**Technical Scaling**:
1. Multi-region deployment with database sharding
2. CDN integration for global content delivery
3. Horizontal scaling with load balancers
4. Advanced caching layers for performance

### Phase 7: Government and NGO Partnerships
**Goal**: Partner with Ministry of Education and educational NGOs.

**Strategic Initiatives**:
1. **NIE Integration**: Collaborate with National Institute of Education for curriculum alignment
2. **Pilot Programs**: Free deployments for select schools as proof-of-concept
3. **Research Partnerships**: Academic studies on AI-assisted learning effectiveness
4. **Localization**: Adapt UI and content for Sri Lankan educational context

## Implementation Priority

1. **Immediate (Week 1-2)**: Tenant isolation and API key system
2. **Short-term (Month 1)**: Sinhala/Tamil support and Moodle integration
3. **Medium-term (Months 2-3)**: Educational features and scaling preparation
4. **Long-term (Months 4-6)**: Government partnerships and full market launch

## Success Metrics

- **Adoption**: Number of institutions onboarded (target: 50 schools in Year 1)
- **Usage**: Questions answered per day (target: 10,000+ daily)
- **Satisfaction**: Student/teacher feedback scores
- **Performance**: Response time <3 seconds, accuracy >95%
- **Revenue**: Monthly recurring revenue from subscriptions

This system represents a unique opportunity to revolutionize education in Sri Lanka by making institutional knowledge instantly accessible and AI-powered learning support available to every student, regardless of their location or socioeconomic background.</content>
<parameter name="filePath">c:\Users\slaks\Documents\AI-KnowledgeBase\PROJECT_OVERVIEW_AND_PLAN.md