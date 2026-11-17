// S4 (2026-11-16): the operator-signed withheld-column rules, case by case — what each category would and
// would not catch. The examples are four-answers.md (b)'s, plus the two categories the operator added.
import { describe, it, expect } from "vitest";
import { headerCategory, valueCategory, withholdReason, normalizeHeader } from "../../../scripts/parser/xlsxWithhold.mjs";

describe("headers are normalised before matching", () => {
  it.each([["Teléfono", "telefono"], ["Phone_#", "phone"], ["  E-MAIL:  ", "e mail"], ["Address/Line 1", "address line 1"]])(
    "%s → %s", (h, n) => expect(normalizeHeader(h)).toBe(n));
});

describe.each([
  ["name", ["Name", "Full Name", "First_Name", "Donor name", "Surname", "Nombre", "Nombre completo", "Apellidos", "Nombre del donante"],
           ["Company Name", "Organization name", "Campaign Name", "Program name", "Event name", "File name", "Nombre de la empresa", "Nombre del programa"]],
  ["email", ["Email", "E-mail", "Email Address", "Donor email", "Correo", "Correo electrónico"],
            ["Email opt-in", "Emails sent", "Email open rate", "Correos enviados"]],
  ["phone", ["Phone", "Phone #", "Mobile", "Cell Phone", "Tel.", "Teléfono", "Celular", "Número de teléfono"],
            ["Phone calls made", "Calls", "Mobile app users"]],
  ["address", ["Address", "Mailing Address", "Address Line 1", "Street", "Zip", "Postal Code", "Dirección", "Domicilio", "Calle", "Código postal", "CP"],
              ["City", "State", "Country", "Region", "Ciudad", "Estado", "País", "IP address", "Web address", "URL"]],
  ["date_of_birth", ["Date of birth", "DOB", "Birthdate", "Birth date", "Birthday", "Fecha de nacimiento", "Fecha nac.", "Nacimiento", "Cumpleaños"],
                    ["Date", "Gift date", "Joined", "Age", "Fecha", "Fecha de donación", "Birth year of program"]],
  ["government_id", ["SSN", "Social Security Number", "Tax ID", "TIN", "EIN", "Passport No.", "Driver's License Number", "National ID", "ID number", "CURP", "RFC", "DNI", "Cédula", "Número de seguro social", "Pasaporte"],
                    ["ID", "Donor ID", "Record ID", "Gift ID", "Volunteer ID", "Member number", "Account"]],
])("%s", (category, catches, keeps) => {
  it.each(catches)(`catches "%s"`, (h) => expect(headerCategory(h)).toBe(category));
  it.each(keeps)(`keeps "%s"`, (h) => expect(headerCategory(h) === category).toBe(false));
});

describe("kept by ruling: ages, gift amounts and notes", () => {
  it.each(["Age", "Edad", "Gift amount", "Gifts FY25 ($)", "Notes", "Notas", "Comments"])("%s is kept", (h) => expect(headerCategory(h)).toBeNull());
});

describe("the value net (signed, note 4): half the filled cells look personal, whatever the header", () => {
  it("emails", () => expect(valueCategory(["a@b.org", "c@d.com", "", "n/a"])).toBe("email_values"));
  it("phones", () => expect(valueCategory(["(555) 201-3344", "+1 555 202 4455"])).toBe("phone_values"));
  it("SSNs", () => expect(valueCategory(["123-45-6789", "987-65-4321"])).toBe("government_id_values"));
  it("a contact column with an odd header is withheld by its values", () =>
    expect(withholdReason("Contacto", ["(555) 201-3344", "555.203.5566"])).toBe("phone_values"));
  it.each([[["2023-10-01", "2024-02-29"]], [["10/01/2023", "1/2/24"]], [["2019", "2020"]], [["1239936", "84000"]], [["V-101", "V-102"]]])(
    "dates, years, amounts and ids are not personal values: %j", (vals) => expect(valueCategory(vals)).toBeNull());
  it("under half does not trip it", () => expect(valueCategory(["a@b.org", "x", "y"])).toBeNull());
});
