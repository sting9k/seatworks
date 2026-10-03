/** A step of setting up, in the order a first team needs them. */
export type Step = {
  readonly id: "template" | "agents" | "classifier" | "project";
  readonly label: string;
  readonly done: boolean;
};

type Has = {
  /** Templates installed on this machine. */
  readonly templates: number;
  /** Agent profiles an installed template names that Paseo does not have, or has with no model to run. */
  readonly unmatched: number;
  /** Whether the classifier is switched off or has its key. */
  readonly classifierSettled: boolean;
  /** Projects attached. */
  readonly projects: number;
};

/** The four steps and which are done; the strip that shows them goes once all are. */
export function setupOf(has: Has): readonly Step[] {
  return [
    { id: "template", label: "Template", done: has.templates > 0 },
    { id: "agents", label: "Agents", done: has.templates > 0 && has.unmatched === 0 },
    { id: "classifier", label: "Classifier", done: has.classifierSettled },
    { id: "project", label: "Project", done: has.projects > 0 },
  ];
}
