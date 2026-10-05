import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { CamperImport, ImportField } from "../../api/camperImports";
import { ColumnMapping } from "./CamperImportPage";

/** The backend's camper import fields (GET /api/camper-imports/fields) incl. the optional second responsável (decision 38). */
const FIELDS: { key: ImportField; label: string }[] = [
  { key: "name", label: "Nome da criança" },
  { key: "birthDate", label: "Data de nascimento" },
  { key: "guardianName", label: "Nome do responsável" },
  { key: "guardianPhone", label: "Telefone do responsável" },
  { key: "guardian2Name", label: "Nome do 2º responsável" },
  { key: "guardian2Phone", label: "Telefone do 2º responsável" },
];

function record(): CamperImport {
  return {
    id: "imp-1", fileName: "kids.xlsx", fileType: "xlsx", status: "needs_mapping", dryRun: false,
    columns: [
      { source: "Nome", target: "name", confidence: 1, samples: ["Ana Paz"] },
      { source: "Nascimento", target: "birthDate", confidence: 1, samples: ["10/01/2016"] },
      { source: "Segundo contato", target: null, confidence: 0, samples: ["Davi Paz"] },
      { source: "Celular segundo contato", target: null, confidence: 0, samples: ["11 92222-1111"] },
    ],
    dictionaries: [], reviews: [], preview: [], skipped: [], createdItems: [], dateFunction: "", startedAt: "", finishedAt: null, error: "",
  };
}

describe("camper import mapping — second responsável columns", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
  });

  it("offers the second responsável as destinations and sends the chosen mapping", () => {
    const onSubmit = vi.fn();
    render(<I18nProvider><ColumnMapping record={record()} fields={FIELDS} busy={false} onSubmit={onSubmit} /></I18nProvider>);
    const rows = screen.getAllByRole("combobox");
    const [secondName, secondPhone] = rows;
    expect(within(secondName).getByRole("option", { name: "Nome do 2º responsável" })).toBeInTheDocument();
    expect(within(secondPhone).getByRole("option", { name: "Telefone do 2º responsável" })).toBeInTheDocument();
    fireEvent.change(secondName, { target: { value: "guardian2Name" } });
    fireEvent.change(secondPhone, { target: { value: "guardian2Phone" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ "Segundo contato": "guardian2Name", "Celular segundo contato": "guardian2Phone" }));
  });
});
