// ── WHICH SPREADSHEET COLUMNS ARE WITHHELD (S4, operator-signed 2026-11-16) ──────────────────────────
//
// A spreadsheet a client sends is often a list of people. Everything stays on this Mac, but sidecar text
// can become a quoted excerpt that partners read, so a column holding personal details is WITHHELD before
// anything is written: its header and its cells never reach the sidecar, and the sheet says so (S-ING-8,
// "Columns holding personal details were withheld from the analysis.").
//
// THE RULES, as signed (four-answers.md (b), plus the operator's two added categories):
//   - a header is normalised: lower case, accents and apostrophes removed, _ - . : # / as spaces, spaces
//     collapsed, trimmed;
//   - a column is withheld when its normalised header matches a category's pattern and none of that
//     category's exceptions;
//   - THE VALUE NET (note 4, signed): any column, whatever its header, in which at least half of the
//     non-empty cells look like an email address, a phone number or a US social-security number.
// Categories: name, email, phone, address (as drafted), date of birth and government ID (added by the
// operator). Ages, gift amounts and notes columns are KEPT (ruling).

export function normalizeHeader(h) {
  return String(h ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[_\-.:#/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const CATEGORIES = [
  {
    key: "name",
    patterns: [
      /^(first|last|full|given|family|middle|preferred|legal|donor|contact|member|client|customer|participant|student|parent|guardian|volunteer|recipient|primary|secondary)? ?names?$/,
      /^(sur|nick)name$/,
      /^(primer |segundo )?nombres?( completo| y apellidos?| del (donante|contacto|cliente|participante|socio))?$/,
      /^apellidos?$/,
      /^(nombre|apellido) (paterno|materno)$/,
    ],
    exceptions: [/(company|organi[sz]ation|org|business|employer|campaign|program|programme|project|event|product|fund|file|account|school|site)/,
                 /(empresa|organizacion|campana|programa|proyecto|evento|producto|fondo|escuela|sitio)/],
  },
  {
    key: "email",
    patterns: [/(^| )(e ?mail|email address|correo( electronico)?|mail)( |$)/],
    exceptions: [/(opt ?in|opt ?out|sent|opens?|open rate|clicks?|count|bounced?|enviados?|abiertos?)/],
  },
  {
    key: "phone",
    patterns: [
      /^(home |work |mobile |cell |office |primary )?(phone|telephone|tel|mobile|cell|cellphone|cell phone|whatsapp|fax)( number| no| num)?$/,
      /^(telefono|tel|movil|celular|whatsapp|fax)( (fijo|movil|de contacto|del donante))?$/,
      /^numero de (telefono|celular|movil)$/,
    ],
    exceptions: [],
  },
  {
    key: "address",
    patterns: [
      /^(home |mailing |street |postal |billing |shipping |physical )?address( line)?( ?[12])?$/,
      /^(street|street address|address 1|address 2|apt|apartment|unit|suite|zip|zip code|zipcode|postcode|postal code)$/,
      /^(direccion|domicilio|calle|numero|colonia|codigo postal|cp|piso|depto|departamento)( (postal|particular|1|2))?$/,
    ],
    exceptions: [/(^| )(ip|web|url|website|email|correo)( |$)/],
  },
  {
    // ADDED BY THE OPERATOR (2026-11-16): dates of birth.
    key: "date_of_birth",
    patterns: [
      /^(date of birth|birth ?date|birthday|dob|d o b|born|born on|date born)$/,
      /^(fecha de nacimiento|fecha nacimiento|f nacimiento|fec nac|fecha nac|nacimiento|cumpleanos|dia de nacimiento)$/,
    ],
    exceptions: [],
  },
  {
    // ADDED BY THE OPERATOR (2026-11-16): government ID numbers.
    key: "government_id",
    patterns: [
      /^(ssn|ss ?no|social security( number| no| #)?|sin|social insurance( number)?|tax ?id|taxpayer id( number)?|tin|itin|ein|national id( number)?|national insurance( number)?|nino|passport( number| no)?|drivers? licen[cs]e( number| no)?|driving licen[cs]e( number)?|dl( number| no)?|state id( number)?|government id( number)?|id number|id card( number)?)$/,
      /^(curp|rfc|dni|nie|nif|ine|clave de elector|cedula( de identidad| de ciudadania)?|numero de identificacion|documento de identidad|pasaporte|numero de pasaporte|licencia de (conducir|manejo)|numero de seguro social|nss)$/,
    ],
    exceptions: [],
  },
];

/** The category a header falls in, or null when the column is kept. */
export function headerCategory(header) {
  const h = normalizeHeader(header);
  if (!h) return null;
  for (const c of CATEGORIES) {
    if (c.patterns.some((p) => p.test(h)) && !c.exceptions.some((x) => x.test(h))) return c.key;
  }
  return null;
}

const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_VALUE = /^\+?[\d\s().-]{7,20}$/;
const SSN_VALUE = /^\d{3}-\d{2}-\d{4}$/;
// A date is never a phone number: ISO 2023-10-01 and 10/01/2023 / 01-10-23 carry enough digits and
// separators to pass the phone shape, and a "Joined" column of dates was withheld until this line.
const DATE_VALUE = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})$/;
/** The value net (signed, note 4): at least half of the column's non-empty cells look like an email,
 *  a phone number or an SSN. A phone must carry at least 7 digits, so a year or a count never matches. */
export function valueCategory(values) {
  const vals = values.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (vals.length === 0) return null;
  const half = (test) => vals.filter(test).length * 2 >= vals.length;
  if (half((v) => EMAIL_VALUE.test(v))) return "email_values";
  if (half((v) => SSN_VALUE.test(v))) return "government_id_values";
  if (half((v) => !DATE_VALUE.test(v) && PHONE_VALUE.test(v) && v.replace(/\D/g, "").length >= 7 && /[\s().+-]/.test(v))) return "phone_values";
  return null;
}

/** Withhold this column? Returns the reason (a category key) or null. */
export function withholdReason(header, values) {
  return headerCategory(header) ?? valueCategory(values);
}
