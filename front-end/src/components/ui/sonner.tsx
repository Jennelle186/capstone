import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      richColors
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "oklch(0.93 0.06 145)",
          "--success-text": "oklch(0.25 0.15 145)",
          "--success-border": "oklch(0.8 0.12 145)",
          "--error-bg": "oklch(0.93 0.06 27)",
          "--error-text": "oklch(0.25 0.15 27)",
          "--error-border": "oklch(0.8 0.12 27)",
          "--warning-bg": "oklch(0.95 0.06 80)",
          "--warning-text": "oklch(0.3 0.12 80)",
          "--warning-border": "oklch(0.85 0.12 80)",
          "--info-bg": "oklch(0.93 0.04 250)",
          "--info-text": "oklch(0.3 0.1 250)",
          "--info-border": "oklch(0.82 0.08 250)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
