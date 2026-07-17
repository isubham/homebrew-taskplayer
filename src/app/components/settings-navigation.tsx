import { SETTINGS_NAV_LABEL } from "../constants";

type SettingsSection = {
  key: string;
  icon: string;
  color: string;
  title: string;
  subtitle: string;
};

type SettingsNavigationProps = {
  sections: SettingsSection[];
  activeKey: string;
  onSelect: (key: string) => void;
};

export function SettingsNavigation({ sections, activeKey, onSelect }: SettingsNavigationProps) {
  return (
    <nav className="settings-nav" aria-label={SETTINGS_NAV_LABEL}>
      {sections.map((section) => (
        <button
          key={section.key}
          type="button"
          className={`settings-nav-item${activeKey === section.key ? " active" : ""}`}
          aria-current={activeKey === section.key ? "page" : undefined}
          onClick={() => onSelect(section.key)}
        >
          <span className="settings-nav-icon" style={{ background: `${section.color}22`, color: section.color }}>
            {section.icon}
          </span>
          <span className="settings-nav-copy">
            <strong>{section.title}</strong>
            <small>{section.subtitle}</small>
          </span>
        </button>
      ))}
    </nav>
  );
}
