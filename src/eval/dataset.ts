import fs from 'fs';
import { evalDatasetSchema, loadAndValidate, type EvalDataset } from '../config-schemas';

export function loadEvalDataset(datasetPath: string): EvalDataset {
  return loadAndValidate(
    evalDatasetSchema,
    datasetPath,
    { name: 'empty', description: '', top_k: 5, corpus: [], cases: [] },
    'Eval',
  );
}

export function saveJsonReport(reportPath: string, report: unknown): void {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
