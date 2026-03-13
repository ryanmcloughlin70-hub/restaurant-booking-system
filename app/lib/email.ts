import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function sendBookingConfirmationEmail(params: {
  to: string;
  firstName: string;
  surname?: string;
  reference: string;
  partySize: number;
  startTime: Date;
  endTime: Date;
  tableNumber: number;
  restaurantName?: string;
  phone?: string;
  addressLine?: string;
}) {
  const {
    to,
    firstName,
    reference,
    partySize,
    startTime,
    endTime,
    tableNumber,
    restaurantName = "Restaurant",
    phone = "01234 567890",
    addressLine = "Main Street, Your Town",
  } = params;

  const dateStr = fmtDate(startTime);
  const startStr = fmtTime(startTime);
  const endStr = fmtTime(endTime);

  const subject = `Booking confirmed (${reference})`;

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
  </head>
  <body style="margin:0; padding:0; background:#0b0b0c;">
    <!-- Preheader (hidden) -->
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
      Your booking is confirmed for ${dateStr} at ${startStr}. Reference: ${reference}.
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
      style="background:#0b0b0c; padding:24px 12px;">
      <tr>
        <td align="center">

          <!-- Card -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
            style="width:600px; max-width:600px; background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.35);">

            <!-- Header -->
            <tr>
              <td style="padding:22px 24px; border-bottom:1px solid rgba(0,0,0,0.08);">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="left" style="font-family:Arial, sans-serif;">
                      <div style="display:inline-block; background:#6b0f13; color:#ffffff; font-size:12px; letter-spacing:1px; font-weight:700; padding:10px 14px; border-radius:8px;">
                        BOOKING CONFIRMED
                      </div>
                    </td>
                    <td align="right" style="font-family:Arial, sans-serif; color:rgba(0,0,0,0.55); font-size:12px;">
                      ${restaurantName}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:26px 24px; font-family:Arial, sans-serif; color:#0b0b0c;">
                <h1 style="margin:0 0 8px 0; font-size:26px; line-height:1.25;">
                  Thanks, ${escapeHtml(firstName)}!
                </h1>

                <p style="margin:0 0 18px 0; font-size:15px; line-height:1.6; color:rgba(0,0,0,0.75);">
                  Your table is booked for <strong>${dateStr}</strong> at <strong>${startStr}</strong>
                  <span style="color:rgba(0,0,0,0.55);">(until ${endStr})</span> for
                  <strong>${partySize}</strong> ${partySize === 1 ? "person" : "people"}.
                </p>

                <!-- Reference block -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                  style="background:#fff7ed; border:1px solid rgba(0,0,0,0.10); border-radius:12px;">
                  <tr>
                    <td style="padding:16px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="left" style="font-family:Arial, sans-serif;">
                            <div style="font-size:11px; letter-spacing:1.4px; color:rgba(0,0,0,0.55); font-weight:700;">
                              BOOKING REFERENCE
                            </div>
                            <div style="margin-top:6px; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:34px; letter-spacing:6px; font-weight:800; color:#0b0b0c;">
                              ${escapeHtml(reference)}
                            </div>
                          </td>
                          <td align="right" style="font-family:Arial, sans-serif; color:rgba(0,0,0,0.75); font-size:14px;">
                            <div style="font-weight:700;">Table #${tableNumber}</div>
                            <div style="margin-top:2px; color:rgba(0,0,0,0.55);">${partySize <= 2 ? "2 seats" : ""}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <!-- Details -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:18px;">
                  <tr>
                    <td style="padding:0;">
                      <p style="margin:0 0 12px 0; font-size:13px; line-height:1.6; color:rgba(0,0,0,0.70);">
                        You’ll receive this email as your confirmation. If you need to change or cancel, please call us and quote your reference.
                      </p>
                    </td>
                  </tr>
                </table>

                <!-- “Receipt” grid -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td width="50%" style="padding:6px 6px 6px 0;">
                      ${kvBox("Name", `${escapeHtml(firstName)} ${escapeHtml(params.surname ?? "")}`.trim() || escapeHtml(firstName))}
                    </td>
                    <td width="50%" style="padding:6px 0 6px 6px;">
                      ${kvBox("Email", escapeHtml(to))}
                    </td>
                  </tr>
                  <tr>
                    <td width="50%" style="padding:6px 6px 6px 0;">
                      ${kvBox("Guests", String(partySize))}
                    </td>
                    <td width="50%" style="padding:6px 0 6px 6px;">
                      ${kvBox("Time", `${startStr} → ${endStr}`)}
                    </td>
                  </tr>
                </table>

                <!-- CTA -->
                <div style="margin-top:18px;">
                  <a href="http://localhost:3000/book"
                    style="display:inline-block; width:100%; text-align:center; background:#0b0b0c; color:#ffffff; text-decoration:none; font-weight:700; padding:14px 16px; border-radius:10px;">
                    Make another booking
                  </a>
                  <p style="margin:12px 0 0 0; font-size:12px; color:rgba(0,0,0,0.55); line-height:1.5;">
                    Please arrive on time. We’ll hold your table for the duration of your booking.
                  </p>
                </div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:18px 24px; background:#fafafa; border-top:1px solid rgba(0,0,0,0.06); font-family:Arial, sans-serif;">
                <div style="font-size:12px; color:rgba(0,0,0,0.60); line-height:1.6;">
                  <strong style="color:rgba(0,0,0,0.78);">${restaurantName}</strong><br/>
                  ${escapeHtml(addressLine)}<br/>
                  <span style="color:#6b0f13; font-weight:700;">${escapeHtml(phone)}</span>
                </div>
              </td>
            </tr>

          </table>
          <!-- /Card -->

        </td>
      </tr>
    </table>
  </body>
</html>`;



  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
    to,
    subject,
    html,
  });
}

export async function sendBookingCancelledEmail(params: {
  to: string;
  firstName: string;
  reference: string;
  partySize: number;
  startTime: Date;
  endTime: Date;
  restaurantName?: string;
  phone?: string;
  addressLine?: string;
}) {
  const {
    to,
    firstName,
    reference,
    partySize,
    startTime,
    endTime,
    restaurantName = "Restaurant",
    phone = "01234 567890",
    addressLine = "Main Street, Your Town",
  } = params;

  const dateStr = fmtDate(startTime);
  const startStr = fmtTime(startTime);
  const endStr = fmtTime(endTime);

  const subject = `Booking cancelled (${reference})`;

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
  </head>
  <body style="margin:0; padding:0; background:#0b0b0c;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
      Your booking has been cancelled. Reference: ${reference}.
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
      style="background:#0b0b0c; padding:24px 12px;">
      <tr>
        <td align="center">

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
            style="width:600px; max-width:600px; background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.35);">

            <tr>
              <td style="padding:22px 24px; border-bottom:1px solid rgba(0,0,0,0.08);">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="left" style="font-family:Arial, sans-serif;">
                      <div style="display:inline-block; background:#6b0f13; color:#ffffff; font-size:12px; letter-spacing:1px; font-weight:700; padding:10px 14px; border-radius:8px;">
                        BOOKING CANCELLED
                      </div>
                    </td>
                    <td align="right" style="font-family:Arial, sans-serif; color:rgba(0,0,0,0.55); font-size:12px;">
                      ${restaurantName}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:26px 24px; font-family:Arial, sans-serif; color:#0b0b0c;">
                <h1 style="margin:0 0 8px 0; font-size:26px; line-height:1.25;">
                  Hi, ${escapeHtml(firstName)}
                </h1>

                <p style="margin:0 0 18px 0; font-size:15px; line-height:1.6; color:rgba(0,0,0,0.75);">
                  Your booking has been successfully cancelled.
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                  style="background:#fff7ed; border:1px solid rgba(0,0,0,0.10); border-radius:12px;">
                  <tr>
                    <td style="padding:16px;">
                      <div style="font-size:11px; letter-spacing:1.4px; color:rgba(0,0,0,0.55); font-weight:700;">
                        BOOKING REFERENCE
                      </div>
                      <div style="margin-top:6px; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:34px; letter-spacing:6px; font-weight:800; color:#0b0b0c;">
                        ${escapeHtml(reference)}
                      </div>
                    </td>
                  </tr>
                </table>

                <p style="margin:16px 0 0 0; font-size:14px; line-height:1.6; color:rgba(0,0,0,0.75);">
                  Cancelled booking details:
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;">
                  <tr>
                    <td width="50%" style="padding:6px 6px 6px 0;">
                      ${kvBox("Date", dateStr)}
                    </td>
                    <td width="50%" style="padding:6px 0 6px 6px;">
                      ${kvBox("Time", `${startStr} → ${endStr}`)}
                    </td>
                  </tr>
                  <tr>
                    <td width="50%" style="padding:6px 6px 6px 0;">
                      ${kvBox("Guests", String(partySize))}
                    </td>
                    <td width="50%" style="padding:6px 0 6px 6px;">
                      ${kvBox("Email", escapeHtml(to))}
                    </td>
                  </tr>
                </table>

                <div style="margin-top:18px;">
                  <a href="http://localhost:3000/book"
                    style="display:inline-block; width:100%; text-align:center; background:#0b0b0c; color:#ffffff; text-decoration:none; font-weight:700; padding:14px 16px; border-radius:10px;">
                    Make a new booking
                  </a>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 24px; background:#fafafa; border-top:1px solid rgba(0,0,0,0.06); font-family:Arial, sans-serif;">
                <div style="font-size:12px; color:rgba(0,0,0,0.60); line-height:1.6;">
                  <strong style="color:rgba(0,0,0,0.78);">${restaurantName}</strong><br/>
                  ${escapeHtml(addressLine)}<br/>
                  <span style="color:#6b0f13; font-weight:700;">${escapeHtml(phone)}</span>
                </div>
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  </body>
</html>`;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
    to,
    subject,
    html,
  });
}

export async function sendBookingModifiedEmail(params: {
  to: string;
  firstName: string;
  oldReference: string;
  newReference: string;
  partySize: number;
  startTime: Date;
  endTime: Date;
  tableNumber: number;
  restaurantName?: string;
  phone?: string;
  addressLine?: string;
}) {
  const {
    to,
    firstName,
    oldReference,
    newReference,
    partySize,
    startTime,
    endTime,
    tableNumber,
    restaurantName = "Restaurant",
    phone = "01234 567890",
    addressLine = "Main Street, Your Town",
  } = params;

  const dateStr = fmtDate(startTime);
  const startStr = fmtTime(startTime);
  const endStr = fmtTime(endTime);

  const subject = `Booking updated (${newReference})`;

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
  </head>
  <body style="margin:0; padding:0; background:#0b0b0c;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
      Your booking has been updated. New reference: ${newReference}.
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
      style="background:#0b0b0c; padding:24px 12px;">
      <tr>
        <td align="center">

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
            style="width:600px; max-width:600px; background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.35);">

            <tr>
              <td style="padding:22px 24px; border-bottom:1px solid rgba(0,0,0,0.08);">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="left" style="font-family:Arial, sans-serif;">
                      <div style="display:inline-block; background:#6b0f13; color:#ffffff; font-size:12px; letter-spacing:1px; font-weight:700; padding:10px 14px; border-radius:8px;">
                        BOOKING UPDATED
                      </div>
                    </td>
                    <td align="right" style="font-family:Arial, sans-serif; color:rgba(0,0,0,0.55); font-size:12px;">
                      ${restaurantName}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:26px 24px; font-family:Arial, sans-serif; color:#0b0b0c;">
                <h1 style="margin:0 0 8px 0; font-size:26px; line-height:1.25;">
                  Thanks, ${escapeHtml(firstName)}!
                </h1>

                <p style="margin:0 0 18px 0; font-size:15px; line-height:1.6; color:rgba(0,0,0,0.75);">
                  Your booking has been successfully updated.
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                  style="background:#fff7ed; border:1px solid rgba(0,0,0,0.10); border-radius:12px;">
                  <tr>
                    <td style="padding:16px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="left" style="font-family:Arial, sans-serif;">
                            <div style="font-size:11px; letter-spacing:1.4px; color:rgba(0,0,0,0.55); font-weight:700;">
                              NEW BOOKING REFERENCE
                            </div>
                            <div style="margin-top:6px; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:34px; letter-spacing:6px; font-weight:800; color:#0b0b0c;">
                              ${escapeHtml(newReference)}
                            </div>
                          </td>
                          <td align="right" style="font-family:Arial, sans-serif; color:rgba(0,0,0,0.75); font-size:14px;">
                            <div style="font-weight:700;">Table #${tableNumber}</div>
                          </td>
                        </tr>
                      </table>

                      <div style="margin-top:10px; font-size:12px; color:rgba(0,0,0,0.55);">
                        Old reference: <strong>${escapeHtml(oldReference)}</strong>
                      </div>
                    </td>
                  </tr>
                </table>

                <p style="margin:16px 0 0 0; font-size:15px; line-height:1.6; color:rgba(0,0,0,0.75);">
                  Your updated booking is for <strong>${dateStr}</strong> at <strong>${startStr}</strong>
                  <span style="color:rgba(0,0,0,0.55);">(until ${endStr})</span> for
                  <strong>${partySize}</strong> ${partySize === 1 ? "person" : "people"}.
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;">
                  <tr>
                    <td width="50%" style="padding:6px 6px 6px 0;">
                      ${kvBox("Date", dateStr)}
                    </td>
                    <td width="50%" style="padding:6px 0 6px 6px;">
                      ${kvBox("Time", `${startStr} → ${endStr}`)}
                    </td>
                  </tr>
                  <tr>
                    <td width="50%" style="padding:6px 6px 6px 0;">
                      ${kvBox("Guests", String(partySize))}
                    </td>
                    <td width="50%" style="padding:6px 0 6px 6px;">
                      ${kvBox("Email", escapeHtml(to))}
                    </td>
                  </tr>
                </table>

                <div style="margin-top:18px;">
                  <a href="http://localhost:3000/book"
                    style="display:inline-block; width:100%; text-align:center; background:#0b0b0c; color:#ffffff; text-decoration:none; font-weight:700; padding:14px 16px; border-radius:10px;">
                    Make another booking
                  </a>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 24px; background:#fafafa; border-top:1px solid rgba(0,0,0,0.06); font-family:Arial, sans-serif;">
                <div style="font-size:12px; color:rgba(0,0,0,0.60); line-height:1.6;">
                  <strong style="color:rgba(0,0,0,0.78);">${restaurantName}</strong><br/>
                  ${escapeHtml(addressLine)}<br/>
                  <span style="color:#6b0f13; font-weight:700;">${escapeHtml(phone)}</span>
                </div>
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  </body>
</html>`;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
    to,
    subject,
    html,
  });
}


function kvBox(label: string, value: string) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
    style="border:1px solid rgba(0,0,0,0.10); border-radius:12px;">
    <tr>
      <td style="padding:12px 14px; font-family:Arial, sans-serif;">
        <div style="font-size:12px; color:rgba(0,0,0,0.55);">${escapeHtml(label)}</div>
        <div style="margin-top:4px; font-size:14px; font-weight:700; color:#0b0b0c;">${escapeHtml(value)}</div>
      </td>
    </tr>
  </table>`;
}

function escapeHtml(input: string) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
