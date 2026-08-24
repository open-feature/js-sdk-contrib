import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';

/** The two keywords Gherkin uses for an outline, which is how jest-cucumber tells one apart too. */
const OUTLINE_KEYWORDS = ['Scenario Outline', 'Scenario Template'];

/** The Examples rows of one Scenario Outline. */
export interface ExampleTable {
  /** The outline's own title, exactly as the feature file writes it, placeholders and all. */
  outline: string;
  /**
   * One entry per example row, keyed by Examples column header, across every Examples block of the
   * outline and in file order.
   *
   * That is the order in which jest-cucumber expands the rows into scenarios, which is what lets the
   * plan pair them up positionally.
   */
  rows: Record<string, string>[];
}

/**
 * Reads the Examples tables of a feature file.
 *
 * jest-cucumber parses the same file and throws this away: it substitutes each row into the
 * outline's steps and title and keeps only the result, so a report built from what it hands back
 * cannot say which row an outcome belongs to. The Examples row *is* the identity of an outline
 * scenario, and every language's report has to agree on it byte for byte, so it is read from the
 * feature file with the same Gherkin parser rather than reconstructed from an expanded title.
 *
 * Values are the cell contents as the parser produces them, as strings. Gherkin has no types, so
 * `1` is the string `"1"` and nothing here decides otherwise.
 */
export function readExampleTables(featurePath: string): ExampleTable[] {
  const parser = new Parser(new AstBuilder(randomUUID), new GherkinClassicTokenMatcher());
  const document = parser.parse(readFileSync(featurePath, 'utf8'));

  // A Rule groups scenarios under a heading; its children are outlines like any other. No canonical
  // feature uses one today, and silently ignoring them if one appears would drop scenarios.
  const children = (document.feature?.children ?? []).flatMap((child) =>
    child.rule ? child.rule.children : [child],
  );

  return children
    .flatMap((child) => (child.scenario ? [child.scenario] : []))
    .filter((scenario) => OUTLINE_KEYWORDS.includes(scenario.keyword))
    .map((outline) => ({
      outline: outline.name,
      rows: outline.examples.flatMap((examples) => {
        const headers = (examples.tableHeader?.cells ?? []).map((cell) => cell.value);

        return (examples.tableBody ?? []).map((row) => {
          if (row.cells.length !== headers.length) {
            throw new Error(
              `tck: ${featurePath}: the Examples row at line ${row.location.line} of ` +
                `"${outline.name}" has ${row.cells.length} cells but the header has ${headers.length}. ` +
                `A report identifies an outline scenario by its example row, so it cannot be built ` +
                `from a ragged table.`,
            );
          }

          return Object.fromEntries(headers.map((header, position) => [header, row.cells[position].value]));
        });
      }),
    }));
}
