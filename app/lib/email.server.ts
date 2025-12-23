/**
 * Email Service using Resend
 * 
 * Setup: Add RESEND_API_KEY to environment variables
 * Get API key from: https://resend.com/api-keys
 */

import { Resend } from "resend";

// Initialize Resend client (will be undefined if no API key)
const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Default sender - update after domain verification in Resend
const DEFAULT_FROM = process.env.EMAIL_FROM || "Upload Lift <noreply@customizerapp.dev>";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@customizerapp.dev";

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
}

export interface SupportTicketEmailData {
  ticketId: string;
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
  shopDomain?: string;
}

/**
 * Send an email via Resend
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string; id?: string }> {
  if (!resend) {
    console.warn("[EMAIL] Resend API key not configured - email not sent");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const result = await resend.emails.send({
      from: options.from || DEFAULT_FROM,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    });

    if (result.error) {
      console.error("[EMAIL] Send failed:", result.error);
      return { success: false, error: result.error.message };
    }

    console.log("[EMAIL] Sent successfully:", result.data?.id);
    return { success: true, id: result.data?.id };
  } catch (error) {
    console.error("[EMAIL] Exception:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Send support ticket confirmation to customer
 */
export async function sendTicketConfirmation(data: SupportTicketEmailData): Promise<{ success: boolean; error?: string }> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .ticket-id { background: #fff; padding: 15px; border-radius: 6px; border: 1px solid #e5e7eb; margin: 20px 0; }
    .ticket-id code { font-size: 1.2em; color: #667eea; font-weight: bold; }
    .message-box { background: #fff; padding: 15px; border-radius: 6px; border-left: 4px solid #667eea; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 0.875rem; }
    a { color: #667eea; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">📩 Support Ticket Received</h1>
    </div>
    <div class="content">
      <p>Hi <strong>${data.name}</strong>,</p>
      <p>Thank you for contacting Upload Lift support. We've received your message and will get back to you within 24 hours.</p>
      
      <div class="ticket-id">
        <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 0.875rem;">Your Ticket ID:</p>
        <code>${data.ticketId}</code>
      </div>
      
      <p><strong>Subject:</strong> ${data.subject}</p>
      <p><strong>Category:</strong> ${data.category}</p>
      
      <div class="message-box">
        <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 0.875rem;">Your Message:</p>
        <p style="margin: 0; white-space: pre-wrap;">${data.message}</p>
      </div>
      
      <p>If you have any additional information to add, please reply to this email with your ticket ID.</p>
      
      <p>Best regards,<br><strong>Upload Lift Support Team</strong></p>
    </div>
    <div class="footer">
      <p>Upload Lift - Professional Print Upload Solution</p>
      <p><a href="https://customizerapp.dev">customizerapp.dev</a></p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
Support Ticket Received

Hi ${data.name},

Thank you for contacting Upload Lift support. We've received your message and will get back to you within 24 hours.

Ticket ID: ${data.ticketId}
Subject: ${data.subject}
Category: ${data.category}

Your Message:
${data.message}

If you have any additional information to add, please reply to this email with your ticket ID.

Best regards,
Upload Lift Support Team
  `;

  return sendEmail({
    to: data.email,
    subject: `[Ticket #${data.ticketId}] ${data.subject}`,
    html,
    text,
    replyTo: SUPPORT_EMAIL,
  });
}

/**
 * Send new ticket notification to support team
 */
export async function sendTicketNotification(data: SupportTicketEmailData): Promise<{ success: boolean; error?: string }> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1f2937; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .info-row { display: flex; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .info-label { width: 120px; font-weight: 600; color: #6b7280; }
    .info-value { flex: 1; }
    .message-box { background: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0; }
    .priority { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
    .priority-high { background: #fee2e2; color: #991b1b; }
    .priority-normal { background: #dbeafe; color: #1e40af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 20px;">🎫 New Support Ticket</h1>
    </div>
    <div class="content">
      <div class="info-row">
        <span class="info-label">Ticket ID:</span>
        <span class="info-value"><strong>${data.ticketId}</strong></span>
      </div>
      <div class="info-row">
        <span class="info-label">From:</span>
        <span class="info-value">${data.name} &lt;${data.email}&gt;</span>
      </div>
      <div class="info-row">
        <span class="info-label">Category:</span>
        <span class="info-value"><span class="priority ${data.category === 'bug' ? 'priority-high' : 'priority-normal'}">${data.category}</span></span>
      </div>
      <div class="info-row">
        <span class="info-label">Shop:</span>
        <span class="info-value">${data.shopDomain || 'Not logged in'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Subject:</span>
        <span class="info-value">${data.subject}</span>
      </div>
      
      <div class="message-box">
        <p style="margin: 0 0 10px 0; font-weight: 600;">Message:</p>
        <p style="margin: 0; white-space: pre-wrap;">${data.message}</p>
      </div>
      
      <p style="text-align: center;">
        <a href="https://customizerapp.dev/admin/support/${data.ticketId}" 
           style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          View Ticket
        </a>
      </p>
    </div>
  </div>
</body>
</html>
  `;

  return sendEmail({
    to: SUPPORT_EMAIL,
    subject: `[New Ticket #${data.ticketId}] ${data.category}: ${data.subject}`,
    html,
    replyTo: data.email,
  });
}

/**
 * Send ticket reply to customer
 */
export async function sendTicketReply(
  ticketId: string,
  customerEmail: string,
  customerName: string,
  subject: string,
  replyMessage: string,
  agentName: string = "Support Team"
): Promise<{ success: boolean; error?: string }> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .reply-box { background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e5e7eb; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 20px;">📬 Reply to Ticket #${ticketId}</h1>
    </div>
    <div class="content">
      <p>Hi <strong>${customerName}</strong>,</p>
      
      <div class="reply-box">
        <p style="white-space: pre-wrap;">${replyMessage}</p>
      </div>
      
      <p style="margin-top: 20px;">If you have any further questions, please reply to this email.</p>
      
      <p>Best regards,<br><strong>${agentName}</strong><br>Upload Lift Support</p>
    </div>
    <div class="footer">
      <p>Ticket ID: ${ticketId}</p>
      <p><a href="https://customizerapp.dev">customizerapp.dev</a></p>
    </div>
  </div>
</body>
</html>
  `;

  return sendEmail({
    to: customerEmail,
    subject: `Re: [Ticket #${ticketId}] ${subject}`,
    html,
    replyTo: SUPPORT_EMAIL,
  });
}

/**
 * Send ticket status update to customer
 */
export async function sendTicketStatusUpdate(
  ticketId: string,
  customerEmail: string,
  customerName: string,
  subject: string,
  newStatus: "in_progress" | "resolved" | "closed",
  note?: string
): Promise<{ success: boolean; error?: string }> {
  const statusLabels = {
    in_progress: "In Progress",
    resolved: "Resolved",
    closed: "Closed",
  };

  const statusColors = {
    in_progress: "#f59e0b",
    resolved: "#10b981",
    closed: "#6b7280",
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${statusColors[newStatus]}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .status-badge { display: inline-block; background: ${statusColors[newStatus]}; color: white; padding: 8px 16px; border-radius: 20px; font-weight: 600; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 20px;">🔔 Ticket Status Updated</h1>
    </div>
    <div class="content">
      <p>Hi <strong>${customerName}</strong>,</p>
      
      <p>Your support ticket <strong>#${ticketId}</strong> has been updated:</p>
      
      <p style="text-align: center; margin: 30px 0;">
        <span class="status-badge">${statusLabels[newStatus]}</span>
      </p>
      
      <p><strong>Subject:</strong> ${subject}</p>
      
      ${note ? `<p><strong>Note:</strong> ${note}</p>` : ''}
      
      ${newStatus === "resolved" ? `
        <p>If this doesn't resolve your issue, please reply to this email and we'll reopen your ticket.</p>
      ` : ''}
      
      <p>Best regards,<br><strong>Upload Lift Support Team</strong></p>
    </div>
    <div class="footer">
      <p>Ticket ID: ${ticketId}</p>
      <p><a href="https://customizerapp.dev">customizerapp.dev</a></p>
    </div>
  </div>
</body>
</html>
  `;

  return sendEmail({
    to: customerEmail,
    subject: `[Ticket #${ticketId}] Status: ${statusLabels[newStatus]}`,
    html,
    replyTo: SUPPORT_EMAIL,
  });
}

// Export types for use elsewhere
export type { Resend };
