export interface CanonicalKeyItem {
  canonical_key: string
  label: string
  field_type: string
  analytics_group: string | null
  school_year_count: number
  document_types: string[]
}

export interface CanonicalKeysResponse {
  keys: CanonicalKeyItem[]
}

export interface AlignmentFieldDetail {
  field_key: string
  field_label: string
  field_type: string
  schema_name: string
  school_year_names: string[]
}

export interface AlignmentGroup {
  canonical_key: string
  field_details: AlignmentFieldDetail[]
  school_year_count: number
  school_year_names: string[]
  status: "aligned" | "diverges" | "isolated"
  divergences: string[]
}

export interface AlignmentReport {
  groups: AlignmentGroup[]
  total_keys: number
  isolated_keys: number
  diverged_keys: number
}

export interface FieldInsights {
  total_students: number
  values_present: number
  values_missing: number
  completion_rate: number
}

export interface DistributionOption {
  label: string
  count: number
  percentage: number
}

export interface FieldAnalytics {
  canonical_key: string
  key: string
  label: string
  field_type: string
  analytics_mode: string
  analytics_group: string | null
  insights: FieldInsights
  distribution?: DistributionOption[]
  student_count?: number
  distribution_basis?: string
  count?: number
  mean?: number | null
  median?: number | null
  min?: number | null
  max?: number | null
  std?: number | null
  sum?: number | null
  true?: { count: number; percentage: number | null }
  false?: { count: number; percentage: number | null }
}

export interface DocumentComplianceItem {
  document_type: string
  document_code: string
  classification_scope: string[]
  verified: number
  pending: number
  missing: number
  eligible_students: number
  verification_rate: number
}

export interface SnapshotResponse {
  school_year_id: string
  school_year_name: string
  total_students: number
  total_verified_submissions: number
  fields: FieldAnalytics[]
  document_compliance: DocumentComplianceItem[]
}

export interface TrendSchoolYear {
  school_year_id: string
  school_year_name: string
}

export interface TrendField {
  label: string
  field_type: string
  analytics_mode: string
  series: (Record<string, unknown> | null)[]
}

export interface TrendResponse {
  school_years: TrendSchoolYear[]
  canonical_keys: Record<string, TrendField>
}

export interface EnrolmentSeriesItem {
  school_year_id: string
  school_year_name: string
  total_enrolled: number
  verified_students: number
  verification_rate: number | null
}

export interface EnrolmentResponse {
  series: EnrolmentSeriesItem[]
}