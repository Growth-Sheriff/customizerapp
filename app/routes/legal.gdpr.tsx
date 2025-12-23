const styles = {
  title: { fontSize: "2rem", fontWeight: 700, color: "#1f2937", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" as const },
  badge: { background: "linear-gradient(135deg, #10b981, #059669)", color: "white", padding: "6px 16px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 600 },
  subtitle: { fontSize: "0.875rem", color: "#6b7280", marginBottom: "2rem" },
  divider: { height: "1px", background: "linear-gradient(90deg, #667eea, #764ba2)", margin: "1.5rem 0", opacity: 0.3 },
  section: { marginBottom: "2rem" },
  heading: { fontSize: "1.25rem", fontWeight: 600, color: "#1f2937", marginBottom: "0.75rem" },
  text: { color: "#4b5563", lineHeight: 1.7, marginBottom: "1rem" },
  list: { paddingLeft: "1.5rem", color: "#4b5563", lineHeight: 1.8, margin: 0 },
  listItem: { marginBottom: "0.5rem" },
  strong: { fontWeight: 600, color: "#1f2937" },
  card: { 
    background: "white", 
    borderRadius: "12px", 
    padding: "1.5rem", 
    marginBottom: "1.5rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    border: "1px solid #e5e7eb"
  },
  webhookItem: { 
    display: "flex", 
    alignItems: "flex-start", 
    gap: "0.75rem", 
    padding: "1rem",
    background: "#f9fafb",
    borderRadius: "8px",
    marginBottom: "0.75rem"
  },
  activeBadge: { 
    background: "#dcfce7", 
    color: "#166534", 
    padding: "4px 10px", 
    borderRadius: "12px", 
    fontSize: "0.7rem", 
    fontWeight: 600 
  },
  webhookName: { fontWeight: 600, color: "#1f2937", marginBottom: "0.25rem" },
  webhookDesc: { color: "#6b7280", fontSize: "0.875rem", lineHeight: 1.5 },
};

export default function GDPRCompliance() {
  const webhooks = [
    {
      name: "customers/data_request",
      desc: "When a customer requests their data, we provide all stored information including uploads, configurations, and order customizations."
    },
    {
      name: "customers/redact",
      desc: "When a customer requests deletion, we remove all their personal data and uploaded files within 30 days."
    },
    {
      name: "shop/redact",
      desc: "When a shop uninstalls our app, we delete all shop data within 48 hours."
    }
  ];

  return (
    <div>
      <h1 style={styles.title}>
        🌍 GDPR Compliance
        <span style={styles.badge}>✓ Compliant</span>
      </h1>
      <p style={styles.subtitle}>
        Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
      </p>

      <div style={styles.divider} />

      <section style={styles.section}>
        <h2 style={styles.heading}>Overview</h2>
        <p style={styles.text}>
          Product 3D Customizer & Upload is fully compliant with the General Data Protection Regulation (GDPR) 
          and other applicable data protection laws. We are committed to protecting the privacy and rights 
          of our users and their customers.
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>Data Controller & Processor</h2>
        <p style={styles.text}>When you use our App:</p>
        <ul style={styles.list}>
          <li style={styles.listItem}><span style={styles.strong}>You (Merchant)</span> are the Data Controller for your customers' data</li>
          <li style={styles.listItem}><span style={styles.strong}>We</span> act as a Data Processor on your behalf</li>
          <li style={styles.listItem}><span style={styles.strong}>Shopify</span> provides the underlying platform infrastructure</li>
        </ul>
      </section>

      <div style={styles.card}>
        <h2 style={styles.heading}>🔗 Shopify GDPR Webhooks</h2>
        <p style={styles.text}>We implement all required Shopify GDPR webhooks:</p>
        
        {webhooks.map((wh, idx) => (
          <div key={idx} style={styles.webhookItem}>
            <span style={styles.activeBadge}>✓ Active</span>
            <div>
              <div style={styles.webhookName}>{wh.name}</div>
              <div style={styles.webhookDesc}>{wh.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <section style={styles.section}>
        <h2 style={styles.heading}>Data Subject Rights</h2>
        <p style={styles.text}>We support all GDPR data subject rights:</p>
        <ul style={styles.list}>
          <li style={styles.listItem}><span style={styles.strong}>Right to Access:</span> Request a copy of stored data</li>
          <li style={styles.listItem}><span style={styles.strong}>Right to Rectification:</span> Correct inaccurate data</li>
          <li style={styles.listItem}><span style={styles.strong}>Right to Erasure:</span> Request data deletion</li>
          <li style={styles.listItem}><span style={styles.strong}>Right to Portability:</span> Export data in standard format</li>
          <li style={styles.listItem}><span style={styles.strong}>Right to Restrict Processing:</span> Limit data usage</li>
          <li style={styles.listItem}><span style={styles.strong}>Right to Object:</span> Opt out of certain processing</li>
        </ul>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>🔒 Data Security Measures</h2>
        <ul style={styles.list}>
          <li style={styles.listItem}>✅ TLS 1.3 encryption for all data in transit</li>
          <li style={styles.listItem}>✅ AES-256 encryption for data at rest</li>
          <li style={styles.listItem}>✅ Row-level database security with tenant isolation</li>
          <li style={styles.listItem}>✅ Regular security audits and penetration testing</li>
          <li style={styles.listItem}>✅ Access logging and monitoring</li>
          <li style={styles.listItem}>✅ Employee access controls and training</li>
        </ul>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>Data Processing Agreement (DPA)</h2>
        <p style={styles.text}>
          A Data Processing Agreement is available for Enterprise customers upon request. 
          Contact <a href="mailto:enterprise@customizerapp.dev" style={{ color: "#667eea" }}>enterprise@customizerapp.dev</a> for more information.
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>🌐 International Data Transfers</h2>
        <p style={styles.text}>
          Our servers are located in the EU (Germany). For data transfers outside the EU, we rely on:
        </p>
        <ul style={styles.list}>
          <li style={styles.listItem}>Standard Contractual Clauses (SCCs)</li>
          <li style={styles.listItem}>Cloudflare's GDPR-compliant infrastructure</li>
          <li style={styles.listItem}>Shopify's data processing terms</li>
        </ul>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>📧 Contact Our DPO</h2>
        <p style={styles.text}>For GDPR-related inquiries, contact our Data Protection Officer:</p>
        <ul style={styles.list}>
          <li style={styles.listItem}>Email: <a href="mailto:dpo@customizerapp.dev" style={{ color: "#667eea" }}>dpo@customizerapp.dev</a></li>
          <li style={styles.listItem}>Response time: Within 72 hours</li>
        </ul>
      </section>
    </div>
  );
}
