interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: "feature" | "fix" | "improvement" | "security" | "breaking";
    description: string;
  }[];
}

const changelog: ChangelogEntry[] = [
  {
    version: "1.0.0",
    date: "2025-01-15",
    changes: [
      { type: "feature", description: "Initial release of Product 3D Customizer & Upload" },
      { type: "feature", description: "3D T-Shirt designer with real-time preview" },
      { type: "feature", description: "Multiple print location support (Front, Back, Sleeves)" },
      { type: "feature", description: "DTF/Sublimation file generation" },
      { type: "feature", description: "Asset Sets for product configuration" },
      { type: "feature", description: "Shopify GraphQL API 2025-10 integration" },
      { type: "feature", description: "GDPR compliance with all Shopify webhooks" },
      { type: "feature", description: "Multi-tenant architecture with shop isolation" },
      { type: "security", description: "Cloudflare R2 storage with signed URLs" },
      { type: "security", description: "Row-level database security" },
    ]
  },
  {
    version: "0.9.0",
    date: "2024-12-20",
    changes: [
      { type: "feature", description: "Beta release for testing partners" },
      { type: "feature", description: "Basic upload functionality" },
      { type: "feature", description: "Order webhook integration" },
      { type: "improvement", description: "Performance optimizations for 3D rendering" },
      { type: "fix", description: "Mobile Safari compatibility issues" },
    ]
  },
];

const styles = {
  title: { fontSize: "2rem", fontWeight: 700, color: "#1f2937", marginBottom: "0.5rem" },
  subtitle: { fontSize: "0.875rem", color: "#6b7280", marginBottom: "2rem" },
  divider: { height: "1px", background: "linear-gradient(90deg, #667eea, #764ba2)", margin: "1.5rem 0", opacity: 0.3 },
  card: { 
    background: "white", 
    borderRadius: "12px", 
    padding: "1.5rem", 
    marginBottom: "1.5rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    border: "1px solid #e5e7eb"
  },
  versionRow: { display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" as const },
  version: { fontSize: "1.25rem", fontWeight: 600, color: "#1f2937" },
  dateBadge: { 
    background: "linear-gradient(135deg, #667eea, #764ba2)", 
    color: "white", 
    padding: "4px 12px", 
    borderRadius: "20px", 
    fontSize: "0.75rem",
    fontWeight: 500
  },
  changeRow: { display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.5rem" },
  changeText: { color: "#4b5563", lineHeight: 1.6 },
  section: { marginTop: "2rem" },
  heading: { fontSize: "1.25rem", fontWeight: 600, color: "#1f2937", marginBottom: "0.75rem" },
  text: { color: "#6b7280", marginBottom: "1rem", lineHeight: 1.6 },
  list: { paddingLeft: "1.5rem", color: "#4b5563", lineHeight: 1.8 },
  strong: { fontWeight: 600, color: "#1f2937" },
};

function getBadgeStyle(type: string): React.CSSProperties {
  const colors: Record<string, { bg: string; color: string }> = {
    feature: { bg: "#dcfce7", color: "#166534" },
    fix: { bg: "#fee2e2", color: "#991b1b" },
    improvement: { bg: "#dbeafe", color: "#1e40af" },
    security: { bg: "#fef3c7", color: "#92400e" },
    breaking: { bg: "#fce7f3", color: "#9d174d" },
  };
  const c = colors[type] || colors.feature;
  return {
    background: c.bg,
    color: c.color,
    padding: "2px 10px",
    borderRadius: "12px",
    fontSize: "0.7rem",
    fontWeight: 600,
    textTransform: "uppercase",
    minWidth: "85px",
    textAlign: "center",
    display: "inline-block"
  };
}

function getEmoji(type: string): string {
  switch (type) {
    case "feature": return "✨";
    case "fix": return "🐛";
    case "improvement": return "⚡";
    case "security": return "🔒";
    case "breaking": return "💥";
    default: return "📝";
  }
}

export default function Changelog() {
  return (
    <div>
      <h1 style={styles.title}>📋 Changelog</h1>
      <p style={styles.subtitle}>All notable changes to Product 3D Customizer & Upload</p>

      <div style={styles.divider} />

      {changelog.map((entry) => (
        <div key={entry.version} style={styles.card}>
          <div style={styles.versionRow}>
            <span style={styles.version}>v{entry.version}</span>
            <span style={styles.dateBadge}>{entry.date}</span>
          </div>

          {entry.changes.map((change, index) => (
            <div key={index} style={styles.changeRow}>
              <span style={getBadgeStyle(change.type)}>
                {getEmoji(change.type)} {change.type}
              </span>
              <span style={styles.changeText}>{change.description}</span>
            </div>
          ))}
        </div>
      ))}

      <div style={styles.section}>
        <h2 style={styles.heading}>Versioning</h2>
        <p style={styles.text}>
          We use Semantic Versioning (SemVer). Given a version number MAJOR.MINOR.PATCH:
        </p>
        <ul style={styles.list}>
          <li><span style={styles.strong}>MAJOR</span>: Incompatible API changes</li>
          <li><span style={styles.strong}>MINOR</span>: New features (backwards compatible)</li>
          <li><span style={styles.strong}>PATCH</span>: Bug fixes (backwards compatible)</li>
        </ul>
      </div>
    </div>
  );
}
