// Renders a message template body against a campaign recipient's snapshot
// data. Deliberately minimal for MVP: only {{name}} (full snapshotted
// name) and {{firstName}} (first word of it) are supported. Extending this
// later to support more variables (branch name, appointment type, etc.)
// means adding cases here, not touching the worker.
export interface TemplateVariables {
  name: string;
  firstName: string;
}

export function variablesFromSnapshotName(snapshotName: string): TemplateVariables {
  const firstName = snapshotName.trim().split(/\s+/)[0] ?? snapshotName;
  return { name: snapshotName, firstName };
}

export function renderTemplate(bodyPreview: string, variables: TemplateVariables): string {
  return bodyPreview
    .replace(/\{\{\s*name\s*\}\}/gi, variables.name)
    .replace(/\{\{\s*firstName\s*\}\}/gi, variables.firstName);
}
