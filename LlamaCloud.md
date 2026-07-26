# LlamaCloud Reference

LlamaCloud is a suite of AI-powered document processing services: Parse (unstructured → markdown/text), Extract (unstructured → structured JSON), Classify (categorize by rules), Split (segment concatenated PDFs), and Index (managed RAG pipeline).

---

## 1. Overview

### API Key

- Get a key at [cloud.llamaindex.ai](https://cloud.llamaindex.ai)
- Set as env: `export LLAMA_CLOUD_API_KEY="llx-..."`
- Python SDK: `LlamaCloud(api_key="llx-...")` or auto-reads from env
- TypeScript SDK: `new LlamaCloud({ apiKey: "llx-..." })` or auto-reads from env
- API keys are **project-scoped** and **region-specific** (NA key won't work against EU endpoint)

### Base URL

| Region | Base URL |
|--------|----------|
| North America | `https://api.cloud.llamaindex.ai` |
| Europe | `https://api.cloud.eu.llamaindex.ai` |

Python: `LlamaCloud(api_key="...", base_url="https://api.cloud.eu.llamaindex.ai")`

### Auth Header

HTTP: `Authorization: Bearer llx-...`

### Install SDK

```bash
pip install llama-cloud>=2.1
npm install @llamaindex/llama-cloud
```

---

## 2. Parse

Convert PDFs, scans, images, and Office documents into clean markdown, text, or JSON.

### Tiers

| Tier | Credits/Page | Best For |
|------|-------------|----------|
| Fast | 1 | Plain text, high volume (spatial text only — no markdown) |
| Cost Effective | 3 | Text-heavy docs, minimal visual structure |
| Agentic | 10 | Visually rich docs — strong default |
| Agentic Plus | 45 | Hardest docs (complex tables, dense charts, multi-column) |

Additional: Layout extraction +3 credits/page, Spreadsheet 1 credit/sheet, Audio 3 credits/min.

### Quick Start (Python)

```python
from llama_cloud import LlamaCloud

client = LlamaCloud()
file = client.files.create(file="./doc.pdf", purpose="parse")
result = client.parsing.parse(
    file_id=file.id,
    tier="agentic",
    version="latest",
    expand=["markdown"],
)
print(result.markdown.pages[0].markdown)
```

### Quick Start (TypeScript)

```typescript
import LlamaCloud from '@llamaindex/llama-cloud';
import fs from 'fs';

const client = new LlamaCloud();
const file = await client.files.create({
  file: fs.createReadStream('./doc.pdf'),
  purpose: 'parse',
});
const result = await client.parsing.parse({
  file_id: file.id,
  tier: 'agentic',
  version: 'latest',
  expand: ['markdown'],
});
console.log(result.markdown.pages[0].markdown);
```

### Async (Python)

```python
from llama_cloud import AsyncLlamaCloud
import asyncio

async def main():
    client = AsyncLlamaCloud()
    file = await client.files.create(file="./doc.pdf", purpose="parse")
    result = await client.parsing.parse(file_id=file.id, tier="agentic", version="latest", expand=["markdown"])
    print(result.markdown.pages[0].markdown)

asyncio.run(main())
```

### REST API (Polling)

```bash
# 1. Upload
curl -X POST https://api.cloud.llamaindex.ai/api/v1/files/ \
  -H "Authorization: Bearer $LLAMA_CLOUD_API_KEY" \
  -F 'file=@doc.pdf;type=application/pdf'

# 2. Start parse job (returns job_id)
curl -X POST https://api.cloud.llamaindex.ai/api/v2/parse \
  -H "Authorization: Bearer $LLAMA_CLOUD_API_KEY" \
  --data '{"file_id": "<file_id>", "tier": "agentic", "version": "latest"}'

# 3. Poll for result
curl -X GET 'https://api.cloud.llamaindex.ai/api/v2/parse/<job_id>?expand=markdown' \
  -H "Authorization: Bearer $LLAMA_CLOUD_API_KEY"
```

Status values: `PENDING` → `RUNNING` → `COMPLETED` / `FAILED`

### Configure Parse

```python
result = client.parsing.parse(
    file_id=file.id,
    tier="agentic",
    version="latest",
    output_options={
        "markdown": {"tables": {"output_tables_as_markdown": True}},
        "images_to_save": ["screenshot"],
    },
    processing_options={
        "ocr_parameters": {"languages": ["en"]},
    },
    expand=["text", "markdown", "items", "images_content_metadata"],
)
```

**Input Options:** page ranges (`target_pages`), crop boxes, cache behavior
**Output Options:** markdown styling, spatial text, screenshots, tables-as-spreadsheet
**Processing Options:** OCR languages, ignore rules, chart parsing, cost optimizer

### Expand Values

Pass `expand` array to control what's returned: `text`, `markdown`, `items`, `images_content_metadata`, `images_b64`, `screenshots`, etc.

### Cost Optimizer

Automatically routes each page to the right tier based on complexity. Configure via `processing_options`.

### Web UI

Go to [cloud.llamaindex.ai/parse](https://cloud.llamaindex.ai/parse), pick a tier, upload, and view results in the browser.

---

## 3. Extract

Extract structured data (JSON) from unstructured documents using Pydantic/TypeScript schemas.

### Tiers (v2)

**Extract tier** (quality of structured-data extraction):

| Tier | Credits/Page |
|------|-------------|
| Cost Effective | 5 |
| Agentic | 15 |

**Parse tier** (how the document is interpreted before extraction; defaults to match extract tier):

| Tier | Credits/Page |
|------|-------------|
| Fast | 1 |
| Cost Effective | 3 |
| Agentic | 10 |
| Agentic Plus | 45 |

**Range:** 6 credits/page (Cost-Effective extract + Fast parse) to 60 (Agentic extract + Agentic Plus parse).

For text files or pre-parsed files, only extract-tier cost applies.

### v1 Tiers (legacy)

| Mode | Credits/Page | Credit/Page (extract only) |
|------|-------------|---------------------------|
| Fast | 5 | 4 |
| Balanced | 10 | 7 |
| Multimodal | 20 | 14 |
| Premium | 60 | 15 |

### Quick Start (Python)

```python
from llama_cloud import LlamaCloud
from pydantic import BaseModel, Field
from typing import List, Optional

client = LlamaCloud()

class InvoiceSchema(BaseModel):
    invoice_number: str = Field(description="Unique invoice identifier")
    vendor_name: str = Field(description="Name of the vendor/supplier")
    total_amount: float = Field(description="Total invoice amount")
    date: Optional[str] = Field(None, description="Invoice date")

# Upload file
file = client.files.create(file="./invoice.pdf", purpose="extract")

# Create extraction job
job = client.extract.create(
    file_input=file.id,
    configuration={
        "data_schema": InvoiceSchema.model_json_schema(),
        "tier": "agentic",
        "confidence_scores": True,
    },
)

# Poll until complete
while job.status not in ("COMPLETED", "FAILED", "CANCELLED"):
    import time
    time.sleep(2)
    job = client.extract.get(job.id)

result = InvoiceSchema.model_validate(job.extract_result)
print(result.model_dump())
```

### Configuration Options

- `data_schema`: JSON Schema (Pydantic `model_json_schema()`)
- `tier`: `"cost_effective"`, `"agentic"`
- `version`: `"latest"` or date-pinned like `"2026-03-31"`
- `confidence_scores`: include confidence in results
- `target_pages`: extract from specific pages (e.g., `"1,3,5-8"`)
- `extraction_target`: `PER_DOC`, `PER_PAGE`, `PER_TABLE_ROW`

### Schema Design Rules

- Root must be `type: object` with `properties`
- Default values (other than null) not supported
- Be specific and unambiguous in field descriptions
- See [Schema Design](https://developers.llamaindex.ai/llamaparse/extract/guides/schema_design/) for constraints

### v2 vs v1

v2 is the default. v1 (legacy) uses `llama-cloud-services` package. Migrate new projects to v2.

---

## 4. Classify

Categorize documents into user-defined types using natural-language rules. (Beta)

### Modes

| Mode | Credits/Page | Best For |
|------|-------------|----------|
| Fast | 1 | Text-heavy docs where layout doesn't matter |
| Multimodal | 2 | Docs with handwriting, images, charts, visual content |

### Use Cases

- Pre-processing before extraction (route to schema-specific Extract agents)
- Pre-processing before parsing (tune parse settings per category)
- Pre-processing before indexing (tailored chunking/metadata per category)
- Intake routing for back-office documents

### Concepts

- **Rule**: `type` (label name) + `description` (natural-language description of matching content)
- **Results**: `type` (predicted label), `confidence` (0.0–1.0), `reasoning` (explanation)

### Quick Start

```python
from llama_cloud import LlamaCloud

client = LlamaCloud()

# Upload
file = client.files.create(file="./doc.pdf", purpose="classify")

# Create classify job with rules
job = client.classify.create(
    file_id=file.id,
    rules=[
        {
            "type": "invoice",
            "description": "Document listing charges, payment terms, and vendor details",
        },
        {
            "type": "contract",
            "description": "Legal agreement with terms, conditions, and signature fields",
        },
    ],
)

# Poll
while job.status not in ("COMPLETED", "FAILED", "CANCELLED"):
    import time
    time.sleep(2)
    job = client.classify.get(job.id)

for result in job.results:
    print(f"File: {result.file_id}, Type: {result.type}, Confidence: {result.confidence}")
```

### Typical Flow

1. Upload files to LlamaCloud
2. Create rules for target classes
3. Create classify job with file IDs + rules
4. Poll for completion
5. Consume predictions

---

## 5. Split

Automatically segment concatenated PDFs into logical sections based on content categories. (Beta — REST API only, no SDK yet)

### Pricing

4 credits per page (3 for cached files)

### API Endpoints

| Action | Method | Endpoint |
|--------|--------|----------|
| Create split job | POST | `/api/v1/beta/split/jobs` |
| Get split job | GET | `/api/v1/beta/split/jobs/{job_id}` |
| List split jobs | GET | `/api/v1/beta/split/jobs` |

### Quick Start (Python)

```python
import time
from llama_cloud import LlamaCloud

client = LlamaCloud()

# Upload file
file = client.files.create(file="./resume_book.pdf", purpose="extract")

# Create split job
response = client.beta.split.split(
    categories=[
        {
            "name": "resume",
            "description": "A resume page from an individual candidate",
        },
        {
            "name": "curriculum",
            "description": "Curriculum or index page listing the program",
        },
    ],
    document_input={"type": "file_id", "value": file.id},
)

# Response includes segments with: category, pages (list), confidence_category
```

### Results

- Each segment has: `category`, `pages` (list of page numbers), `confidence_category` (high/medium/low)
- Optionally capture uncategorized pages

---

## 6. Webhooks

Receive real-time notifications when LlamaCloud jobs complete, fail, or reach other states.

### Supported Events

**Parse:** `parse.pending`, `parse.success`, `parse.error`, `parse.partial_success`, `parse.cancelled`
**Extract:** `extract.pending`, `extract.success`, `extract.error`, `extract.partial_success`, `extract.cancelled`
**Classify:** `classify.pending`, `classify.running`, `classify.success`, `classify.partial_success`, `classify.error`, `classify.cancelled`

### Configuration

Include `webhook_configurations` in API calls:

```python
webhook_configurations = [{
    "webhook_url": "https://your-domain.com/webhook-endpoint",
    "webhook_headers": {
        "Authorization": "Bearer your-token",
    },
    "webhook_events": ["parse.success", "parse.error", "extract.success", "extract.error"],
    "webhook_output_format": "json",
}]
```

### Payload

```json
{
    "event_id": "149744dd-9002-4411-a6c7-9635da372caa",
    "event_type": "parse.success",
    "timestamp": 1753985275.1154444,
    "data": {
        "id": "a9a57884-921e-4ec2-b555-f4e5a97ec02a",
        "job_id": "a9a57884-921e-4ec2-b555-f4e5a97ec02a"
    }
}
```

### Retry Behavior

- Max 3 attempts with exponential backoff (1s, 2s, 4s)
- 30-second timeout per request
- Success = 2xx response
- Webhook URLs must be publicly accessible (no localhost/private IPs)

### Inngest Example

```python
webhook_configurations = [{
    "webhook_url": "https://inn.gs/e/<your-inngest-key>",
    "webhook_events": ["parse.success", "parse.error"],
    "webhook_output_format": "json",
}]
```

---

## 7. S3 Data Source Integration

Configure Amazon S3 as a data source for LlamaCloud pipelines.

### Via API

```python
from llama_cloud import LlamaCloud
from llama_cloud.types.data_source_create_params import CloudS3DataSource

client = LlamaCloud()

data_source = client.data_sources.create(
    name="my-data-source",
    component=CloudS3DataSource(
        bucket='my-bucket',
        prefix='documents/',  # optional
        aws_access_id='<aws_access_id>',  # optional
        aws_access_secret='<aws_access_secret>',  # optional
        s3_endpoint_url=None,  # optional, for custom endpoints
    ),
    source_type="S3",
    project_id="my-project-id",
)
```

### Required IAM Permissions

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "LLamaCloudPermissions",
            "Effect": "Allow",
            "Action": ["s3:GetObject", "s3:ListBucket"],
            "Resource": [
                "arn:aws:s3:::your-bucket-name",
                "arn:aws:s3:::your-bucket-name/*"
            ]
        }
    ]
}
```

### TypeScript

```typescript
const dataSource = await client.dataSources.create({
  name: 'my-data-source',
  component: {
    bucket: 'my-bucket',
    prefix: 'documents/',
  },
  source_type: 'S3',
  project_id: 'my-project-id',
});
```

---

## 8. Index Status Monitoring

Monitor pipeline health and determine when index is ready to query.

### File Status Counts

```bash
curl -X GET "https://cloud.llamaindex.ai/api/v1/pipelines/{pipeline_id}/files/status-counts" \
  -H "Authorization: Bearer $LLAMA_CLOUD_API_KEY"
```

Response:
```json
{
  "counts": { "SUCCESS": 3, "ERROR": 1, "PENDING": 2 },
  "total_count": 6,
  "pipeline_id": "your-pipeline-id"
}
```

### Status Resolution

- **Ready to query:** 1+ files in SUCCESS state (regardless of pending/error files)
- **Not ready:** 0 files in SUCCESS state

### Polling with Timeout

```python
from llama_cloud import AsyncLlamaCloud
import asyncio, time

async def wait_for_index(pipeline_id: str, timeout: int = 300, interval: int = 10):
    client = AsyncLlamaCloud()
    start = time.time()
    while time.time() - start < timeout:
        response = await client.pipelines.files.get_status_counts(pipeline_id=pipeline_id)
        if response.counts.get("SUCCESS", 0) > 0:
            return True
        await asyncio.sleep(interval)
    return False
```

### Best Practices

- Poll every 5-10 seconds
- Start querying as soon as any files succeed (don't wait for all)
- Monitor error counts for systematic issues
- Filter by `data_source_id` for granular status

---

## 9. Pricing

All features priced in **credits**. $1.25 per 1,000 credits (NA and EU).

### Parse

| Tier | Credits/Page |
|------|-------------|
| Fast | 1 |
| Cost Effective | 3 |
| Agentic | 10 |
| Agentic Plus | 45 |

Layout extraction: +3 credits/page. Spreadsheet: 1 credit/sheet. Audio: 3 credits/min.

### Extract (v2)

**Extract tier:** Cost Effective 5, Agentic 15 credits/page.
**Parse tier (added):** Fast 1, Cost Effective 3, Agentic 10, Agentic Plus 45.
**Total range:** 6–60 credits/page. Text/pre-parsed files: extract tier only.

### Split

| Mode | Credits/Page |
|------|-------------|
| Default | 4 (3 for cached) |

### Classify

| Mode | Credits/Page |
|------|-------------|
| Fast | 1 |
| Multimodal | 2 |

### Index

| Mode | Credits/Page |
|------|-------------|
| Standard | 1 |
| Spreadsheet | 2 |
| Multi-modal | 2 |

### Cost Optimization

1. **Caching:** Parsed files cached for 48h — re-parsing is free
2. **Choose right tier:** Start Cost Effective, move up only when needed
3. **Page ranges:** Parse/extract only the pages you need
4. **Extract-only pricing:** Parse once, extract many times
5. **Pre-filter with Classify:** 1-2 credits/page to avoid expensive Parse/Extract

---

## 10. Troubleshooting & Error Codes

### Common Issues

| Problem | Resolution |
|---------|-----------|
| 401 Unauthorized | Check API key format and region |
| 403 Forbidden | Wrong project/org permissions |
| 402 Payment Required | Credits exhausted — upgrade plan |
| 429 Too Many Requests | Slow down — implement exponential backoff |
| File upload fails | Check size, format, network (uploads not resumable) |
| File type not supported | Check supported types; remove password protection |
| Poor parsing quality | Upgrade tier, add layout extraction, use prompts |
| Extraction returns empty | Review schema specificity; try higher tier |
| Documents misclassified | Write specific rule descriptions; try Multimodal mode |
| Webhooks not firing | URL must be public; check event configuration |

### Key Error Types

| Error Type | Meaning |
|-----------|---------|
| `UNSUPPORTED_FILE_TYPE` | Format not supported |
| `PDF_IS_PROTECTED` | Password-protected PDF |
| `PDF_IS_BROKEN` | Corrupted PDF |
| `NO_DATA_FOUND_IN_FILE` | Blank or image-only without OCR |
| `DOCUMENT_TOO_LARGE` | Exceeds size limits |
| `TOO_MANY_PAGES` | Exceeds max page count |
| `TIMEOUT` | Processing exceeded timeout |
| `llm_refusal` | LLM refused to process content |

### Handling Errors

- Parse `detail` field for human-readable message
- Implement exponential backoff with jitter for 429/5xx
- Include correlation ID (from 500 responses) when contacting support

---

## 11. Rate Limits

| Endpoint | QPS | Window |
|----------|-----|--------|
| File Upload (POST `/api/v1/files`) | 50 | 5 seconds |
| Parse Upload (POST `/api/v1/parsing/upload`) | 50 | 10 seconds |
| Classify (POST `/api/v2/classify`) | 40 | 1 second |

Free tier: 20 requests per minute overall.

---

## Split + Extract Pipeline Example

Full workflow: upload → split → extract per category.

```python
from llama_cloud import AsyncLlamaCloud
from pydantic import BaseModel, Field
from typing import List, Optional
import asyncio

client = AsyncLlamaCloud()

# 1. Upload
file = await client.files.create(file="./resume_book.pdf", purpose="extract")

# 2. Split
response = await client.beta.split.split(
    categories=[
        {"name": "resume", "description": "A resume page from an individual candidate"},
        {"name": "cover_page", "description": "Cover or title page"},
    ],
    document_input={"type": "file_id", "value": file.id},
)

segments = response.result.segments if response.result else []

# 3. Define schema
class ResumeSchema(BaseModel):
    name: str = Field(description="Full name of the candidate")
    skills: List[str] = Field(description="List of skills")
    education: List[dict] = Field(description="List of educational qualifications")

# 4. Extract from resume segments
for segment in segments:
    if segment.category == "resume":
        pages = segment.pages
        job = await client.extract.create(
            file_input=file.id,
            configuration={
                "data_schema": ResumeSchema.model_json_schema(),
                "tier": "agentic",
                "target_pages": f"{min(pages)}-{max(pages)}",
            },
        )
        while job.status not in ("COMPLETED", "FAILED", "CANCELLED"):
            await asyncio.sleep(2)
            job = await client.extract.get(job.id)
        result = ResumeSchema.model_validate(job.extract_result)
        print(result.name, result.skills)
```

---

## Reference Links

- [Parse Getting Started](https://developers.llamaindex.ai/llamaparse/parse/getting_started/)
- [Parse Tiers](https://developers.llamaindex.ai/llamaparse/parse/guides/tiers/)
- [Configuring Parse](https://developers.llamaindex.ai/llamaparse/parse/guides/configuring-parse/)
- [Extract Getting Started](https://developers.llamaindex.ai/llamaparse/extract/sdk/)
- [Extract Guides](https://developers.llamaindex.ai/llamaparse/extract/guides/concepts/)
- [Classify Getting Started](https://developers.llamaindex.ai/llamaparse/classify/sdk/)
- [Split Getting Started](https://developers.llamaindex.ai/llamaparse/split/getting_started/)
- [Webhooks](https://developers.llamaindex.ai/llamaparse/general/webhooks/)
- [Pricing](https://developers.llamaindex.ai/llamaparse/general/pricing/)
- [Troubleshooting](https://developers.llamaindex.ai/llamaparse/general/troubleshooting/)
- [Rate Limits](https://developers.llamaindex.ai/llamaparse/general/rate_limits/)
- [API Reference](https://developers.llamaindex.ai/reference/)
