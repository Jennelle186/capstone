import { fetchWithClerkAuth } from "@/lib/api";

export interface JobSubmissionStatus {
  submission_id: string;
  status: string | null;
  error_message: string | null;
}

export interface JobResponse {
  id: string;
  student_id: string;
  operation: string;
  status: string;
  result: string | null;
  progress: number;
  total: number;
  error_message: string | null;
  attempt_number: number;
  parent_job_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  last_updated_at: string;
  submissions: JobSubmissionStatus[];
}

export interface JobListResponse {
  jobs: JobResponse[];
}

export async function createJob(
  token: string,
  operation: "classify" | "extract",
  submissionIds: string[],
): Promise<JobResponse> {
  const res = await fetchWithClerkAuth("/api/me/jobs", token, {
    method: "POST",
    body: JSON.stringify({
      operation,
      submission_ids: submissionIds,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw {
      status: res.status,
      detail: err?.detail ?? `Failed to create ${operation} job.`,
    };
  }

  return res.json();
}

export async function getActiveJobs(token: string): Promise<JobListResponse> {
  const res = await fetchWithClerkAuth("/api/me/jobs?status=active", token);
  if (!res.ok) {
    return { jobs: [] };
  }
  return res.json();
}

export async function getJob(
  token: string,
  jobId: string,
): Promise<JobResponse | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchWithClerkAuth(`/api/me/jobs/${jobId}`, token);
      if (res.ok) return res.json();
    } catch {
      // network error — will retry
    }
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
    }
  }
  return null;
}

export async function retryJob(
  token: string,
  jobId: string,
): Promise<JobResponse | null> {
  const res = await fetchWithClerkAuth(`/api/me/jobs/${jobId}/retry`, token, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw {
      status: res.status,
      detail: err?.detail ?? "Failed to retry job.",
    };
  }
  const data = (await res.json()) as { job: JobResponse };
  return data.job;
}
