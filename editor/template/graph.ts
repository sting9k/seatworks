import type { Relation, Role } from "../../shared/contracts/profile.ts";
import type { Asked, Template } from "./read-template.ts";
import { TOOL_GROUPS } from "./tool-groups.ts";

export const PROPERTIES = ["root", "delegates", "writes", "reading", "watches", "humanDoor"] as const;
export type Property = (typeof PROPERTIES)[number];

type RoleNode = {
  readonly kind: "role";
  readonly id: string;
  readonly name: string;
  readonly properties: readonly Property[];
  readonly speaks: readonly Relation[];
  readonly models: readonly string[];
  /** The groups its properties bring, each tool ticked when the role is shown it. */
  readonly groups: readonly {
    readonly id: string;
    readonly name: string;
    readonly tools: readonly { readonly name: string; readonly ticked: boolean }[];
  }[];
  readonly file: string | null;
};

export type GraphNode =
  | RoleNode
  | { readonly kind: "human"; readonly id: "human" }
  | {
      readonly kind: "skill";
      readonly id: string;
      readonly name: string;
      readonly description: string;
      readonly file: string;
    }
  | { readonly kind: "tools"; readonly id: string; readonly name: string; readonly tools: readonly string[] }
  | {
      readonly kind: "question";
      readonly id: string;
      readonly name: string;
      readonly asks: string;
      readonly on: readonly string[];
      readonly tells: string | null;
      readonly active: boolean;
      readonly file: string;
    }
  | {
      readonly kind: "moment";
      readonly id: string;
      readonly name: string;
      readonly asks: string;
      readonly countedInCode: boolean;
      readonly active: boolean;
      readonly file: string;
    }
  | { readonly kind: "step"; readonly id: string; readonly name: string; readonly text: string };

export type Wire =
  | {
      readonly kind: "spawns" | "skill" | "watches" | "human" | "then" | "does";
      readonly from: string;
      readonly to: string;
    }
  | { readonly kind: "tools"; readonly from: string; readonly to: string; readonly tools: readonly string[] };

export type Graph = { readonly nodes: readonly GraphNode[]; readonly wires: readonly Wire[] };

const roleId = (name: string) => `role:${name}`;
const wordsOf = (asked: Asked) => asked.spec.noul ?? asked.spec.choice ?? "";

/** A template as a person sees it: every node its files name and every wire they join (EDITOR.md). */
export function graphOf(template: Template): Graph {
  const roles = [...template.profile.roles.values()];
  const nodes: GraphNode[] = [{ kind: "human", id: "human" }];
  const wires: Wire[] = [];

  for (const role of roles) {
    const file = template.file.roles[role.name];
    nodes.push(roleNode(role, file?.prompt ?? null));
    for (const spawned of role.spawns) wires.push({ kind: "spawns", from: roleId(role.name), to: roleId(spawned) });
    for (const skill of file?.skills ?? [])
      wires.push({ kind: "skill", from: `skill:${skill}`, to: roleId(role.name) });
    if (role.humanDoor || role.speaksTo.has("human"))
      wires.push({ kind: "human", from: roleId(role.name), to: "human" });
  }
  for (const skill of template.skills.values())
    nodes.push({
      kind: "skill",
      id: `skill:${skill.name}`,
      name: skill.name,
      description: skill.description,
      file: `skills/${skill.name}/SKILL.md`,
    });

  for (const group of TOOL_GROUPS) {
    if (group.follows !== "optional") continue;
    const id = `tools:${group.id}`;
    nodes.push({ kind: "tools", id, name: group.name, tools: group.tools });
    for (const role of roles) {
      const tools = group.tools.filter((tool) => role.tools.has(tool));
      if (tools.length > 0) wires.push({ kind: "tools", from: id, to: roleId(role.name), tools });
    }
  }

  for (const step of template.steps) {
    const id = `step:${step.id}`;
    nodes.push({ kind: "step", id, name: step.name, text: step.text });
    if (step.role !== null && template.profile.roles.has(step.role))
      wires.push({ kind: "does", from: roleId(step.role), to: id });
    for (const next of step.then) wires.push({ kind: "then", from: id, to: `step:${next}` });
  }

  for (const question of template.questions)
    nodes.push({
      kind: "question",
      id: `question:${question.name}`,
      name: question.name,
      asks: wordsOf(question),
      on: question.spec.on ?? [],
      tells: question.spec.tells ?? null,
      active: question.active,
      file: template.file.reflex!,
    });
  for (const moment of template.moments) {
    const id = `moment:${moment.name}`;
    nodes.push({
      kind: "moment",
      id,
      name: moment.name,
      asks: wordsOf(moment),
      countedInCode: moment.spec.by === "code",
      active: moment.active,
      file: template.file.watch!,
    });
    for (const watched of moment.spec.watches ?? [])
      if (template.profile.roles.has(watched)) wires.push({ kind: "watches", from: id, to: roleId(watched) });
  }
  return { nodes, wires };
}

function roleNode(role: Role, prompt: string | null): RoleNode {
  const groups = TOOL_GROUPS.flatMap((group) => {
    if (group.follows === "optional") return [];
    const tools = group.tools.map((name) => ({ name, ticked: role.tools.has(name) }));
    return group.follows(role) || tools.some((tool) => tool.ticked) ? [{ id: group.id, name: group.name, tools }] : [];
  });
  return {
    kind: "role",
    id: roleId(role.name),
    name: role.name,
    properties: PROPERTIES.filter((property) => role[property]),
    speaks: [...role.speaksTo],
    models: role.models,
    groups,
    file: prompt,
  };
}
