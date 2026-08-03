import { Resend } from 'resend';

// Sent from a dedicated subdomain (e.g. mail.flowork.me), never the root flowork.me — keeps
// transactional mail fully isolated from the main domain's inbox/deliverability, so a sending
// issue here can never affect real staff email. Local part is still per-entity
// (operations.dubaihills@ / operations.vt@) so replies clearly reach the right team.
const SENDING_DOMAIN = process.env.RESEND_SENDING_DOMAIN || 'mail.flowork.me';
const SENDER_BY_LOCATION = {
  DH: `Flowork Business Center <operations.dubaihills@${SENDING_DOMAIN}>`,
  VT: `Flowork VT Business Center <operations.vt@${SENDING_DOMAIN}>`,
};
// The sending subdomain has no real inbox — replies need to land on the actual team address.
const REPLY_TO_BY_LOCATION = {
  DH: 'operations.dubaihills@flowork.me',
  VT: 'operations.vt@flowork.me',
};

export async function sendKycFormEmail({ locationCode, entityName, clientEmail, clientContactName, formUrl }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = SENDER_BY_LOCATION[locationCode] || SENDER_BY_LOCATION.DH;
  const replyTo = REPLY_TO_BY_LOCATION[locationCode] || REPLY_TO_BY_LOCATION.DH;

  const greeting = clientContactName ? `Dear ${clientContactName},` : 'Hello,';

  const { data, error } = await resend.emails.send({
    from,
    replyTo,
    to: clientEmail,
    subject: `${entityName} — Please complete your KYC form`,
    html: `
      <p>${greeting}</p>
      <p>Please complete your KYC (Know Your Customer) form for ${entityName} using the link below.
      Once submitted, you'll be taken straight to sign the document.</p>
      <p><a href="${formUrl}" style="display:inline-block;padding:12px 20px;background:#2B3227;color:#ffffff;text-decoration:none;border-radius:6px;">Complete KYC Form</a></p>
      <p>If the button doesn't work, copy and paste this link into your browser:<br>${formUrl}</p>
    `,
    // A text alternative alongside HTML is a standard deliverability signal — HTML-only
    // messages (especially from a still-new sending domain) are more likely to be flagged.
    text: `${greeting}\n\nPlease complete your KYC (Know Your Customer) form for ${entityName} using the link below. Once submitted, you'll be taken straight to sign the document.\n\n${formUrl}`,
  });

  if (error) throw new Error(error.message || 'Failed to send KYC form email');
  return data;
}

// Fired from the DocuSign webhook once an envelope is fully completed — lets the operations
// team know a client has signed without needing to check the app, with the final signed PDF
// and any client-uploaded documents attached directly so the email itself is a usable backup
// (the app/storage remains the primary record).
export async function sendCompletionNotificationEmail({
  locationCode,
  entityName,
  docTypeLabel,
  clientCompanyName,
  clientContactName,
  signedPdfBuffer,
  signedPdfFilename,
  attachments = [],
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = SENDER_BY_LOCATION[locationCode] || SENDER_BY_LOCATION.DH;
  const replyTo = REPLY_TO_BY_LOCATION[locationCode] || REPLY_TO_BY_LOCATION.DH;
  const to = REPLY_TO_BY_LOCATION[locationCode] || REPLY_TO_BY_LOCATION.DH;

  const { data, error } = await resend.emails.send({
    from,
    replyTo,
    to,
    subject: `${entityName} — ${docTypeLabel} signed by ${clientCompanyName}`,
    html: `
      <p>${clientCompanyName}${clientContactName ? ` (${clientContactName})` : ''} has completed and signed the ${docTypeLabel} for ${entityName}.</p>
      <p>The signed document${attachments.length ? ' and attached client documents are' : ' is'} attached to this email for your records.</p>
    `,
    text: `${clientCompanyName}${clientContactName ? ` (${clientContactName})` : ''} has completed and signed the ${docTypeLabel} for ${entityName}. The signed document${attachments.length ? ' and attached client documents are' : ' is'} attached.`,
    attachments: [
      { filename: signedPdfFilename, content: signedPdfBuffer },
      ...attachments,
    ],
  });

  if (error) throw new Error(error.message || 'Failed to send completion notification email');
  return data;
}
