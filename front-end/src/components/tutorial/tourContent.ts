/** Guided tour content. Each step may point at one element on the page with
 *  `data-tour="<target>"`. A step with no target is shown in the side panel only.
 *  Keep every `target` in sync with the `data-tour` attributes in the pages; the
 *  content test fails if they drift.
 *
 *  An `example` is a small static illustration shown in the side panel. It is
 *  text only: nothing is created, saved or sent to the API. */

export interface TourExample {
  caption: string;
  rows: [string, string][];
}

export interface TourStep {
  id: string;
  /** Matches a `data-tour` attribute on the page. Optional. */
  target?: string;
  title: string;
  body: string;
  tip?: string;
  example?: TourExample;
  /** A dialog the page should show while this step is open. The guide only opens and closes
   *  it; it never submits anything. Steps without one close the dialog. */
  dialog?: "create-form";
  /** A `data-tour` control the guide clicks when this step opens, to show a mode or view.
   *  Used for UI state only, such as switching a dialog to "Generate with AI". */
  press?: string;
}

export interface TourContent {
  moduleKey: string;
  title: string;
  steps: TourStep[];
}

/** Worked example used across the Schema Builder steps: three related fields plus one
 *  locked field, grouped into a section. Explained in the steps, not created anywhere. */
const EXAMPLE_UNITS_TAKEN: TourExample = {
  caption: "Example field: Units taken",
  rows: [
    ["Label", "Units taken"],
    ["Variable key", "units_taken"],
    ["Type", "number"],
    ["Required (REQ)", "On"],
  ],
};

const EXAMPLE_ANALYTICS: TourExample = {
  caption: "Example: analytics on for Units taken",
  rows: [
    ["Analytics", "On"],
    ["Analytics group", "Enrolment"],
    ["Canonical key", "units_taken"],
  ],
};

const EXAMPLE_EXTRA_UNITS: TourExample = {
  caption: "Example field: Extra units",
  rows: [
    ["Label", "Extra units"],
    ["Variable key", "extra_units"],
    ["Type", "number"],
    ["Required (REQ)", "Off"],
  ],
};

const EXAMPLE_COMPUTED: TourExample = {
  caption: "Example field: Total units (computed)",
  rows: [
    ["Label", "Total units"],
    ["Computed", "On"],
    ["Operation", "Sum"],
    ["Depends on", "Units taken, Extra units"],
  ],
};

const EXAMPLE_LOCKED: TourExample = {
  caption: "Example field: Student number (locked)",
  rows: [
    ["Label", "Student number"],
    ["Type", "string"],
    ["Lock", "On (students can't edit)"],
  ],
};

const EXAMPLE_SECTION: TourExample = {
  caption: "Example section: Enrolment load",
  rows: [
    ["Section", "Enrolment load"],
    ["Fields in this section", "Units taken, Extra units, Total units"],
  ],
};

const EXAMPLE_SOLO_REQUIREMENT: TourExample = {
  caption: "Example: solo requirement",
  rows: [
    ["Requirement", "Solo"],
    ["Document type", "Report Card"],
    ["Schema", "No schema (file kept, not read)"],
    ["Form", "No form"],
  ],
};

const EXAMPLE_GROUP_REQUIREMENT: TourExample = {
  caption: "Example: group of alternatives",
  rows: [
    ["Group name", "Proof of Financial Status"],
    ["Alternatives", "Bank Statement, Scholarship Letter"],
    ["Student must submit", "1 of the 2 alternatives"],
  ],
};

const EXAMPLE_SCHEMA_PICK: TourExample = {
  caption: "Example: schema on a solo requirement",
  rows: [
    ["Document type", "Report Card"],
    ["Schema", "Report Card Schema (v1)"],
    ["Result", "The schema's fields are read from each upload"],
  ],
};

const EXAMPLE_FORM_BLANK: TourExample = {
  caption: "Example: blank form",
  rows: [
    ["Form name", "Admission Form 2026-2027"],
    ["Document type", "Admission Form"],
    ["Mode", "Blank"],
    ["AI used", "No"],
  ],
};

const EXAMPLE_FORM_AI: TourExample = {
  caption: "Example: generate with AI, no schema",
  rows: [
    ["Mode", "Generate with AI"],
    ["Extraction schema", "No schema"],
    ["Describe", "Student name, LRN, date of birth, sex, grade level"],
  ],
};

const EXAMPLE_FORM_GROUNDED: TourExample = {
  caption: "Example: generate with AI, grounded on a schema",
  rows: [
    ["Extraction schema", "Report Card Schema (v1)"],
    ["Fields used", "The schema's fields, exactly as they are"],
    ["Document type", "Set from the schema"],
  ],
};

const EXAMPLE_FORM_SYNC: TourExample = {
  caption: "Example: after you remove a field from the form",
  rows: [
    ["Field added to the form", "Date of birth"],
    ["Field removed from the form", "Old remark"],
    ["Analytics field removed", "Kept in the schema"],
  ],
};

const EXAMPLE_ANALYTICS_DEPARTMENT: TourExample = {
  caption: "Example: one program",
  rows: [
    ["Department", "BSIT (Information Technology)"],
    ["Snapshot", "Only BSIT students"],
    ["Export", "Only BSIT students"],
  ],
};

const EXAMPLE_ANALYTICS_EXPORT: TourExample = {
  caption: "Example: export for 2026-2027, all departments",
  rows: [
    ["School year", "2026-2027"],
    ["Department", "All Departments"],
    ["File", "2026-2027-analytics-report.xlsx"],
  ],
};

const EXAMPLE_ANALYTICS_EDIT: TourExample = {
  caption: "Example: editing a registry entry",
  rows: [
    ["Label", "Religious Affiliation"],
    ["Canonical key", "religion (cannot change)"],
    ["Group", "Demographics"],
  ],
};

const EXAMPLE_BRANDING_NAME: TourExample = {
  caption: "Example: institution name",
  rows: [
    ["Institution name", "Your institution's name"],
    ["Sidebar shows", "Your institution's name • WMSU"],
  ],
};

export const TOURS: Record<string, TourContent> = {
  "school-years": {
    moduleKey: "school-years",
    title: "School year",
    steps: [
      {
        id: "add",
        target: "school-years-add",
        title: "Add a school year",
        body: "Start by adding the school year, for example 2026-2027. Students and advisers belong to an active school year.",
      },
      {
        id: "dates",
        title: "Set the dates",
        body: "Enter the start and end dates. The end date can't be earlier than the start date.",
      },
      {
        id: "auto-close",
        title: "Auto-close (optional)",
        body: "You can choose a date when the year closes automatically. It can't be earlier than the start date.",
      },
      {
        id: "activate",
        title: "Make it active",
        body: "When the year is ready, make it active. The active year is the one students upload into.",
      },
    ],
  },
  departments: {
    moduleKey: "departments",
    title: "Academic programs",
    steps: [
      {
        id: "add",
        target: "programs-add",
        title: "Add a program",
        body: "Enter a program code and name, for example BSIT and Information Technology.",
      },
      {
        id: "inactive",
        title: "Inactive programs",
        body: "A program that is inactive can't get new adviser assignments. Existing assignments stay in place.",
      },
      {
        id: "assign",
        title: "Assign advisers next",
        body: "Once programs exist, assign advisers to them for the school year.",
        tip: "Programs must be active before advisers can be assigned to them.",
      },
    ],
  },
  advisers: {
    moduleKey: "advisers",
    title: "Advisers",
    steps: [
      {
        id: "add",
        target: "advisers-add",
        title: "Add an adviser",
        body: "Add an adviser and choose the school year and program they will handle.",
      },
      {
        id: "years",
        title: "One assignment per year",
        body: "An adviser is assigned to programs for each school year. The same adviser can be assigned again in a later year.",
      },
      {
        id: "history",
        title: "Check the history",
        body: "Each adviser's assignment history is kept, so you can see earlier changes.",
      },
    ],
  },
  "document-types": {
    moduleKey: "document-types",
    title: "Document types",
    steps: [
      {
        id: "add",
        target: "document-types-add",
        title: "Add a document type",
        body: "Add a document type, such as Birth Certificate or Report Card.",
      },
      {
        id: "classifications",
        title: "Choose who it applies to",
        body: "Pick the student classifications this document applies to. A document type with no classification doesn't count as set up.",
      },
      {
        id: "keywords",
        title: "Help the system recognise it",
        body: "Add keywords and a short description. The system uses them to recognise this document when students upload it.",
      },
    ],
  },
  "extraction-schemas": {
    moduleKey: "extraction-schemas",
    title: "Schema builder",
    steps: [
      {
        id: "new",
        target: "schemas-new",
        title: "Create a new schema",
        body: "Click New to start a blank draft. A schema lists the values the system reads from a document.",
      },
      {
        id: "document-type",
        target: "schema-document-type",
        title: "Choose the document type",
        body: "Pick the document students upload for this schema, such as Report Card. Leave it on None (Legacy) only for older schemas.",
      },
      {
        id: "start-by-file",
        target: "schema-drop-zone",
        title: "Start from a sample document",
        body: "Drop a sample PDF, PNG or JPG here, or click to browse. The AI reads it and fills in the fields for you.",
        tip: "Use a clear, complete sample so the fields match what students will upload.",
      },
      {
        id: "start-by-prompt",
        target: "schema-generation-prompt",
        title: "Or start from a prompt",
        body: "Describe the fields you need in the Generation Prompt box, then click Draft Fields with AI. You can add a sample file too.",
      },
      {
        id: "draft-ai",
        target: "schema-draft-ai",
        title: "Draft the fields",
        body: "Click Draft Fields with AI to create the fields from the prompt or sample. Review everything it produces before you save.",
      },
      {
        id: "details",
        target: "schema-name",
        title: "Name the schema",
        body: "Check the display name, version, effective date and description. These help other admins recognise the schema.",
      },
      {
        id: "first-field",
        target: "schema-add-field",
        title: "Add a field",
        body: "Click Add Field Row. Type a Label Name. The Variable Key is created from it automatically. Choose the type, then describe the value in AI Guideline Instructions so the AI knows what to read.",
        example: EXAMPLE_UNITS_TAKEN,
      },
      {
        id: "required",
        target: "field-required",
        title: "Mark a field as required",
        body: "Turn on REQ for a value the document must have. Leave it off for optional values.",
        tip: "Required fields are the ones the system flags when they are missing.",
        example: EXAMPLE_UNITS_TAKEN,
      },
      {
        id: "analytics",
        target: "field-analytics",
        title: "Turn on analytics and set a group",
        body: "Click the bar-chart icon on the field header to include it in analytics. Set an Analytics Group so related fields are reported together. Display Label is an optional name shown in analytics. Mode Override changes how the values are summarised; leave it on Auto unless you need something else.",
        example: EXAMPLE_ANALYTICS,
      },
      {
        id: "canonical",
        target: "field-canonical-key",
        title: "Canonical key",
        body: "This box appears once analytics is on. The canonical key is the analytics name for this value. Every schema that uses the same canonical key feeds the same analytics field. If the key is new, click Register this key under the box to add it to the registry.",
        tip: "Use the suggested canonical key when one is offered, so the same value is counted together across schemas and years.",
        example: EXAMPLE_ANALYTICS,
      },
      {
        id: "second-field",
        target: "schema-add-field",
        title: "Add another field",
        body: "Click Add Field Row again, or hover between two fields and click Add Field. Name it Extra units and set its type to number.",
        example: EXAMPLE_EXTRA_UNITS,
      },
      {
        id: "computed",
        target: "field-computed",
        title: "Compute a field from others",
        body: "Click the sigma icon to make a field computed. Its value is calculated from other number fields, not read from the document. Choose an operation (Average, Sum, Max or Min) and tick the fields it depends on.",
        tip: "Only number fields can be dependencies. If the list says No other fields available, set another field's type to number first.",
        example: EXAMPLE_COMPUTED,
      },
      {
        id: "locked",
        target: "field-lock",
        title: "Lock a field",
        body: "Click the lock icon to lock a field. A locked field can't be edited by students. Use it for values that only admins should set.",
        example: EXAMPLE_LOCKED,
      },
      {
        id: "section",
        target: "field-insert-zone",
        title: "Add a section",
        body: "Hover the line between two fields, click Add Section, and type a name, for example Enrolment load. The section's first field opens right away, so give it a Label Name. Fields placed below a section belong to it.",
        example: EXAMPLE_SECTION,
      },
      {
        id: "save",
        target: "schema-save",
        title: "Save the schema",
        body: "Click Save Schema. Saving is blocked until every field has a Label Name. Then activate the schema from the schema list when it is ready to use.",
        tip: "Activating a schema makes it the only active one for its document type. The previous active schema becomes a draft.",
      },
      {
        id: "test",
        target: "schema-live-test",
        title: "Test with a real file",
        body: "Open Live File Testing to run a sample document through the schema before students rely on it.",
      },
    ],
  },
  dashboard: {
    moduleKey: "dashboard",
    title: "Overview",
    steps: [
      {
        id: "checklist",
        target: "dashboard-checklist",
        title: "Setup checklist",
        body: "This card shows which setup steps are done and how many required steps are left. Click Go on a step to open its page. Hide for now removes the card. Restart tutorial in the Help menu brings it back.",
        tip: "The card hides on its own once the required setup is complete. Branding and forms are recommended, not required.",
      },
      {
        id: "stats",
        target: "dashboard-stats",
        title: "Key numbers",
        body: "These cards show the main totals for the school year shown at the top of the page, such as total submissions and the pending queue.",
      },
      {
        id: "clearance",
        target: "dashboard-clearance",
        title: "Department clearance",
        body: "Each department has a clearance rate, shown as a percentage and a bar. Use it to see which departments are behind.",
      },
      {
        id: "quick-actions",
        target: "dashboard-quick-actions",
        title: "Quick actions",
        body: "These shortcuts open the pages you use most when setting up: Configure School Year, Build Schema and Manage Requirements.",
      },
      {
        id: "help",
        title: "Help at any time",
        body: "Click Help at the top right for this page's guide. Restart tutorial in the same menu starts the whole setup guide again.",
      },
    ],
  },
  students: {
    moduleKey: "students",
    title: "Students",
    steps: [
      {
        id: "school-year",
        target: "students-school-year",
        title: "Choose a school year",
        body: "The list shows the students enrolled in the school year you pick here. The active year is marked (Active).",
      },
      {
        id: "dept-cards",
        target: "students-dept-cards",
        title: "Department totals",
        body: "Each card shows a department's code, how many students are enrolled, and how complete their documents are. The last card gives the total for all departments.",
      },
      {
        id: "search",
        target: "students-search",
        title: "Search",
        body: "Search by student name, student ID, email, or department.",
      },
      {
        id: "status",
        target: "students-status-filter",
        title: "Filter by document status",
        body: "Choose Complete, Pending Review, Incomplete or Not Submitted to see only students at that stage. All Statuses shows everyone.",
      },
      {
        id: "department",
        target: "students-dept-filter",
        title: "Filter by department",
        body: "Choose one department to see only its students. All Departments shows every department.",
      },
      {
        id: "table",
        target: "students-table",
        title: "The student list",
        body: "Each row shows the student's name, ID, department, classification and document status. This page only shows the list. It does not change any records.",
        tip: "Filters and search work together, so you can narrow the list by status and department at the same time.",
      },
    ],
  },
  "schema-registry": {
    moduleKey: "schema-registry",
    title: "Schema registry",
    steps: [
      {
        id: "search",
        target: "registry-search",
        title: "Search the registry",
        body: "Search by document type name, code, or schema name.",
      },
      {
        id: "filters",
        target: "registry-filters",
        title: "Filter the list",
        body: "Show all document types, only Structured ones (they are read by a schema), or only Classification Only ones. You can also filter by school year.",
      },
      {
        id: "card",
        target: "registry-card",
        title: "A document type and its schemas",
        body: "Each card is one document type. The badge shows whether it is Structured Extraction or Classification Only. Under it, you see the schemas for that document type.",
      },
      {
        id: "schema-row",
        target: "registry-schema-row",
        title: "Open a schema's details",
        body: "Click a schema in the list to see its details, including its fields and the prompt used to create it. Open in Builder in that window takes you to the Schema Builder to edit it.",
        tip: "Use Show more on a card to see the schemas that are hidden at first.",
      },
      {
        id: "read-only",
        title: "Read-only overview",
        body: "This page is an overview. It does not change any schema. Make changes in the Schema Builder.",
      },
    ],
  },
  reports: {
    moduleKey: "reports",
    title: "Reports",
    steps: [
      {
        id: "choose",
        target: "reports-card",
        title: "Choose a report",
        body: "There are three reports: the Student Report, the Adviser Report, and the Document Requirements Report. Each card says what its workbook contains.",
      },
      {
        id: "generate",
        target: "reports-generate",
        title: "Generate the Excel file",
        body: "Click Generate XLSX to build the report and download it as an Excel workbook. The button shows Generating while the file is built. Wait for the download to finish before you open it.",
        tip: "Each report has one sheet per school year.",
      },
    ],
  },
  branding: {
    moduleKey: "branding",
    title: "Branding",
    steps: [
      {
        id: "logo",
        target: "branding-logo",
        title: "Institution logo",
        body: "This is the logo for the institution. A logo that has been uploaded is shown here.",
      },
      {
        id: "upload",
        target: "branding-upload",
        title: "Upload a logo",
        body: "Click Upload logo and choose a PNG, JPEG, WebP or SVG file of 5 MB or smaller. The new logo is saved as soon as the upload finishes.",
      },
      {
        id: "name",
        target: "branding-name",
        title: "Institution name",
        body: "The name shown in the sidebar header. The WMSU part of the sidebar label is fixed and does not change.",
        example: EXAMPLE_BRANDING_NAME,
      },
      {
        id: "address",
        target: "branding-address",
        title: "Address lines",
        body: "Type one address line per row, for example the campus address on one line and the city and province on the next.",
      },
      {
        id: "save",
        target: "branding-save",
        title: "Save branding",
        body: "Click Save branding to keep the name, address and contact line. The logo does not need this step.",
        tip: "A confirmation message appears when the branding is saved.",
      },
    ],
  },
  admins: {
    moduleKey: "admins",
    title: "Administrators",
    steps: [
      {
        id: "invite",
        target: "admins-invite",
        title: "Invite an administrator",
        body: "Click Invite Administrator to open a form that invites someone to be an administrator. Enter their first name, last name and email.",
      },
      {
        id: "tabs",
        target: "admins-tabs",
        title: "Four views",
        body: "Administrators lists current administrators. Invitations lists people you have invited. Promote Adviser lists advisers who can become administrators. History records the changes to administrator access.",
      },
      {
        id: "remove",
        target: "admins-remove",
        title: "Remove an administrator",
        body: "Remove takes away administrator access. An adviser who was promoted goes back to being an adviser. A person who was invited directly as an administrator is removed from the system.",
        tip: "Removing an administrator takes effect straight away, so check the name before you click Remove.",
      },
      {
        id: "promote",
        target: "admins-tab-promote",
        press: "admins-tab-promote",
        title: "Promote an adviser",
        body: "Promote Adviser lists advisers. Click Promote to Admin to give an adviser administrator access. Promotion is only done from this list.",
      },
      {
        id: "promote-button",
        target: "admins-promote",
        press: "admins-tab-promote",
        title: "The promote button",
        body: "Promote to Admin gives that adviser administrator access. The change is recorded in History.",
      },
      {
        id: "history",
        target: "admins-tab-history",
        press: "admins-tab-history",
        title: "History",
        body: "History shows the changes made to administrator access, so you can check who was promoted or removed and when.",
      },
    ],
  },
  "activity-logs": {
    moduleKey: "activity-logs",
    title: "Activity logs",
    steps: [
      {
        id: "search",
        target: "activity-search",
        title: "Search the logs",
        body: "Search by administrator or by the name of the item that was changed.",
      },
      {
        id: "admin",
        target: "activity-filter-admin",
        title: "Filter by administrator",
        body: "Choose one administrator to see only the changes they made.",
      },
      {
        id: "module",
        target: "activity-filter-module",
        title: "Filter by module",
        body: "Choose a module, such as Advisers, Academic programs or Requirements, to see changes made in that part of the system.",
      },
      {
        id: "action",
        target: "activity-filter-action",
        title: "Filter by action",
        body: "Choose an action to narrow the list further.",
      },
      {
        id: "table",
        target: "activity-table",
        title: "Each entry",
        body: "Each row shows who made the change, what changed, and when. The list is newest first.",
      },
      {
        id: "retention",
        target: "activity-retention",
        title: "How long logs are kept",
        body: "Keep logs for chooses how long entries are kept. Until you pick a period, logs are kept forever. Saving a shorter period asks you to confirm first, and older entries are deleted the next time the server starts.",
        tip: "Nothing is deleted when you only look at this page.",
      },
      {
        id: "purge",
        target: "activity-purge-button",
        title: "Delete older logs",
        body: "Choose an age in Delete logs older than, then click Delete logs. You are asked to confirm first, and the dialog shows how many entries would be deleted. This cannot be undone.",
        tip: "Use this carefully. Deleted logs cannot be recovered.",
      },
    ],
  },
  analytics: {
    moduleKey: "analytics",
    title: "Analytics",
    steps: [
      {
        id: "department",
        target: "analytics-department",
        title: "Choose a department",
        body: "All Departments combines every program. Pick one program to narrow the Snapshot, the Trends and the Excel export to that program. The Registry is not filtered by department.",
        example: EXAMPLE_ANALYTICS_DEPARTMENT,
      },
      {
        id: "school-year",
        target: "analytics-school-year",
        title: "Choose a school year",
        body: "The school year picker shows one year's answers on the Snapshot. Trends use the From Year and To Year range instead, so this picker is hidden on those tabs.",
        tip: "The school year picker appears only on the Snapshot tab.",
      },
      {
        id: "snapshot",
        target: "analytics-tab-snapshot",
        press: "analytics-tab-snapshot",
        title: "Snapshot: results for one year",
        body: "The Snapshot shows the results for each analytics field, for the school year and department you picked.",
      },
      {
        id: "export",
        target: "analytics-export",
        title: "Export to Excel",
        body: "Click Export XLSX to download the Snapshot as an Excel workbook. It uses the school year and department you picked. The file name starts with the school year.",
        tip: "Export XLSX works on the Snapshot tab only. It is greyed out on Trends and Registry.",
        example: EXAMPLE_ANALYTICS_EXPORT,
      },
      {
        id: "trends",
        target: "analytics-tab-trends",
        press: "analytics-tab-trends",
        title: "Trends: changes across years",
        body: "The Trends tab shows how analytics fields change from one school year to the next, so you can see growth or decline.",
      },
      {
        id: "years",
        target: "analytics-trend-years",
        title: "Set the year range",
        body: "From Year and To Year set the years the trends cover. The enrolment chart and the field charts both use this range. The years offered are 2023 to 2027.",
      },
      {
        id: "fields",
        target: "analytics-trend-fields",
        title: "Choose the fields to chart",
        body: "Tick the analytics fields you want to chart. Only fields tagged analytics in the Schema Builder are listed. Each ticked field gets its own chart.",
        tip: "If no fields are listed, the page shows No analytics fields. Tag a field as analytics in the Schema Builder first.",
      },
      {
        id: "enrolment",
        target: "analytics-enrolment",
        title: "Enrolment Growth",
        body: "This chart shows how many students enrolled each year and how many of them were verified, for the department you picked.",
        tip: "The chart does not appear until there is enrolment data for the chosen range.",
      },
      {
        id: "chart-type",
        target: "analytics-chart-type",
        title: "Change the chart type",
        body: "Each field chart has a type picker at the top right. Pick another chart type, or a table of the numbers. Your choice is kept for that field.",
        tip: "The picker appears once a field chart has data.",
      },
      {
        id: "registry",
        target: "analytics-tab-registry",
        press: "analytics-tab-registry",
        title: "Registry: the analytics keys",
        body: "The Registry lists the canonical keys. A canonical key is the analytics name for a value. Every schema that uses the same key feeds the same analytics field, across schemas and years.",
      },
      {
        id: "add",
        target: "registry-add",
        title: "Add a key",
        body: "Click Add Key to create a key. Keys used in a schema but not yet in the Registry are listed in an amber box at the top. Click Register on one of them to create it with the key already filled in.",
      },
      {
        id: "edit",
        target: "registry-edit",
        title: "Edit an entry",
        body: "Click the pencil to change an entry's label, type and group. The canonical key cannot be changed, because schemas use it to link their fields.",
        example: EXAMPLE_ANALYTICS_EDIT,
      },
      {
        id: "delete",
        target: "registry-deactivate",
        title: "Remove an entry (deactivate)",
        body: "The Registry does not delete entries. Click the ban icon to deactivate one. An inactive key loses its curated label and group, but its fields still appear with their schema labels. Click the icon again to reactivate it at any time.",
        tip: "Deactivating does not delete any schema or field.",
      },
    ],
  },
  forms: {
    moduleKey: "forms",
    title: "Forms",
    steps: [
      {
        id: "start",
        target: "forms-create",
        title: "Create a form",
        body: "A form is a document students fill in, either printed or online. Click New to open Create form. The guide opens the dialog for you in the next steps.",
        tip: "Forms belong to a document type. Only structured forms can be chosen on a requirement.",
      },
      {
        id: "dialog-name",
        dialog: "create-form",
        target: "forms-create-name",
        title: "Name the form",
        body: "Type a name, for example Admission Form 2026-2027. Admins see this name in the form list and when they pick a form for a requirement.",
        example: EXAMPLE_FORM_BLANK,
      },
      {
        id: "dialog-doctype",
        dialog: "create-form",
        target: "forms-create-doctype",
        title: "Choose the document type",
        body: "The document type decides which requirement can use this form. A requirement only lists forms for its own document type. If you ground the form on an extraction schema below, the document type is set from that schema.",
      },
      {
        id: "dialog-blank",
        dialog: "create-form",
        target: "forms-create-blank",
        title: "Blank: start from an empty form",
        body: "Blank creates an empty structured form with no fields. Use it when you want to lay out the form yourself. After you create it, add sections and fields in the editor on the right. No AI is used.",
        example: EXAMPLE_FORM_BLANK,
      },
      {
        id: "dialog-ai",
        dialog: "create-form",
        press: "forms-create-ai",
        target: "forms-create-ai",
        title: "Generate with AI",
        body: "Generate with AI builds the form layout from a description. Without a schema, the AI proposes its own fields, so the description is required. Check the result before you use it. Fields the AI cannot match are flagged.",
        example: EXAMPLE_FORM_AI,
      },
      {
        id: "dialog-grounding",
        dialog: "create-form",
        press: "forms-create-ai",
        target: "forms-create-grounding",
        title: "Ground on an extraction schema (optional)",
        body: "Pick an active extraction schema to use its fields. The AI arranges those exact fields into the form and does not invent new ones. The form is then linked to the schema, which is what Sync fields works from.",
        tip: "Choose No schema to let the AI propose its own fields.",
        example: EXAMPLE_FORM_GROUNDED,
      },
      {
        id: "dialog-description",
        dialog: "create-form",
        press: "forms-create-ai",
        target: "forms-create-description",
        title: "Describe the layout",
        body: "Without a schema, describe the form and its fields. The description is required. With a schema, it is optional: use it to group fields into sections, add headings, or ask for a compact layout.",
      },
      {
        id: "dialog-submit",
        dialog: "create-form",
        target: "forms-create-submit",
        title: "Create the form",
        body: "Click Create form to save it. It opens in the editor on the right. If the AI could not match some fields, map or delete them before you save the form.",
        tip: "Cancel closes the dialog and creates nothing.",
      },
      {
        id: "editor",
        title: "Edit the form",
        body: "Use Edit to change the layout and fields, and Preview to see the printed result. Save keeps your changes. Export .docx gives you a Word copy.",
      },
      {
        id: "sync",
        target: "forms-sync",
        title: "Sync fields",
        body: "Sync fields works on a form that is linked to an extraction schema. It compares the form's fields with the schema: new fields are added to the schema, changed labels or types are updated, and fields the form no longer has are removed. Analytics fields and fields that a computed field uses are kept. Sync changes the schema straight away.",
        tip: "Sync fields only appears for a form that is linked to a schema. Use it after you change the form's fields.",
        example: EXAMPLE_FORM_SYNC,
      },
      {
        id: "draft-schema",
        target: "forms-draft-schema",
        title: "Draft schema",
        body: "Draft schema works on a form that has no linked schema. It creates a new draft extraction schema from the form's fields and links the form to it. The draft is not active. Review it in the Schema Builder, then activate it there.",
        tip: "A form that already has a linked schema shows Sync fields instead.",
      },
    ],
  },
  requirements: {
    moduleKey: "requirements",
    title: "Requirements",
    steps: [
      {
        id: "add-solo",
        target: "requirements-add-solo",
        title: "Add a solo requirement",
        body: "Click Add Solo for one document that every student in this school year must submit, such as a Report Card. Then choose the document type from the list. A document type that is already used in another requirement of this year is not listed again.",
        example: EXAMPLE_SOLO_REQUIREMENT,
      },
      {
        id: "add-group",
        target: "requirements-add-group",
        title: "Add a group of alternatives",
        body: "Click Add Group when students can choose between several documents. For example, a student can prove financial status with a bank statement or a scholarship letter. Name the group, then click \"+ Add document type to this group\" for each alternative. A new group asks for one of its alternatives to be submitted.",
        tip: "The count is set to 1 for a new group. Students need one of the alternatives, not all of them.",
        example: EXAMPLE_GROUP_REQUIREMENT,
      },
      {
        id: "schema",
        target: "requirement-schema",
        title: "Add a schema (optional)",
        body: "A schema lists the values the system reads from an uploaded file of this document type, for example the student's name or units taken. Pick the schema here so each upload is read and its values reach analytics. Create and activate the schema in the Schema Builder first. Choose No schema to keep the file without reading it.",
        tip: "This control appears on a solo requirement. Groups have one for each alternative.",
        example: EXAMPLE_SCHEMA_PICK,
      },
      {
        id: "form",
        target: "requirement-form",
        title: "Add a form (optional)",
        body: "A form is a blank document that students can fill in online or download, such as the enrolment form for this document type. Pick it here. Only forms for this document type are listed, and only forms built as structured forms appear. PDF-overlay forms are not listed. Create the form on the Forms page first.",
        tip: "If a form is missing from the list, check that it is for this document type and was built as a structured form.",
      },
      {
        id: "form-schema",
        target: "requirement-form",
        title: "A form can suggest its schema",
        body: "When a form is grounded on a schema, the page offers that schema for the same document type. Click Use it to apply the suggestion. A red note means the form and the chosen schema do not match, so check which one is right before you save.",
      },
      {
        id: "save",
        target: "requirements-save",
        title: "Save the requirements",
        body: "Click Save Requirements to keep your changes. The requirements apply to the school year shown at the top of the page.",
        tip: "Save Requirements is not available once the school year is closed.",
      },
      {
        id: "year",
        title: "Check the school year",
        body: "Requirements apply to the school year shown at the top of the page.",
      },
      {
        id: "closed",
        title: "Closed years are locked",
        body: "Once a school year is closed, its requirements can't be changed.",
      },
    ],
  },
};

/** Maps an admin route to its tour. Routes without a tour yet get no Guide option. */
export const MODULE_KEY_BY_PATH: Record<string, string> = {
  "/admin/settings/school-year": "school-years",
  "/admin/departments": "departments",
  "/admin/advisers": "advisers",
  "/admin/document-types": "document-types",
  "/admin/extraction-schemas": "extraction-schemas",
  "/admin/requirements": "requirements",
  "/admin/forms": "forms",
  "/admin/analytics": "analytics",
  "/admin/dashboard": "dashboard",
  "/admin/students": "students",
  "/admin/extraction-schemas/registry": "schema-registry",
  "/admin/reports": "reports",
  "/admin/settings/branding": "branding",
  "/admin/admins": "admins",
  "/admin/activity-logs": "activity-logs",
};

export function moduleKeyForPath(pathname: string): string | null {
  return MODULE_KEY_BY_PATH[pathname] ?? null;
}
