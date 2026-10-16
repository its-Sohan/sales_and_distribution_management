import ts from 'typescript'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const directory = mkdtempSync(join(tmpdir(), 'hisab-tests-'))
try {
  symlinkSync(new URL('../node_modules', import.meta.url), join(directory, 'node_modules'), 'dir')
  const sources = [
    ['src/model.ts', 'model.mjs'],
    ['tests/fixtures/catalog.ts', 'catalog.mjs'],
    ['src/dateFormat.ts', 'dateFormat.mjs'],
    ['src/suppliersCopy.ts', 'suppliersCopy.mjs'],
    ['src/supplierReport.ts', 'supplierReport.mjs'],
    ['tests/supplierReport.test.ts', 'supplierReport.test.mjs'],
    ['src/purchaseReport.ts', 'purchaseReport.mjs'],
    ['tests/purchaseReport.test.ts', 'purchaseReport.test.mjs'],
    ['src/stockReport.ts', 'stockReport.mjs'],
    ['tests/stockReport.test.ts', 'stockReport.test.mjs'],
    ['src/backend.ts', 'backend.mjs'],
    ['src/auth.ts', 'auth.mjs'],
    ['worker/auth.ts', 'workerAuth.mjs'],
    ['tests/auth.test.ts', 'auth.test.mjs'],
    ['src/browserCleanup.ts', 'browserCleanup.mjs'],
    ['tests/backend.test.ts', 'backend.test.mjs'],
    ['tests/accountingIntegration.test.ts', 'accountingIntegration.test.mjs'],
    ['tests/d1Support.ts', 'd1Support.mjs'],
    ['tests/browserCleanup.test.ts', 'browserCleanup.test.mjs'],
    ['src/reportsModel.ts', 'reportsModel.mjs'],
    ['src/reportBrand.ts', 'reportBrand.mjs'],
    ['src/receiptFormat.ts', 'receiptFormat.mjs'],
    ['worker/validate.ts', 'validate.mjs'],
    ['worker/recalc.ts', 'recalc.mjs'],
    ['worker/inventory.ts', 'inventory.mjs'],
    ['worker/index.ts', 'workerIndex.mjs'],
    ['tests/model.test.ts', 'model.test.mjs'],
    ['tests/reportsModel.test.ts', 'reportsModel.test.mjs'],
    ['tests/receiptFormat.test.ts', 'receiptFormat.test.mjs'],
    ['tests/worker.test.ts', 'worker.test.mjs'],
  ]
  for (const [source, target] of sources) {
    const code = readFileSync(source, 'utf8')
      .replaceAll("'./auth'", source.startsWith('worker/') ? "'./workerAuth.mjs'" : "'./auth.mjs'")
      .replaceAll('../src/auth.ts', './auth.mjs')
      .replaceAll('../src/model.ts', './model.mjs')
      .replaceAll('../../src/model', './model.mjs')
      .replaceAll('./fixtures/catalog.ts', './catalog.mjs')
      .replaceAll('../src/backend.ts', './backend.mjs')
      .replaceAll('../src/browserCleanup.ts', './browserCleanup.mjs')
      .replaceAll('./d1Support.ts', './d1Support.mjs')
      .replaceAll('../src/receiptFormat.ts', './receiptFormat.mjs')
      .replaceAll('../src/reportsModel.ts', './reportsModel.mjs')
      .replaceAll('../src/supplierReport.ts', './supplierReport.mjs')
      .replaceAll('../src/purchaseReport.ts', './purchaseReport.mjs')
      .replaceAll("'./purchaseReport'", "'./purchaseReport.mjs'")
      .replaceAll('../src/stockReport.ts', './stockReport.mjs')
      .replaceAll("'./stockReport'", "'./stockReport.mjs'")
      .replaceAll("'./reportBrand'", "'./reportBrand.mjs'")
      .replaceAll("import logo from './assets/mic-logo.jpg'", `const logo = 'data:image/jpeg;base64,${readFileSync('src/assets/mic-logo.jpg').toString('base64')}'`)
      .replaceAll("'./dateFormat'", "'./dateFormat.mjs'")
      .replaceAll("'./suppliersCopy'", "'./suppliersCopy.mjs'")
      .replaceAll('../worker/validate.ts', './validate.mjs')
      .replaceAll('../worker/recalc.ts', './recalc.mjs')
      .replaceAll('../worker/index.ts', './workerIndex.mjs')
      .replaceAll('../src/model', './model.mjs')
      .replaceAll("'./model'", "'./model.mjs'")
      .replaceAll("'./validate'", "'./validate.mjs'")
      .replaceAll("'./recalc'", "'./recalc.mjs'")
      .replaceAll("'./inventory'", "'./inventory.mjs'")
      .replaceAll("'./index'", "'./workerIndex.mjs'")
    const { outputText } = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
    writeFileSync(join(directory, target), outputText)
  }
  const result = spawnSync(process.execPath, ['--test', '--experimental-test-isolation=none', ...process.argv.slice(2), join(directory, 'model.test.mjs'), join(directory, 'supplierReport.test.mjs'), join(directory, 'purchaseReport.test.mjs'), join(directory, 'stockReport.test.mjs'), join(directory, 'reportsModel.test.mjs'), join(directory, 'receiptFormat.test.mjs'), join(directory, 'worker.test.mjs'), join(directory, 'backend.test.mjs'), join(directory, 'accountingIntegration.test.mjs'), join(directory, 'auth.test.mjs'), join(directory, 'browserCleanup.test.mjs'), new URL('../tests/accountingRepair.test.mjs', import.meta.url).pathname], { stdio: 'inherit' })
  process.exitCode = result.status ?? 1
} finally { rmSync(directory, { recursive: true, force: true }) }
