import { Action, ActionPanel, Icon } from "@raycast/api";
import { TIMEFRAMES, type TimeframeValue } from "../lib/listArgs";

/** Change Timeframe (⌘⇧T) for Search Logs and Search Traces; the current one is checked. */
export default function TimeframeSubmenu(props: { value: TimeframeValue; onChange: (value: TimeframeValue) => void }) {
  return (
    <ActionPanel.Submenu
      title="Change Timeframe"
      icon={Icon.Clock}
      shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
    >
      {TIMEFRAMES.map((t) => (
        <Action
          key={t.value}
          title={t.title}
          icon={t.value === props.value ? Icon.Checkmark : undefined}
          onAction={() => props.onChange(t.value)}
        />
      ))}
    </ActionPanel.Submenu>
  );
}
