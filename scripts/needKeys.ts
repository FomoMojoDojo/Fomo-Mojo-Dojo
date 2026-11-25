// ── SP-565: A NEED IS FOUND BY ITS ID OR ITS LABEL, NEVER BY ITS SENTENCE ────────────────────────
//
// Six scripts used to find a need by lower-casing `odi_needs.desired_outcome` and matching it against
// the sentence in the frozen label corpus. That made every one of them fail the moment a need's
// wording was edited in place (SP-591, N13): the runner printed "—" for its key, the loader deferred
// its 330 labels as "not yet a row", and need-evidence-guard went RED with no data change at all.
//
// The corpus already has a stable name for every need — its key ("N13"). What was missing was a
// STORED link from that key to the row. `scripts/charter-need-keys.json` is that link, and this module
// is its only reader. The corpus keeps its own sentence for each key: that is the wording the labels
// were read against, and nothing compares it with the database any more.
export type NeedKeyFile = { company: string; source_corpus_md5?: string; keys: Record<string, string> };

export const DEFAULT_NEED_KEYS = new URL("./charter-need-keys.json", import.meta.url).pathname;

export class NeedKeys {
  readonly company: string;
  private readonly idByKey = new Map<string, string>();
  private readonly keyById = new Map<string, string>();

  constructor(file: NeedKeyFile) {
    if (!file || typeof file.company !== "string" || !file.keys || typeof file.keys !== "object") {
      throw new Error("need keys: the file needs a `company` and a `keys` map");
    }
    this.company = file.company;
    for (const [key, id] of Object.entries(file.keys)) {
      const other = this.keyById.get(id);
      // two labels on one row would let a second need's labels land on the first need's row
      if (other) throw new Error(`need keys: ${key} and ${other} both name row ${id}`);
      this.idByKey.set(key, id);
      this.keyById.set(id, key);
    }
  }

  /** The row id a label names, or undefined when that label has no row yet (a deferred P need). */
  idOf(key: string): string | undefined { return this.idByKey.get(key); }
  /** The label of a row, or undefined when the row carries none. */
  keyOf(id: string): string | undefined { return this.keyById.get(id); }
  /** The label of a row as the scripts print it: "—" for a row with no label. */
  label(id: string): string { return this.keyById.get(id) ?? "—"; }
  keys(): string[] { return [...this.idByKey.keys()]; }

  /** REFUSES unless every labelled id is a row of `company`. `rowIds` are that company's need ids. */
  assertRowsOf(company: string, rowIds: Iterable<string>): void {
    if (company !== this.company) {
      throw new Error(`need keys: the key file is for company ${this.company}, not ${company}`);
    }
    const have = new Set(rowIds);
    const stray = [...this.idByKey].filter(([, id]) => !have.has(id)).map(([k, id]) => `${k} → ${id}`);
    if (stray.length) throw new Error(`need keys: not a need row of company ${company}: ${stray.join(", ")}`);
  }
}

/** Reads a key file and REFUSES one written for another company. */
export async function loadNeedKeys(company: string, path: string = DEFAULT_NEED_KEYS): Promise<NeedKeys> {
  const keys = new NeedKeys(JSON.parse(await Deno.readTextFile(path)) as NeedKeyFile);
  if (keys.company !== company) {
    throw new Error(`need keys: ${path} is for company ${keys.company}, not ${company} — pass --keys=<file> for this company`);
  }
  return keys;
}
