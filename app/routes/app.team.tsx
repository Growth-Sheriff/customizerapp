import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import {
  AppProvider, Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Banner, DataTable, Badge, Modal, TextField, Select,
  EmptyState, Box
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { useState, useCallback } from "react";
import { getShopFromSession } from "~/lib/session.server";
import { requirePermission, PERMISSIONS, ROLES, type Role } from "~/lib/rbac.server";
import prisma from "~/lib/prisma.server";
import { nanoid } from "nanoid";

const ROLE_OPTIONS = [
  { label: "Viewer (Read-only)", value: "viewer" },
  { label: "Operator (Queue & Uploads)", value: "operator" },
  { label: "Admin (All except Billing)", value: "admin" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const shopDomain = await getShopFromSession(request);
  if (!shopDomain) {
    return redirect("/auth/install");
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: {
      teamMembers: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!shop) {
    return redirect("/auth/install");
  }

  // Get current user role (for now assume owner if first user)
  const currentUserRole = "owner" as Role; // TODO: Get from session

  return json({
    shopId: shop.id,
    shopDomain: shop.shopDomain,
    plan: shop.plan,
    currentUserRole,
    teamMembers: shop.teamMembers.map((m) => ({
      id: m.id,
      email: m.email,
      name: m.name,
      role: m.role,
      status: m.status,
      invitedAt: m.invitedAt.toISOString(),
      acceptedAt: m.acceptedAt?.toISOString() || null,
      lastLoginAt: m.lastLoginAt?.toISOString() || null,
    })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const shopDomain = await getShopFromSession(request);
  if (!shopDomain) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  // Check enterprise plan for team management
  if (!["pro", "enterprise"].includes(shop.plan)) {
    return json({ error: "Team management requires Pro or Enterprise plan" }, { status: 403 });
  }

  const formData = await request.formData();
  const action = formData.get("_action");

  if (action === "invite") {
    const email = formData.get("email") as string;
    const role = formData.get("role") as string;
    const name = formData.get("name") as string;

    if (!email || !role) {
      return json({ error: "Email and role are required" });
    }

    // Check if member already exists
    const existing = await prisma.teamMember.findUnique({
      where: { shopId_email: { shopId: shop.id, email } },
    });

    if (existing) {
      return json({ error: "Team member already exists" });
    }

    // Create invite token
    const inviteToken = nanoid(32);

    await prisma.teamMember.create({
      data: {
        shopId: shop.id,
        email,
        name,
        role,
        inviteToken,
        status: "pending",
      },
    });

    // TODO: Send invite email

    await prisma.auditLog.create({
      data: {
        shopId: shop.id,
        action: "team_invite",
        resourceType: "team_member",
        metadata: { email, role },
      },
    });

    return json({ success: true, message: `Invitation sent to ${email}` });
  }

  if (action === "update_role") {
    const memberId = formData.get("memberId") as string;
    const newRole = formData.get("role") as string;

    const member = await prisma.teamMember.findFirst({
      where: { id: memberId, shopId: shop.id },
    });

    if (!member) {
      return json({ error: "Team member not found" });
    }

    if (member.role === "owner") {
      return json({ error: "Cannot change owner role" });
    }

    await prisma.teamMember.update({
      where: { id: memberId },
      data: { role: newRole },
    });

    await prisma.auditLog.create({
      data: {
        shopId: shop.id,
        action: "team_role_update",
        resourceType: "team_member",
        resourceId: memberId,
        metadata: { previousRole: member.role, newRole },
      },
    });

    return json({ success: true, message: "Role updated" });
  }

  if (action === "remove") {
    const memberId = formData.get("memberId") as string;

    const member = await prisma.teamMember.findFirst({
      where: { id: memberId, shopId: shop.id },
    });

    if (!member) {
      return json({ error: "Team member not found" });
    }

    if (member.role === "owner") {
      return json({ error: "Cannot remove owner" });
    }

    await prisma.teamMember.delete({
      where: { id: memberId },
    });

    await prisma.auditLog.create({
      data: {
        shopId: shop.id,
        action: "team_remove",
        resourceType: "team_member",
        resourceId: memberId,
        metadata: { email: member.email },
      },
    });

    return json({ success: true, message: "Team member removed" });
  }

  if (action === "resend_invite") {
    const memberId = formData.get("memberId") as string;

    const member = await prisma.teamMember.findFirst({
      where: { id: memberId, shopId: shop.id, status: "pending" },
    });

    if (!member) {
      return json({ error: "Pending invitation not found" });
    }

    // Generate new token
    const inviteToken = nanoid(32);

    await prisma.teamMember.update({
      where: { id: memberId },
      data: { inviteToken, invitedAt: new Date() },
    });

    // TODO: Resend invite email

    return json({ success: true, message: "Invitation resent" });
  }

  return json({ error: "Unknown action" }, { status: 400 });
}

function RoleBadge({ role }: { role: string }) {
  const tones: Record<string, "success" | "info" | "warning" | "attention"> = {
    owner: "success",
    admin: "info",
    operator: "warning",
    viewer: "attention",
  };
  return <Badge tone={tones[role] || "info"}>{role}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const tones: Record<string, "success" | "warning" | "critical"> = {
    active: "success",
    pending: "warning",
    suspended: "critical",
  };
  return <Badge tone={tones[status] || "info"}>{status}</Badge>;
}

export default function TeamPage() {
  const { teamMembers, plan, currentUserRole } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("viewer");

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<typeof teamMembers[0] | null>(null);
  const [newRole, setNewRole] = useState("");

  const canManageTeam = ["pro", "enterprise"].includes(plan);

  const openEditModal = useCallback((member: typeof teamMembers[0]) => {
    setSelectedMember(member);
    setNewRole(member.role);
    setEditModalOpen(true);
  }, []);

  const rows = teamMembers.map((member: any) => [
    <BlockStack key={member.id} gap="050">
      <Text as="span" variant="bodySm" fontWeight="semibold">{member.name || member.email}</Text>
      {member.name && <Text as="span" variant="bodySm" tone="subdued">{member.email}</Text>}
    </BlockStack>,
    <RoleBadge key={`role-${member.id}`} role={member.role} />,
    <StatusBadge key={`status-${member.id}`} status={member.status} />,
    member.lastLoginAt
      ? new Date(member.lastLoginAt).toLocaleDateString()
      : member.status === "pending"
        ? "Never (pending)"
        : "Never",
    <InlineStack key={`actions-${member.id}`} gap="100">
      {member.role !== "owner" && (
        <>
          <Button size="slim" onClick={() => openEditModal(member)}>
            Edit
          </Button>
          {member.status === "pending" && (
            <Form method="post" style={{ display: "inline" }}>
              <input type="hidden" name="_action" value="resend_invite" />
              <input type="hidden" name="memberId" value={member.id} />
              <Button size="slim" submit>Resend</Button>
            </Form>
          )}
          <Form method="post" style={{ display: "inline" }}>
            <input type="hidden" name="_action" value="remove" />
            <input type="hidden" name="memberId" value={member.id} />
            <Button size="slim" tone="critical" submit>Remove</Button>
          </Form>
        </>
      )}
    </InlineStack>,
  ]);

  return (
    <AppProvider i18n={enTranslations}>
      <Page
        title="Team Management"
        backAction={{ content: "Dashboard", url: "/app" }}
        primaryAction={
          canManageTeam
            ? { content: "Invite Member", onAction: () => setInviteModalOpen(true) }
            : undefined
        }
      >
        <Layout>
          {/* Action result banner */}
          {actionData && "success" in actionData && (
            <Layout.Section>
              <Banner tone="success" onDismiss={() => {}}>
                {actionData.message}
              </Banner>
            </Layout.Section>
          )}
          {actionData && "error" in actionData && (
            <Layout.Section>
              <Banner tone="critical" onDismiss={() => {}}>
                {actionData.error}
              </Banner>
            </Layout.Section>
          )}

          {/* Plan restriction */}
          {!canManageTeam && (
            <Layout.Section>
              <Banner tone="warning">
                <p>Team management requires <strong>Pro</strong> or <strong>Enterprise</strong> plan.</p>
                <Button url="/app/settings">Upgrade Plan</Button>
              </Banner>
            </Layout.Section>
          )}

          {/* Role descriptions */}
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Roles & Permissions</Text>
                <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                  <BlockStack gap="200">
                    <InlineStack gap="200">
                      <RoleBadge role="owner" />
                      <Text as="span" variant="bodySm">Full access including billing and shop deletion</Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <RoleBadge role="admin" />
                      <Text as="span" variant="bodySm">All access except billing</Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <RoleBadge role="operator" />
                      <Text as="span" variant="bodySm">Queue management, uploads, exports</Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <RoleBadge role="viewer" />
                      <Text as="span" variant="bodySm">Read-only access to all data</Text>
                    </InlineStack>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Team list */}
          <Layout.Section>
            <Card>
              {teamMembers.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={["Member", "Role", "Status", "Last Login", "Actions"]}
                  rows={rows}
                />
              ) : (
                <EmptyState
                  heading="No team members yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={
                    canManageTeam
                      ? { content: "Invite Member", onAction: () => setInviteModalOpen(true) }
                      : undefined
                  }
                >
                  <p>Invite team members to help manage your uploads and production queue.</p>
                </EmptyState>
              )}
            </Card>
          </Layout.Section>
        </Layout>

        {/* Invite Modal */}
        <Modal
          open={inviteModalOpen}
          onClose={() => setInviteModalOpen(false)}
          title="Invite Team Member"
          primaryAction={{
            content: "Send Invitation",
            loading: isSubmitting,
            onAction: () => {
              const form = document.getElementById("invite-form") as HTMLFormElement;
              form?.submit();
            },
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setInviteModalOpen(false) },
          ]}
        >
          <Modal.Section>
            <Form method="post" id="invite-form">
              <input type="hidden" name="_action" value="invite" />

              <BlockStack gap="400">
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  name="email"
                  autoComplete="email"
                  required
                />

                <TextField
                  label="Name (optional)"
                  value={name}
                  onChange={setName}
                  name="name"
                  autoComplete="name"
                />

                <Select
                  label="Role"
                  options={ROLE_OPTIONS}
                  value={role}
                  onChange={setRole}
                  name="role"
                />
              </BlockStack>
            </Form>
          </Modal.Section>
        </Modal>

        {/* Edit Role Modal */}
        <Modal
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title={`Edit Role: ${selectedMember?.name || selectedMember?.email}`}
          primaryAction={{
            content: "Update Role",
            loading: isSubmitting,
            onAction: () => {
              const form = document.getElementById("edit-form") as HTMLFormElement;
              form?.submit();
            },
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setEditModalOpen(false) },
          ]}
        >
          <Modal.Section>
            <Form method="post" id="edit-form">
              <input type="hidden" name="_action" value="update_role" />
              <input type="hidden" name="memberId" value={selectedMember?.id || ""} />

              <Select
                label="Role"
                options={ROLE_OPTIONS}
                value={newRole}
                onChange={setNewRole}
                name="role"
              />
            </Form>
          </Modal.Section>
        </Modal>
      </Page>
    </AppProvider>
  );
}

