import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {
    dataset: path.join(root, 'scripts', 'data', 'rag-eval-dataset.json'),
    mode: 'hybrid',
    provider: 'hash',
    topK: null,
    out: path.join(root, 'eval-results.json'),
    failUnder: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    switch (argv[i]) {
      case '--dataset':
        args.dataset = path.resolve(value);
        i++;
        break;
      case '--mode':
        args.mode = value;
        i++;
        break;
      case '--provider':
        args.provider = value;
        i++;
        break;
      case '--top-k':
        args.topK = Number(value);
        i++;
        break;
      case '--out':
        args.out = path.resolve(value);
        i++;
        break;
      case '--fail-under':
        args.failUnder = Number(value);
        i++;
        break;
      default:
        console.error(`Unknown argument: ${argv[i]}`);
        process.exit(1);
    }
  }
  return args;
}

function ensureBuilt() {
  const evalIndex = path.join(root, 'src', 'eval', 'index.js');
  if (!fs.existsSync(evalIndex)) {
    console.log('Build artifacts missing, running npm run build...');
    execSync('npm run build', { cwd: root, stdio: 'inherit' });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureBuilt();

  const { loadEvalDataset, vectorStoreRetriever, ingestCorpus, runEvaluation } = require(
    path.join(root, 'src', 'eval', 'index.js'),
  );
  const { VectorStore } = require(path.join(root, 'src', 'vector-store.js'));
  const { createEmbeddingProvider } = require(path.join(root, 'src', 'embeddings.js'));

  const dataset = loadEvalDataset(args.dataset);
  if (!Array.isArray(dataset.cases) || dataset.cases.length === 0) {
    console.error(`No eval cases found in ${args.dataset}`);
    process.exit(1);
  }

  const topK = args.topK ?? dataset.top_k;
  const provider = createEmbeddingProvider(args.provider, 256);
  const storePath = path.join(fs.mkdtempSync(path.join(root, '.eval-store-')), 'store.json');
  const store = new VectorStore(storePath, provider);
  await ingestCorpus(store, dataset.corpus);

  console.log(`RAG Evaluation`);
  console.log(
    `  dataset:   ${dataset.name} (${dataset.cases.length} cases, ${dataset.corpus.length} docs)`,
  );
  console.log(`  provider:  ${provider.name} (dim ${provider.dimension})`);
  console.log(`  mode/topK: ${args.mode} / ${topK}\n`);

  const report = await runEvaluation(
    { ...dataset, top_k: topK },
    vectorStoreRetriever(store, args.mode),
    {
      embed: (texts) => provider.embed(texts),
    },
  );

  fs.rmSync(path.dirname(storePath), { recursive: true, force: true });

  const fmt = (value) => String(value.toFixed(4)).padStart(8);
  console.log(
    'case'.padEnd(22) + 'recall@k  prec@k    hit@k     mrr@k     ctxP@k    faithful  relevancy',
  );
  for (const c of report.cases) {
    const row =
      c.id.padEnd(22) +
      fmt(c.recall_at_k ?? 0) +
      '  ' +
      fmt(c.precision_at_k) +
      '  ' +
      fmt(c.hit_rate_at_k) +
      '  ' +
      fmt(c.mrr_at_k) +
      '  ' +
      fmt(c.context_precision_at_k) +
      '  ' +
      fmt(c.faithfulness ?? 0) +
      '  ' +
      fmt(c.answer_relevancy ?? 0);
    console.log(row);
  }

  console.log('\naggregate'.padEnd(30));
  for (const [key, value] of Object.entries(report.aggregate)) {
    console.log('  ' + key.padEnd(26) + fmt(value));
  }

  fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${args.out}`);

  if (args.failUnder !== null) {
    if (report.aggregate.recall_at_k < args.failUnder) {
      console.error(
        `\nFAILED: aggregate recall@${topK} ${report.aggregate.recall_at_k.toFixed(4)} < threshold ${args.failUnder}`,
      );
      process.exit(1);
    }
    console.log(`PASSED quality gate: recall@${topK} >= ${args.failUnder}`);
  }
}

main().catch((error) => {
  console.error('Evaluation failed:', error.message);
  process.exit(1);
});
