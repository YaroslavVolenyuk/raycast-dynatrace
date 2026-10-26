import { List, ActionPanel, Action, Icon, Color, useNavigation } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useRef, useState } from "react";
import { autocompleteDql, applySuggestion, type DqlSuggestion, type TenantConfig } from "../../../sdk";

// Raycast's Form.TextArea does not expose the cursor, so suggestions are always
// for the end of the query — the way DQL is usually written, pipe after pipe.

const KIND_TAGS: Record<string, { label: string; color: Color }> = {
  COMMAND_NAME: { label: "command", color: Color.Purple },
  FUNCTION_NAME: { label: "function", color: Color.Blue },
  FIELD_NAME: { label: "field", color: Color.Green },
  OPERATOR: { label: "operator", color: Color.Orange },
  DATA_OBJECT: { label: "data object", color: Color.Magenta },
  PIPE: { label: "next command", color: Color.SecondaryText },
};

function kindTag(kind: string): { value: string; color: Color } {
  const tag = KIND_TAGS[kind];
  return tag
    ? { value: tag.label, color: tag.color }
    : { value: kind.toLowerCase().replace(/_/g, " "), color: Color.SecondaryText };
}

interface SuggestListProps {
  tenant: TenantConfig;
  query: string;
  /** Receives the query with the picked suggestion inserted. */
  onChange: (query: string) => void;
}

export default function SuggestList({ tenant, query: initialQuery, onChange }: SuggestListProps) {
  const { pop } = useNavigation();
  const [query, setQuery] = useState(initialQuery);
  const [search, setSearch] = useState("");
  const abortable = useRef<AbortController>(null);

  const { data, isLoading, error } = usePromise(
    (q: string) => autocompleteDql(tenant, q, { signal: abortable.current?.signal }),
    [query],
    { abortable },
  );

  function insert(s: DqlSuggestion, keepOpen: boolean) {
    // A new pipe starts a new line, as in the Dynatrace editor.
    const next = s.kind === "PIPE" ? `${query.trimEnd()}\n| ` : applySuggestion(query, s);
    onChange(next);
    if (!keepOpen) return pop();
    setQuery(next);
    setSearch("");
  }

  const tail = query.split("\n").pop() ?? "";

  return (
    <List
      isLoading={isLoading}
      navigationTitle="Suggest Next"
      searchText={search}
      onSearchTextChange={setSearch}
      searchBarPlaceholder={tail ? `After “${tail.slice(-40)}”…` : "Start of the query…"}
    >
      {error ? (
        <List.EmptyView icon={Icon.Warning} title="Could Not Load Suggestions" description={error.message} />
      ) : (
        <List.EmptyView
          icon={Icon.LightBulb}
          title="No Suggestions"
          description="Nothing fits at the end of the query."
        />
      )}
      <List.Section title={data?.context?.synopsis} subtitle={data?.context?.info}>
        {(data?.suggestions ?? []).map((s) => (
          <List.Item
            key={s.text}
            title={{ value: s.label, tooltip: s.synopsis }}
            subtitle={s.info}
            keywords={[s.text]}
            accessories={[...(s.dataType ? [{ text: s.dataType }] : []), { tag: kindTag(s.kind) }]}
            actions={
              <ActionPanel>
                <Action title="Insert" icon={Icon.Plus} onAction={() => insert(s, false)} />
                <Action
                  title="Insert and Suggest Again"
                  icon={Icon.PlusCircle}
                  shortcut={{ modifiers: ["cmd"], key: "return" }}
                  onAction={() => insert(s, true)}
                />
                {s.synopsis && <Action.CopyToClipboard title="Copy Synopsis" content={s.synopsis} />}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
