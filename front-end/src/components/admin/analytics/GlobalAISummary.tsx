"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, RefreshCw, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface GlobalAISummaryProps {
  selectedSyId: string
  selectedDeptId: string
  schoolYearName: string
  departmentName: string
  requestWithAdminAuth: (path: string, init?: RequestInit) => Promise<unknown>
}

interface ParsedSection {
  number: string
  title: string
  body: string
}

function parseSections(text: string): ParsedSection[] {
  const pattern = /^(\d+)\.\s*\*\*(.+?)\*\*\s*:\s*(.*)$/gm
  const sections: ParsedSection[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    sections.push({
      number: match[1],
      title: match[2],
      body: match[3],
    })
  }
  return sections
}

function ParsedBriefing({ text, isStale }: { text: string; isStale: boolean }) {
  const sections = parseSections(text)

  if (sections.length === 0) {
    return (
      <div
        className={`whitespace-pre-line text-sm leading-relaxed text-foreground/90 transition-opacity ${
          isStale ? "opacity-40" : ""
        }`}
      >
        {text}
      </div>
    )
  }

  return (
    <div className={`space-y-4 transition-opacity ${isStale ? "opacity-40" : ""}`}>
      {sections.map((s) => (
        <div key={s.number} className="border-l-2 border-violet-300 pl-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {s.title}
          </p>
          <p className="text-sm leading-relaxed text-foreground/85">{s.body}</p>
        </div>
      ))}
    </div>
  )
}

function cacheKey(syId: string, deptId: string) {
  return `ai_briefing_${syId}_${deptId || "all"}`
}

export default function GlobalAISummary({
  selectedSyId,
  selectedDeptId,
  schoolYearName,
  departmentName,
  requestWithAdminAuth,
}: GlobalAISummaryProps) {
  const [summary, setSummary] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isStale, setIsStale] = useState(false)
  const prevKeyRef = useRef(cacheKey(selectedSyId, selectedDeptId))

  const currentKey = cacheKey(selectedSyId, selectedDeptId)
  const filtersChanged = prevKeyRef.current !== currentKey

  useEffect(() => {
    if (!filtersChanged) return
    prevKeyRef.current = currentKey

    if (summary) {
      setIsStale(true)
      return
    }

    const cached = localStorage.getItem(currentKey)
    if (cached) {
      setSummary(cached)
      setIsStale(false)
    }
  }, [currentKey, filtersChanged, summary])

  const generate = async () => {
    setIsLoading(true)
    setIsStale(false)
    try {
      const query = `school_year_id=${selectedSyId}${selectedDeptId ? `&department_id=${selectedDeptId}` : ""}`
      const result = await requestWithAdminAuth(`/api/admin/analytics/insights?${query}`, {
        method: "POST",
      }) as { summary: string }
      const text = result.summary
      setSummary(text)
      localStorage.setItem(currentKey, text)
    } catch {
      setSummary("Failed to generate briefing. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full border-violet-200/60 bg-gradient-to-r from-violet-50/40 via-transparent to-transparent dark:from-violet-950/10 dark:border-violet-900/40">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Sparkles className="h-5 w-5 fill-violet-500 text-violet-500" />
            Executive AI Briefing
            {isStale && (
              <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px] leading-none px-1.5 py-0">
                outdated
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {schoolYearName
              ? `Macro-level trends for ${departmentName} (${schoolYearName})`
              : "Select a school year to generate insights"}
          </CardDescription>
        </div>

        {selectedSyId && (
          <Button
            onClick={generate}
            disabled={isLoading}
            variant={summary && !isStale ? "outline" : "default"}
            className={
              summary && !isStale
                ? "h-9 text-xs"
                : "h-9 bg-violet-600 text-xs text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600"
            }
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Analyzing...
              </>
            ) : summary && !isStale ? (
              <>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Regenerate
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-3.5 w-3.5 fill-white" />
                Generate Briefing
              </>
            )}
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {isLoading && (
          <div className="space-y-2 py-2">
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-[92%] rounded" />
            <Skeleton className="h-4 w-[78%] rounded" />
          </div>
        )}

        {!isLoading && !summary && selectedSyId && (
          <div className="rounded-lg border border-dashed bg-background/50 py-4 text-center text-sm italic text-muted-foreground">
            Click Generate Briefing to synthesize cross-metric trends, document backlogs,
            and admission vectors for this combination.
          </div>
        )}

        {!isLoading && !summary && !selectedSyId && (
          <div className="rounded-lg border border-dashed bg-background/50 py-4 text-center text-sm italic text-muted-foreground">
            Select a school year to enable AI-powered insights.
          </div>
        )}

        {!isLoading && summary && (
          <ParsedBriefing text={summary} isStale={isStale} />
        )}
      </CardContent>
    </Card>
  )
}
