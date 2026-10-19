/**
 * Form layout document types now live in `@/types/form` so the canonical,
 * versioned `FormDocument` union has a single home. This module re-exports the
 * layout-related pieces to preserve existing import paths.
 */
export type {
    FormFieldSpec,
    FormLayoutSection,
    FormPaperMode,
    FormCreationMode,
    StructuredFormDocument,
    OverlayFieldSpec,
    PdfOverlayDocument,
    FormDocument,
    FormBlock,
    FieldBlock,
    ParagraphBlock,
    TableBlock,
    SignatureBlock,
    UnresolvedFieldBlock,
    TextStyle,
    Letterhead,
    PageSettings,
    PageMargins,
} from "./form";
