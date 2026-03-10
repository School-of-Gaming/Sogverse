import { BRAND, DARK_THEME } from "@/lib/constants/colors";

interface LayoutOptions {
  title: string;
  content: string;
}

/**
 * Wraps email content in a branded dark-theme layout.
 * Table-based with all inline CSS for email client compatibility.
 */
export function wrapInLayout({ title, content }: LayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${DARK_THEME.bg};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DARK_THEME.bg};">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span style="font-size:28px;font-weight:bold;color:${BRAND.primary};letter-spacing:1px;">SOG</span><span style="font-size:28px;font-weight:bold;color:${DARK_THEME.foreground};letter-spacing:1px;">verse</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:${DARK_THEME.card};border:1px solid ${DARK_THEME.border};border-radius:12px;padding:32px;">
              <!-- Purple gradient divider -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:3px;background:linear-gradient(90deg,${BRAND.secondary},${BRAND.primary});border-radius:2px;margin-bottom:24px;"></td>
                </tr>
                <tr>
                  <td style="padding-top:24px;color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;color:${DARK_THEME.footerText};font-size:12px;">
              &copy; ${new Date().getFullYear()} Sogverse. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
