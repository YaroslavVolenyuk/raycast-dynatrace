// Shared by the Detail view render tests: the Raycast components as named stubs
// plus a serializer for the element tree a view returns, so the tree can be
// pinned without a React renderer.

import { isValidElement, type ReactElement, type ReactNode } from "react";

export type Node = { type: string; props: Record<string, unknown>; children?: Node[]; pushes?: Node } | string;

/** Named stand-ins for the Raycast components a Detail view renders. */
export function raycastStubs() {
  const stub = (name: string) => Object.assign(() => null, { displayName: name });
  const TagList = Object.assign(stub("Detail.Metadata.TagList"), { Item: stub("Detail.Metadata.TagList.Item") });
  const Metadata = Object.assign(stub("Detail.Metadata"), {
    Label: stub("Detail.Metadata.Label"),
    Link: stub("Detail.Metadata.Link"),
    Separator: stub("Detail.Metadata.Separator"),
    TagList,
  });
  return {
    Detail: Object.assign(stub("Detail"), { Metadata }),
    ActionPanel: stub("ActionPanel"),
    Action: Object.assign(stub("Action"), {
      OpenInBrowser: stub("Action.OpenInBrowser"),
      CopyToClipboard: stub("Action.CopyToClipboard"),
    }),
  };
}

function typeName(type: unknown): string {
  if (typeof type === "string") return type;
  return (type as { displayName?: string }).displayName ?? "Unknown";
}

/** Runs an `onAction` handler and returns the element it pushed, if any. */
export type RunAction = (onAction: () => void) => ReactElement<Record<string, unknown>> | undefined;

// Flattens fragments and drops empty children so the output reflects what Raycast renders.
function serializeChildren(children: ReactNode, runAction?: RunAction): Node[] {
  const list = Array.isArray(children) ? children : [children];
  return list.flatMap((c): Node[] => {
    if (c == null || typeof c === "boolean") return [];
    if (Array.isArray(c)) return serializeChildren(c, runAction);
    if (!isValidElement(c)) return [String(c)];
    const el = c as ReactElement<Record<string, unknown>>;
    if (typeof el.type === "symbol") return serializeChildren(el.props.children as ReactNode, runAction);
    return [serialize(el, runAction)];
  });
}

export function serialize(el: ReactElement<Record<string, unknown>>, runAction?: RunAction): Node {
  const props: Record<string, unknown> = {};
  let pushes: Node | undefined;
  for (const [k, v] of Object.entries(el.props)) {
    if (k === "children") continue;
    if (isValidElement(v)) props[k] = serialize(v as ReactElement<Record<string, unknown>>, runAction);
    else if (typeof v === "function") {
      props[k] = "[Function]";
      const pushed = k === "onAction" ? runAction?.(v as () => void) : undefined;
      if (pushed) pushes = serialize(pushed, runAction);
    } else props[k] = v;
  }
  const children = serializeChildren(el.props.children as ReactNode, runAction);
  return {
    type: typeName(el.type),
    props,
    ...(children.length ? { children } : {}),
    ...(pushes ? { pushes } : {}),
  };
}
