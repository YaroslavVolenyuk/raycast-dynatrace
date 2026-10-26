import { List, ActionPanel, Action, Icon, Alert, confirmAlert, useNavigation } from "@raycast/api";
import { DQL_TEMPLATES, type DqlTemplate } from "./templates";
import { fenceCode } from "../../lib/markdown";

interface TemplateListProps {
  /** The query currently in the form; replacing a non-empty one asks first. */
  currentQuery: string;
  onPick: (query: string) => void;
}

const SECTIONS = ["Logs", "Spans", "Events", "Metrics"] as const;

export default function TemplateList({ currentQuery, onPick }: TemplateListProps) {
  const { pop } = useNavigation();

  async function use(t: DqlTemplate) {
    if (currentQuery.trim() && currentQuery.trim() !== t.query) {
      const ok = await confirmAlert({
        title: "Replace the current query?",
        primaryAction: { title: "Replace", style: Alert.ActionStyle.Destructive },
      });
      if (!ok) return;
    }
    onPick(t.query);
    pop();
  }

  return (
    <List navigationTitle="Query Templates" searchBarPlaceholder="Search templates…" isShowingDetail>
      {SECTIONS.map((section) => (
        <List.Section key={section} title={section}>
          {DQL_TEMPLATES.filter((t) => t.section === section).map((t) => (
            <List.Item
              key={t.title}
              title={t.title}
              keywords={[t.query]}
              detail={<List.Item.Detail markdown={fenceCode(t.query)} />}
              actions={
                <ActionPanel>
                  <Action title="Use Template" icon={Icon.Code} onAction={() => use(t)} />
                  <Action.CopyToClipboard title="Copy Query" content={t.query} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}
